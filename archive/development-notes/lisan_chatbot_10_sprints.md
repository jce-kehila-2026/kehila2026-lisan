# Lisan Chatbot — 10-Sprint Execution Plan

## الهدف العام

نقل الشات بوت من AI microservice منفصل إلى منتج طلابي متكامل داخل تطبيق Lisan.

الوضع الحالي حسب التدقيق:
- AI service موجود كـ FastAPI وفيه `POST /api/ai/chat`.
- الـAI engine أصبح modular: engine, provider, retrieval, guardrails, router, cache, schemas.
- الأداء الداخلي ممتاز في benchmark الحالي، لكن هذا لا يعني أن المنتج جاهز.
- main app ما زال لا يملك chat UI حقيقي.
- لا يوجد Express gateway/proxy بين frontend وAI service.
- لا يوجد تخزين محادثات.
- لا يوجد history UI.
- لا يوجد rate limiting حقيقي للشات.
- لا يوجد multi-turn memory.
- لا يوجد integration E2E حقيقي من login إلى chat response.

القرار الهندسي:
لا نبدأ بـsemantic RAG أو agent loop أو model comparison الآن. الأولوية هي product integration, security, persistence, UX, QA.

---

## Sprint 1 — Freeze Architecture + API Contract

### الهدف
تثبيت شكل النظام النهائي قبل كتابة كود كثير، حتى لا يتشتت المشروع بين AI service، Express backend، وReact frontend.

### الملفات المتوقعة
- `spec.md`
- `backend/src/routes/chat.js`
- `backend/src/controllers/chatController.js`
- `backend/src/services/aiChatService.js`
- `frontend/src/services/chat.js`
- `ai-service/services/chat_schemas.py` فقط إذا احتاج schema alignment

### المهام
1. راجع الـAI endpoint الحالي:
   - request fields
   - response fields
   - fallback fields
   - cache/router fields
2. ثبّت contract موحد بين:
   - React frontend
   - Express backend gateway
   - FastAPI ai-service
3. أضف ملف constants أو types إن كان مناسبًا.
4. وثّق environment variables المطلوبة:
   - `AI_SERVICE_URL`
   - `AI_SERVICE_TIMEOUT_MS`
   - `CHAT_RATE_LIMIT_WINDOW_MS`
   - `CHAT_RATE_LIMIT_MAX`
5. لا تغيّر منطق AI engine إلا عند الضرورة القصوى.

### Acceptance Criteria
- contract مكتوب بوضوح.
- لا يوجد تضارب بين أسماء الحقول: `answerHe`, `answerAr`, `fallbackUsed`, `fallbackReason`, `latencyMs`, `cacheHit`, `routerHit`.
- يوجد قرار واضح: frontend لا يستدعي ai-service مباشرة.
- spec يوضح أن Express backend هو entrypoint الوحيد للـfrontend.

### Tests
- لا يلزم test ثقيل.
- شغّل lint/type checks المتاحة إن وجدت.
- افحص يدويًا أن route names المخطط لها لا تتعارض مع routes موجودة.

### مخاطر
- بناء UI قبل contract سيؤدي إلى refactor لاحق.
- ترك الـfrontend يستدعي ai-service مباشرة يفتح مشكلة auth/security/cost.

---

## Sprint 2 — Authenticated Express Chat Gateway

### الهدف
إنشاء route في Express يكون المدخل الرسمي للشات من الواجهة.

### الملفات المتوقعة
- `backend/src/routes/chat.js`
- `backend/src/controllers/chatController.js`
- `backend/src/services/aiChatService.js`
- `backend/src/server.js`
- `backend/src/middleware/auth.js` إذا احتاج تعديل بسيط
- `backend/src/middleware/rateLimit.js` أو داخل route مباشرة

### المهام
1. أضف route:
   - `POST /api/chat`
2. اربطه في `backend/src/server.js`.
3. استخدم `requireAuth` حتى لا يكون الشات مفتوحًا.
4. تحقق من input:
   - `message` required string
   - trim
   - max length server-side
   - `level` default من user profile أو `"A1"`
   - `includeArabic` boolean
   - `conversationId` optional
5. استدعِ ai-service من backend فقط.
6. أضف timeout واضح للـAI request.
7. أخفِ تفاصيل ai-service errors عن frontend.
8. أعد response موحد دائمًا.

### Acceptance Criteria
- request بدون JWT يرجع `401`.
- request برسالة فارغة يرجع response منضبط أو validation error حسب القرار في spec.
- request صحيح يصل إلى FastAPI ويرجع answer.
- إذا ai-service down، لا ينهار backend، ويرجع fallback أو error typed.
- frontend لا يعرف AI service URL.

### Tests
- Backend route tests:
  - unauthorized request
  - valid request
  - empty message
  - ai-service timeout mock
  - ai-service error mock
- Manual curl:
  - `POST /api/chat` with token
  - `POST /api/chat` without token

### مخاطر
- mismatch بين Express payload وFastAPI schema.
- timeout طويل يجمّد تجربة الطالب.
- timeout قصير جدًا يسبب fallback زائد.

---

## Sprint 3 — Server-Side Chat Persistence

### الهدف
تخزين المحادثات والرسائل في Firestore من خلال Express backend فقط.

### الملفات المتوقعة
- `backend/src/services/chatPersistenceService.js`
- `backend/src/controllers/chatController.js`
- `backend/src/routes/chat.js`
- `backend/src/config/firebase.js`

### Firestore Schema

```txt
chatConversations/{conversationId}
  userId: string
  level: string
  title: string
  createdAt: timestamp
  updatedAt: timestamp
  lastMessageAt: timestamp
  lastMessagePreview: string
  messageCount: number
  deletedAt: timestamp | null

chatConversations/{conversationId}/messages/{messageId}
  userId: string
  role: "user" | "assistant"
  textHe: string | null
  textAr: string | null
  rawText: string | null
  fallbackUsed: boolean | null
  fallbackReason: string | null
  cacheHit: boolean | null
  routerHit: boolean | null
  latencyMs: number | null
  createdAt: timestamp
  clientMessageId: string | null
```

### المهام
1. عند أول message بدون `conversationId`:
   - أنشئ conversation.
   - احفظ user message.
   - استدعِ ai-service.
   - احفظ assistant message.
2. عند message مع `conversationId`:
   - تحقق أن conversation يخص `req.user.uid`.
   - احفظ user message.
   - استدعِ ai-service.
   - احفظ assistant message.
3. حدّث metadata:
   - `updatedAt`
   - `lastMessageAt`
   - `lastMessagePreview`
   - `messageCount`
4. أضف idempotency اختياري عبر `clientMessageId` لمنع duplicate عند retry.
5. لا تخزن:
   - full prompt
   - API keys
   - full retrieved chunks
   - provider raw error stack

### Acceptance Criteria
- كل رسالة user/assistant محفوظة.
- refresh لا يضيع conversation.
- user لا يستطيع الكتابة داخل conversation ليست له.
- إذا فشل AI call، يتم حفظ user message وحفظ assistant fallback/error typed حسب spec.
- لا يوجد direct frontend Firestore write للشات.

### Tests
- create conversation
- append message
- owner check
- duplicate clientMessageId
- AI error persistence
- Firestore service unit tests أو integration mocks

### مخاطر
- duplication عند ضغط send مرتين.
- تخزين metadata زائد وغير ضروري.
- cross-user access إذا نسيت owner check.

---

## Sprint 4 — Frontend Chat UI MVP

### الهدف
استبدال placeholder `/chatbot` بواجهة شات حقيقية قابلة للاستخدام.

### الملفات المتوقعة
- `frontend/src/pages/ChatbotPage.jsx`
- `frontend/src/components/chat/ChatWindow.jsx`
- `frontend/src/components/chat/ChatMessage.jsx`
- `frontend/src/components/chat/ChatComposer.jsx`
- `frontend/src/components/chat/ChatEmptyState.jsx`
- `frontend/src/services/chat.js`
- `frontend/src/App.jsx`
- `frontend/src/i18n/...` إذا احتاج نصوص

### المهام
1. بناء page حقيقية بدل placeholder.
2. message list:
   - user bubble
   - assistant bubble
   - fallback display طبيعي
3. composer:
   - textarea أو input
   - send button
   - enter-to-send
   - shift+enter newline إذا مناسب
4. loading state:
   - disable send أثناء الطلب
   - typing indicator بسيط
5. error state:
   - service unavailable
   - unauthorized
   - validation
6. دعم RTL:
   - العبرية تظهر باتجاه صحيح
   - العربية تظهر باتجاه صحيح
   - layout لا ينكسر
7. منع double-send.
8. scroll إلى آخر رسالة.

### Acceptance Criteria
- الطالب يستطيع إرسال سؤال واستلام جواب.
- الرسائل تظهر فورًا optimistic أو بعد الحفظ حسب القرار.
- لا يوجد double submission.
- fallback لا يظهر كـcrash.
- يعمل على mobile viewport.
- يستخدم `/api/chat` فقط وليس ai-service مباشرة.

### Tests
- Manual UI flow:
  - login
  - open chatbot
  - send valid Hebrew
  - send Arabic/English/out-of-scope
  - repeat same question
  - refresh page
- Frontend component tests إن كانت setup جاهزة.
- Performance:
  - no unnecessary re-render loops
  - input stays responsive

### مخاطر
- display direction بين العربية والعبرية.
- UI يركز على الشكل وينسى حالات الخطأ.
- send button يسمح بطلبات متكررة.

---

## Sprint 5 — Chat History + Conversation Resume

### الهدف
تحويل الشات إلى تجربة قابلة للاستمرار، وليس جلسة مؤقتة تضيع مع refresh.

### الملفات المتوقعة
- `backend/src/routes/chat.js`
- `backend/src/controllers/chatController.js`
- `backend/src/services/chatPersistenceService.js`
- `frontend/src/components/chat/ConversationList.jsx`
- `frontend/src/components/chat/ConversationSidebar.jsx`
- `frontend/src/services/chat.js`

### API مقترح
```http
GET /api/chat/conversations
GET /api/chat/conversations/:conversationId
DELETE /api/chat/conversations/:conversationId
```

### المهام
1. endpoint لجلب conversations الخاصة بالمستخدم.
2. endpoint لجلب messages داخل conversation.
3. endpoint لحذف conversation soft delete.
4. UI:
   - new chat
   - previous conversations
   - resume conversation
   - empty state
5. titles:
   - أول رسالة مختصرة
   - أو title ثابت: `Hebrew practice`

### Acceptance Criteria
- المستخدم يرى محادثاته فقط.
- يستطيع فتح محادثة قديمة.
- يستطيع بدء محادثة جديدة.
- حذف conversation لا يحذف بيانات مستخدم آخر.
- history لا يبطّئ فتح صفحة الشات.

### Tests
- list own conversations
- cannot fetch another user's conversation
- resume messages order
- delete own conversation
- cannot delete another user's conversation

### مخاطر
- تحميل messages كثيرة مرة واحدة.
- عدم ترتيب الرسائل حسب `createdAt`.
- استعمال client-side filtering بدل server-side ownership.

---

## Sprint 6 — Security + Rate Limiting + Service Boundary

### الهدف
إغلاق الثغرات الأساسية قبل demo أو pilot.

### الملفات المتوقعة
- `backend/src/routes/chat.js`
- `backend/src/server.js`
- `backend/src/middleware/chatRateLimit.js`
- `ai-service/routes/chat.py` إذا سيتم إضافة shared secret
- `backend/.env.example`
- `ai-service/.env.example`

### المهام
1. rate limit على `/api/chat`.
2. request body size limit مناسب.
3. backend يضيف shared secret header عند استدعاء ai-service:
   - `X-Internal-Service-Secret`
4. ai-service يرفض request بدون secret إذا كان سيبقى reachable.
5. logging آمن:
   - لا تسجل API keys
   - لا تسجل full prompt
   - لا تسجل stack كامل للمستخدم
6. راجع Firestore rules:
   - بما أن الشات server-side، لا تعتمد على direct client rules للشات.
7. أضف CORS واضح.

### Acceptance Criteria
- anonymous request blocked.
- burst traffic limited.
- direct call للـAI service بدون secret مرفوض إذا مطبّق.
- logs مفيدة وآمنة.
- لا يوجد service URL في frontend.

### Tests
- unauthorized blocked
- rate limit triggered
- direct ai-service without secret rejected
- backend with secret accepted
- no sensitive data in logs

### مخاطر
- shared secret يكسّر local dev إذا لم يوثق جيدًا.
- rate limit شديد يضر demo.
- الاعتماد على Firestore open rules خطر إن بقيت direct writes موجودة في أماكن أخرى.

---

## Sprint 7 — AI Reliability Hardening

### الهدف
تقوية الاعتمادية في AI path بدون فتح مشاريع AI جديدة.

### الملفات المتوقعة
- `ai-service/services/chat_provider.py`
- `ai-service/services/chat_engine.py`
- `ai-service/services/chat_guardrails.py`
- `ai-service/services/chat_cache.py`
- `ai-service/tests/...`
- `ai-service/evals/...`

### المهام
1. أضف structured logs في chat path:
   - latency
   - fallbackUsed
   - fallbackReason
   - cacheHit
   - routerHit
   - provider
   - chunks count
2. أضف provider failure classification:
   - timeout
   - quota/429
   - invalid key
   - network
   - unknown
3. أضف circuit breaker بسيط:
   - بعد N failures خلال window
   - fallback مباشر لفترة قصيرة
4. راجع fallback texts.
5. ثبّت `includeArabic` بسيناريوهات eval.
6. لا تضف multi-provider failover إلا إذا بسيط وآمن.

### Acceptance Criteria
- provider down لا يسبب crash.
- quota/429 تظهر كسبب واضح داخليًا.
- circuit breaker يحمي من repeated slow failures.
- fallback response سريع.
- لا تدهور في benchmark.

### Tests
- mock provider timeout
- mock 429
- mock invalid key
- circuit breaker opens/closes
- benchmark remains within thresholds:
  - avg HTTP reasonable
  - cache hits under 100ms
  - no crashes
  - 0 vocabulary leakage

### مخاطر
- circuit breaker خاطئ يمنع LLM حتى بعد رجوع الخدمة.
- logging زائد يبطئ الطلب.
- overengineering على حساب integration.

---

## Sprint 8 — Evaluation Harness + Integrated QA

### الهدف
تحويل الاختبارات من AI-only إلى full product verification.

### الملفات المتوقعة
- `ai-service/evals/run_chat_eval.py` إذا غير موجود
- `backend/tests/chat...`
- `frontend/tests/chat...` إذا test setup موجود
- `e2e/chatbot-smoke...` أو `scripts/chatbot-smoke...`
- `docs/CHATBOT_QA_REPORT.md`

### المهام
1. أضف أو أصلح unified eval harness:
   - يستخدم dataset 100+ حالة
   - يخرج markdown/json report
2. Backend integration tests:
   - auth
   - gateway
   - persistence
   - owner checks
3. Frontend smoke:
   - login/mock token
   - open chat
   - send message
   - see response
4. Provider-down scenario:
   - backend/ai-service يرجع fallback/error نظيف
5. Performance report:
   - gateway latency
   - AI latency
   - persistence overhead

### Acceptance Criteria
- يوجد command واضح لتشغيل AI eval.
- يوجد command واضح لاختبار backend chat.
- يوجد smoke flow من UI أو script.
- report يوضح pass/fail وأسباب الفشل.
- أي regression في fallback/leakage/latency واضح.

### Tests
- AI eval
- backend tests
- frontend/manual smoke
- provider-down smoke
- repeated question cache scenario

### مخاطر
- الاعتماد على live LLM يجعل tests flaky.
- عدم فصل unit tests عن live-provider eval.
- قياس latency من بيئة غير مستقرة بدون توضيح.

---

## Sprint 9 — UX Polish + Learning Quality

### الهدف
رفع تجربة الطالب بدون تعقيد AI architecture.

### الملفات المتوقعة
- `frontend/src/components/chat/...`
- `frontend/src/i18n/...`
- `backend/src/services/chatPersistenceService.js`
- `ai-service/services/chat_engine.py` فقط إذا needed for suggestions

### المهام
1. أضف suggested next prompts بسيطة:
   - من backend أو frontend static حسب fallback/answer.
2. حسّن empty state:
   - أمثلة أسئلة بالعبرية البسيطة.
3. أضف Arabic explanation toggle:
   - `includeArabic`
4. اجعل fallback تعليمي وليس رفضًا فقط.
5. حسّن mobile:
   - composer fixed bottom
   - readable bubbles
   - no keyboard overlap قدر الإمكان
6. أضف small metadata للـdebug في dev فقط:
   - cacheHit
   - routerHit
   - latencyMs

### Acceptance Criteria
- الطالب يعرف ماذا يسأل.
- fallback يوجه الطالب بدل أن يوقفه.
- Arabic explanation لا يظهر إلا عند الطلب.
- UI سريع وواضح.
- dev metadata لا تظهر في production إلا إذا مقصودة.

### Tests
- Arabic toggle
- suggested prompts click
- fallback UX
- mobile viewport
- repeated messages performance

### مخاطر
- إضافة suggestions من LLM تزيد latency بلا داعي.
- عرض metadata للطالب يربكه.
- زيادة UI polish قبل استقرار QA.

---

## Sprint 10 — Demo Readiness + Documentation + Handoff

### الهدف
تجهيز المشروع للعرض أو التسليم بثقة.

### الملفات المتوقعة
- `README.md` أو docs root
- `docs/CHATBOT_ARCHITECTURE.md`
- `docs/CHATBOT_DEMO_SCRIPT.md`
- `docs/CHATBOT_LIMITATIONS.md`
- `docs/CHATBOT_QA_REPORT.md`
- `.env.example` files

### المهام
1. وثّق local startup:
   - frontend
   - backend
   - ai-service
2. وثّق architecture:
   - React → Express → FastAPI → provider
   - Express → Firestore
3. وثّق API contract.
4. وثّق demo script:
   - login
   - open chat
   - valid A1 question
   - Arabic explanation
   - out-of-scope fallback
   - repeated question/cache
   - history resume
5. وثّق limitations بصراحة:
   - ليس agent حقيقي
   - لا semantic RAG
   - لا multi-turn model memory
   - A1-first
   - lexical retrieval
6. جهّز final QA checklist.

### Acceptance Criteria
- شخص آخر يستطيع تشغيل المشروع من docs.
- demo script قابل للتنفيذ.
- limitations واضحة وليست مخفية.
- كل commands المهمة مكتوبة.
- لا توجد ادعاءات غير مثبتة.

### Tests
- اتبع docs من terminal جديد.
- شغّل smoke demo.
- افحص env examples.
- تأكد من عدم وجود secrets في repo.

### مخاطر
- docs تدعي أكثر من الواقع.
- نسيان تشغيل ai-service في demo.
- الاعتماد على provider live بدون fallback demo.

---

## Final Milestones

### بعد Sprint 3
الشات موجود server-side ومحادثاته محفوظة.

### بعد Sprint 4
الطالب يستطيع استخدام الشات من الواجهة.

### بعد Sprint 6
الشات محمي من الاستعمال المفتوح ومناسب لديمو داخلي.

### بعد Sprint 8
عندك QA حقيقي وليس ثقة كلامية.

### بعد Sprint 10
المشروع جاهز كـstudent-facing chatbot MVP محترم.

---

## What Not To Do Before Sprint 10

- لا تبدأ semantic embeddings.
- لا تبني agent loop.
- لا تضف tool use.
- لا تعمل admin dashboard.
- لا تضف multi-turn memory داخل prompt.
- لا تعمل model comparison إلا إذا فشل Gemini فعليًا.
- لا تصرف وقت كبير على UI animations قبل الاستقرار.
