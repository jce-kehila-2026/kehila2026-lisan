# شرح تفصيلي لنظام Lisan AI Service

هذا الملف مخصص للتحضير للعرض النهائي والدفاع التقني. الفكرة الأساسية التي يجب تثبيتها:

**Lisan AI Service مش موديل واحد. هو طبقة تعليم ذكية بين الطالب والـ LLM.**

يعني الطالب لا يتكلم مباشرة مع Gemini. الطلب يمر داخل pipeline تعليمي كامل:

```text
تنظيف input
-> تحقق وحماية
-> فهم مستوى الطالب والسياق
-> محاولة رد محلي أو cache
-> بحث في محتوى المنهج RAG
-> بناء prompt تعليمي
-> استدعاء الموديل عند الحاجة فقط
-> فحص الرد وتنظيمه
-> تخزينه وعرضه أو تشغيله صوتيا
```

الجملة الذهبية للعرض:

> نحن لم نبن Chatbot فقط. بنينا AI teaching pipeline مخصص لتعليم العبرية للطلاب العرب.

---

## 0. الصورة الكبيرة للنظام

### ماذا يحدث من لحظة إرسال الطالب رسالة؟

```text
Student
  -> Frontend React
  -> Backend Express
  -> AI Service FastAPI
  -> Guardrails / Cache / RAG / Memory
  -> Gemini أو مزود آخر عند الحاجة
  -> Post-processing
  -> Backend يخزن المحادثة
  -> Frontend يعرض الرد أو يشغله صوتيا
```

### لماذا فصلنا النظام إلى ثلاث طبقات؟

عندنا ثلاث مسؤوليات مختلفة:

1. **Frontend**
   يعرض تجربة الطالب: الشات، الصوت، الأزرار، السيناريوهات، الألعاب، والواجهات.

2. **Backend**
   يدير المستخدمين، الصلاحيات، Firebase، المحادثات، التخزين، token usage، والربط الآمن مع AI Service.

3. **AI Service**
   يحتوي الذكاء اللغوي: فهم الرسالة، RAG، prompt engineering، اختيار مزود الذكاء، التصحيح، الصوت، والـ guardrails.

### لماذا هذا أفضل معماريا؟

لأن كل طبقة لها مسؤولية واضحة. الواجهة لا تعرف مفاتيح AI. والـ Backend لا يحتوي منطق اللغة. والـ AI Service مستقل ويمكن تطويره أو استبدال مزود الذكاء بدون كسر باقي النظام.

لو سألوك:

> لماذا لم تضعوا الذكاء داخل الـ Backend؟

جاوب:

> لأن منطق الذكاء اللغوي معقد ومتغير: RAG، prompt، voice، provider fallback، cache، وguardrails. لذلك عزلناه في خدمة Python مستقلة مبنية بـ FastAPI، بينما بقي الـ Backend مسؤولا عن المستخدمين والتخزين والصلاحيات. هذا يجعل النظام أنظف وأسهل للتطوير والاختبار.

---

## 1. API Layer

### ما هي هذه الطبقة؟

هذه هي بوابة AI Service. السيرفر مبني بـ **FastAPI** داخل `ai-service/main.py`، والـ routes الأساسية في `ai-service/routes/chat.py`.

الـ API layer تستقبل طلبات مثل:

- `POST /api/ai/chat`
- `POST /api/ai/chat/stream`
- `POST /api/ai/chat/voice`
- `POST /api/ai/chat/transcribe`
- `POST /api/ai/chat/tts`
- `GET /api/ai/ready`
- `GET /api/ai/health`
- `GET /api/ai/analytics`
- `GET /api/ai/logs`
- `GET /api/ai/scenario/{scenario_id}`

### كيف تعمل حرفيا؟

1. FastAPI يستقبل HTTP request.
2. route يتحقق من headers والصلاحية.
3. يحول body إلى schema واضح مثل `ChatRequest`.
4. يستدعي دالة داخل service layer مثل `generate_chat_response`.
5. يرجع JSON منظم للـ Backend.

مثال في الشات النصي:

```text
Backend calls:
POST /api/ai/chat

AI Service:
verify auth/internal secret
-> generate_chat_response(payload)
-> return ChatResponse
```

### التكنولوجيا المستخدمة

- **FastAPI**
- **Pydantic schemas**
- **Uvicorn**
- **Python**

### لماذا FastAPI اختيار ممتاز هنا؟

FastAPI مناسب جدا لخدمات الذكاء الاصطناعي للأسباب التالية:

- مبني للـ APIs السريعة والمنظمة.
- يدعم async بشكل طبيعي.
- يتكامل مع Pydantic للتحقق من شكل البيانات.
- يولد documentation تلقائيا مثل `/docs`.
- Python هي البيئة الطبيعية لمعظم مكتبات AI وNLP وSTT مثل Whisper وAzure SDK.
- سهل فصله كسيرفس مستقلة عن Backend JavaScript.

### كيف تشرحها للجنة؟

> الـ API Layer هي بوابة خدمة الذكاء. استخدمنا FastAPI لأنه سريع، منظم، ويعطينا schemas واضحة للطلبات والردود. هذه الطبقة لا تحتوي منطق العرض أو التخزين؛ وظيفتها استقبال الطلب، التحقق منه، ثم تمريره إلى طبقة الذكاء.

---

## 2. Security Layer

### ما هي المشكلة التي تحلها؟

لا نريد أن يستطيع أي شخص من المتصفح أن يستدعي AI Service مباشرة أو يستخدم مفاتيح الذكاء الاصطناعي. لذلك جعلنا الـ Backend هو البوابة الآمنة.

### كيف تعمل حرفيا؟

في `routes/chat.py` توجد دوال مثل:

- `require_internal_service_secret`
- `verify_jwt_token`

الطلب القادم إلى AI Service يجب أن يحمل واحدا من التالي:

1. **Internal service secret**
   يرسله الـ Backend في header:

```text
X-Internal-Service-Secret: ...
```

2. **JWT Authorization**
   إذا كان مطلوبا التحقق من المستخدم:

```text
Authorization: Bearer <token>
```

3. **X-User-ID**
   يستخدم للتأكد أن userId في الهيدر مطابق للـ JWT عندما يكون موجودا.

### لماذا هذا مهم؟

لأنه يمنع:

- استدعاء AI Service مباشرة من مستخدم مجهول.
- استهلاك quota الذكاء الاصطناعي من خارج التطبيق.
- كشف مفاتيح Gemini أو Azure للمتصفح.
- تجاوز صلاحيات الـ Backend.

### التكنولوجيا المستخدمة

- JWT
- internal shared secret
- FastAPI headers
- Backend proxy pattern

### لماذا هذا أفضل اختيار؟

لأن AI Service ليست service عامة للإنترنت. هي خدمة داخلية في النظام. أفضل نمط هنا هو:

```text
Frontend -> Backend -> AI Service
```

وليس:

```text
Frontend -> AI Service directly
```

بهذه الطريقة نتحكم في كل شيء من Backend: المستخدم، الصلاحيات، rate limit، التخزين، وربط المحادثة.

### جواب جاهز للجنة

> الـ AI Service ليست مفتوحة مباشرة للمستخدمين. كل طلب يمر عبر الـ Backend، والـ Backend يضيف secret داخلي ويمرر JWT المستخدم. هذا يحمي مفاتيح الذكاء الاصطناعي ويجعل التحكم بالصلاحيات مركزيا.

---

## 3. Request Schema

### ما هو Request Schema؟

هو الشكل الرسمي للطلب الذي يدخل إلى AI Service. في `services/chat_schemas.py` لدينا `ChatRequest`.

الطلب يحتوي:

```text
message: نص الطالب
level: مستوى الطالب مثل A1 أو A2 أو B1 أو B2
includeArabic: هل نسمح بشرح عربي مختصر
voiceMode: هل الطلب صوتي
sessionId: رقم المحادثة
userId: رقم المستخدم
scenario: السيناريو النشط إن وجد
```

### لماذا لا نرسل النص فقط؟

لو أرسلنا النص فقط، الموديل لا يعرف:

- هل الطالب مبتدئ أم متقدم؟
- هل هذه محادثة صوتية تحتاج رد قصير؟
- هل يوجد سيناريو مطعم أو عيادة؟
- هل هذه الرسالة جزء من نفس المحادثة؟
- هل نحتاج شرح عربي؟

### كيف يعمل حرفيا؟

عندما يصل الطلب، يتم بناء `ChatRequestContext` داخل `chat_engine.py`.

هذا context يحتوي نسخة منظمة من الطلب:

- الرسالة بعد التنظيف.
- المستوى normalized.
- cache key.
- provider/model.
- voice mode.
- session id.
- user id.
- scenario.

بعدها كل مراحل الـ pipeline تستخدم هذا الـ context بدل التعامل مع input عشوائي.

### التكنولوجيا المستخدمة

- Pydantic BaseModel
- typed request objects
- internal dataclass `ChatRequestContext`

### لماذا هذا اختيار ممتاز؟

لأن AI systems تحتاج ضبط شديد لشكل البيانات. Pydantic يمنع طلبات ناقصة أو غير مفهومة، ويسهل اختبار كل حالة.

### جواب جاهز

> نحن لا نرسل الرسالة وحدها للموديل. نبني request context يحتوي المستوى، الجلسة، المستخدم، وضع الصوت، والسيناريو. هذا يسمح للنظام بإرجاع رد مخصص وليس رد عام.

---

## 4. Input Cleaning / Sanitization

### ما المشكلة؟

اللغات RTL مثل العربية والعبرية قد تحتوي رموزا غير مرئية:

- zero-width characters
- bidi directional marks
- Hebrew maqaf
- مسافات غريبة
- نص مخفي أو مشوش

هذه الرموز قد تسبب:

- prompt injection
- فشل في regex
- تخريب cache key
- سوء فهم للغة
- ردود غير متوقعة

### كيف يعمل حرفيا؟

قبل أي خطوة، `sanitize_input` ينظف النص:

1. يحاول إصلاح encoding عبر `ftfy` إن كان متاحا.
2. يحذف zero-width characters.
3. يحذف directional marks.
4. يحول maqaf العبري إلى space.
5. يضغط المسافات المتعددة إلى مسافة واحدة.

بعدها كل النظام يرى نفس النسخة النظيفة من الرسالة.

### التكنولوجيا المستخدمة

- Python regex
- Unicode-aware text cleaning
- optional `ftfy`

### لماذا هذه أفضل طريقة؟

لأن الحماية لا يجب أن تعتمد على الموديل. أفضل مكان لمعالجة input الضار أو المشوش هو قبل دخوله إلى أي logic أو LLM. وهذا يعطي deterministic behavior.

### مثال بسيط

لو كتب المستخدم كلمة عبرية وبين حروفها zero-width joiner، العين لا تراه، لكن الكود يراه كشيء مختلف. التنظيف يجعلها كلمة عادية.

### جواب جاهز

> قبل أن نثق بأي input، ننظفه من رموز مخفية ومشاكل Unicode. هذا مهم خصوصا لأن العربية والعبرية لغات RTL، وقد تظهر رموز اتجاه أو zero-width لا يراها المستخدم لكنها تؤثر على التحليل.

---

## 5. Local-First Layer

### ما المقصود بـ Local First؟

يعني النظام لا يستدعي Gemini مباشرة لكل رسالة. أولا يحاول أن يجيب محليا بدون LLM.

أمثلة على ردود ممكنة محليا:

- تحية مثل שלום.
- شكر.
- معنى كلمة بسيطة.
- سؤال معروف من المنهج.
- رد ثابت.
- رفض منظم لرسالة خارج النطاق.
- cached answer.

### كيف يعمل حرفيا؟

داخل `generate_chat_response`:

1. يبني context.
2. يتحقق هل هناك scenario.
3. يفحص اللغة.
4. يحاول gatekeeper.
5. يحاول hard reject.
6. يبحث في cache.
7. يحاول pre-LLM responses.
8. يحاول deterministic router.
9. فقط إذا لم تنجح هذه المراحل، ينتقل إلى RAG + LLM.

### لماذا هذا مهم جدا؟

لأن LLM مكلف وبطيء مقارنة بالرد المحلي. حتى لو كان free tier، عندك quotas وحدود. Local-first يقلل:

- التكلفة.
- latency.
- الضغط على Gemini.
- احتمال أخطاء الموديل في الأسئلة السهلة.

### التكنولوجيا المستخدمة

- Python deterministic rules
- intent gatekeeper
- regex/token matching
- cache lookup
- local templates

### لماذا هذا أفضل من إرسال كل شيء للموديل؟

لأن الأسئلة السهلة لا تحتاج ذكاء عميق. إذا الطالب كتب "שלום"، لا داعي لاستدعاء LLM. الرد المحلي أسرع وأكثر استقرارا. أما المحادثات الحقيقية والأسئلة السياقية فتذهب للموديل.

### جواب جاهز

> صممنا النظام local-first. الأسئلة البسيطة والمتكررة تخدم محليا أو من cache، والموديل يستخدم فقط عندما نحتاج فهما سياقيا أو محادثة تعليمية حقيقية. هذا يقلل التكلفة ويزيد السرعة والاستقرار.

---

## 6. Cache Layer

### ما وظيفة الكاش؟

الكاش يحفظ ردودا آمنة ومتكررة حتى لا نعيد حسابها أو نرسلها للموديل.

لكن في الشات التعليمي يوجد خطر: نفس الجملة قد تعني شيئا مختلفا حسب السياق.

مثال:

```text
الطالب: אני רוצה פיצה
البوت: איזה גודל?
الطالب: גדול
```

كلمة "גדול" وحدها تعتمد على السياق. لا يجوز تخزين رد عام لها لكل المستخدمين.

### كيف يعمل الكاش حرفيا؟

النظام عنده أكثر من نوع:

1. **Exact cache**
   يعتمد على hash للرسالة normalized + المستوى + includeArabic.

2. **Response cache manager**
   يخزن الردود بمدة TTL وعدد entries محدود.

3. **Redis optional**
   إذا Redis موجود، يستخدمه. إذا لا، يستخدم memory داخل العملية.

4. **Semantic cache optional**
   للأسئلة ذات النية الآمنة مثل معنى كلمة أو ترجمة أو مثال.

5. **Canonical cache**
   يقلل التكرار عندما تكون صياغات مختلفة تعني نفس النية.

### ماذا يتم تخزينه؟

يتم تخزين الردود الآمنة:

- معنى كلمة.
- تحية.
- ردود deterministic.
- أسئلة ثابتة.

ولا يتم تخزين:

- ردود تعتمد على history.
- سيناريوهات role-play.
- fallback بسبب provider timeout.
- أخطاء transient.

### التكنولوجيا المستخدمة

- Python in-memory cache
- optional Redis
- SHA1 normalized keys
- TTL
- LRU style eviction
- optional FAISS/diskcache للsemantic cache

### لماذا هذا اختيار ممتاز؟

لأنه يعطي أفضل توازن:

- يعمل محليا بدون بنية تحتية إضافية.
- يمكن أن يتوسع بـ Redis في الإنتاج.
- يمنع cross-session leakage.
- يخفض LLM calls بشكل كبير.

### جواب جاهز

> استخدمنا cache بذكاء وليس بشكل عشوائي. لا نخزن كل المحادثات لأن بعض الردود تعتمد على السياق. نخزن فقط الردود الآمنة مثل معاني الكلمات والتحيات، وبذلك نحصل على سرعة وتوفير بدون كسر معنى المحادثة.

---

## 7. RAG Layer

### ما هو RAG؟

RAG يعني:

```text
Retrieval-Augmented Generation
```

أي أن النظام لا يعتمد فقط على معرفة الموديل العامة. قبل استدعاء الموديل يبحث في منهج Lisan ويضيف المقاطع المناسبة إلى الـ prompt.

### لماذا نحتاج RAG؟

لأن Gemini يعرف عبري بشكل عام، لكنه لا يعرف بالضرورة:

- منهجكم.
- كلمات A1 المحددة عندكم.
- سياقات الدروس.
- transcript الموجود في المنصة.
- أهداف الطالب في هذا المستوى.

RAG يجعل الرد grounded في محتوى المنهج.

### كيف يعمل حرفيا؟

في `chat_retrieval.py`:

1. يحدد المستوى مثل A1.
2. يحاول تحميل transcripts من Backend:

```text
GET /api/transcripts/level/{level}
```

3. إذا Backend غير متاح، يرجع لملفات محلية داخل `ai-service/data/transcripts`.
4. يستخرج vocabulary من transcripts.
5. يقسم النصوص إلى chunks.
6. يبني sparse embeddings محلية.
7. عند وصول سؤال، يحسب التشابه بين السؤال والchunks.
8. يختار أفضل chunks.
9. يحولها إلى context نصي يدخل في system prompt.

### كيف يتم retrieval؟

النظام يستخدم مزيجا من:

- Hebrew token overlap
- character trigrams
- sparse embedding
- cosine similarity
- phrase bonus
- source overlap
- keyword fallback

يعني لا يعتمد فقط على كلمة واحدة، بل يحاول التقاط التشابه حتى لو الصياغة مختلفة.

### التكنولوجيا المستخدمة

- Python
- local sparse embeddings
- cosine similarity
- Hebrew tokenization بالـ regex
- Backend transcript source
- local file fallback

### لماذا لم نستخدم vector database كبير؟

لأن حجم المنهج صغير إلى متوسط، والهدف أن يبقى النظام بسيطا ومجانيا وسهل التشغيل. local sparse retrieval كاف هنا، أسرع، أقل تكلفة، ولا يحتاج infrastructure خارجية.

إذا كبر المحتوى كثيرا، يمكن لاحقا استبداله بـ vector DB مثل Qdrant أو Pinecone أو pgvector. لكن حاليا الحل المحلي أفضل لأنه:

- مجاني.
- سريع.
- deterministic.
- لا يحتاج خدمة إضافية.
- مناسب لحجم transcripts الحالي.

### جواب جاهز

> استخدمنا RAG حتى لا يجيب الموديل من معرفته العامة فقط. النظام يسحب مقاطع من منهجنا حسب مستوى الطالب ويضيفها للـ prompt. هذا يجعل الردود مرتبطة بالمحتوى التعليمي الفعلي وليس مجرد دردشة عامة.

---

## 8. Memory Layer

### ما المشكلة؟

المحادثة الطبيعية تعتمد على ما قيل سابقا.

مثال:

```text
طالب: אני רוצה לקנות אבטיח
بوت: כמה קילו?
طالب: שניים
```

لو لا توجد memory، كلمة "שניים" غير مفهومة. لكن مع memory، النظام يعرف أنها تعود على كيلو من البطيخ.

### كيف تعمل حرفيا؟

في `conversation_memory.py`:

- كل session لها history.
- المفتاح هو `sessionId`.
- يتم حفظ آخر عدة turns.
- افتراضيا يحتفظ بآخر 5 أزواج user/assistant.
- يوجد TTL تقريبا 30 دقيقة.
- يدعم Redis إذا كان موجودا.
- إذا لم يوجد Redis، يستخدم in-memory store.

### ماذا يدخل إلى الموديل؟

عند الحاجة إلى LLM، يتم جلب history وإرساله ضمن `ProviderCallOptions`.

هذا يجعل Gemini يرى آخر سياق من المحادثة.

### لماذا لا نحفظ كل التاريخ؟

لأن ذلك:

- يزيد tokens.
- يبطئ الرد.
- قد يدخل معلومات غير ضرورية.
- يستهلك quota.

آخر عدة turns تكفي لمعظم المحادثات التعليمية القصيرة.

### التكنولوجيا المستخدمة

- in-memory session store
- optional Redis
- TTL
- bounded history
- thread lock

### لماذا هذا اختيار ممتاز؟

لأنه بسيط ومناسب لمحادثات تعليمية. يحفظ السياق القريب بدون تضخيم prompt. وفي الإنتاج يمكن دعمه بـ Redis لضمان الاستمرارية بين أكثر من instance.

### جواب جاهز

> نستخدم session memory حتى يفهم النظام السياق القريب للمحادثة. لا نرسل كل التاريخ، بل آخر عدة turns فقط، حتى نحافظ على السرعة والتكلفة ونمنع تضخم الـ prompt.

---

## 9. Prompt Construction

### ما المقصود ببناء prompt؟

نحن لا نرسل رسالة الطالب فقط إلى Gemini. نبني system message كامل يخبر الموديل كيف يجب أن يتصرف.

الـ prompt يحتوي:

- شخصية البوت: معلم عبري دافئ.
- مستوى الطالب.
- هل الرد صوتي أو نصي.
- طول الرد المسموح.
- vocabulary مفضل.
- curriculum context من RAG.
- grammar hints.
- تعليمات التصحيح.
- تعليمات البقاء داخل السيناريو.
- منع العربية والإنجليزية إلا إذا مسموح.

### كيف يعمل حرفيا؟

في `chat_engine.py` توجد دالة `_build_system_message`.

إذا `voiceMode = true`:

- الرد أقصر.
- يستخدم جمل مناسبة للصوت.
- يمنع رموز وأرقام.
- يركز على 1-2 جمل.

إذا `voiceMode = false`:

- يسمح برد 2-3 جمل.
- يمكن إضافة Arabic gloss إذا includeArabic true.
- يضيف context وvocabulary.

### ما فائدة grammar hints؟

إذا اكتشف النظام خطأ لغوي في رسالة الطالب، يبني hint ويضيفه للـ prompt حتى يساعد الموديل على التصحيح.

مثال:

```text
אני לומדת
```

لو السياق يتطلب مذكر، ممكن يعطي prompt hint للتصحيح. طبعا دقة التصحيح تعتمد على نوع الخطأ وعلى prompt/LLM.

### التكنولوجيا المستخدمة

- prompt templates داخل `ai-service/prompts`
- dynamic prompt construction
- grammar rules
- RAG context injection
- conversation history

### لماذا هذا أفضل من prompt ثابت؟

لأن التعليم يحتاج تخصيص. Prompt الطالب A1 ليس مثل B2. Prompt النص ليس مثل الصوت. Prompt السيناريو ليس مثل سؤال معنى كلمة.

### جواب جاهز

> نحن لا نرسل input خام للموديل. نبني prompt تعليمي ديناميكي يحتوي مستوى الطالب، السياق، كلمات المنهج، وملاحظات التصحيح. لذلك الموديل يتصرف كمعلم داخل منصة، وليس كمساعد عام.

---

## 10. Provider Layer

### ما وظيفتها؟

هذه الطبقة تفصل النظام عن مزود الذكاء الاصطناعي. حاليا المزود الأساسي هو Gemini، لكن الكود يدعم بنية fallback لمزودين آخرين إذا كانت مفاتيحهم موجودة.

### كيف تعمل حرفيا؟

في `chat_provider.py`:

1. يقرأ `LLM_PROVIDER` و `LLM_MODEL`.
2. يبني provider chain.
3. يبدأ بالمزود المطلوب غالبا Gemini.
4. إذا فشل بسبب quota أو timeout أو network، يحاول fallback حسب الإعدادات.
5. يسجل provider logs.
6. يرجع `ProviderResult` يحتوي:

```text
answer
latency_seconds
input_tokens
output_tokens
provider
model
attempts
```

### Gemini key rotation

إذا عندنا أكثر من Gemini API key داخل:

```text
GEMINI_API_KEYS=key1,key2,key3
```

النظام يستخدم round-robin:

- الطلب الأول يبدأ من key1.
- الثاني من key2.
- الثالث من key3.
- إذا key رجع 429، ينتقل للثاني.

### لماذا 429 لا يفتح circuit breaker؟

لأن 429 يعني quota/rate limit، وليس أن الخدمة معطلة. لو فتحنا circuit بسبب 429، قد نعطل النظام كله رغم أن المشكلة مؤقتة أو خاصة بمفتاح واحد.

### التكنولوجيا المستخدمة

- Google GenAI SDK
- optional OpenAI-compatible clients مثل Groq
- Cloudflare Workers AI عبر HTTP
- provider abstraction
- circuit breaker
- timeout threads
- token accounting

### لماذا Gemini مناسب؟

ضمن قيود المشروع، Gemini مناسب لأنه:

- جيد في العبرية.
- سريع نسبيا.
- يوجد free tier.
- يدعم نماذج Flash/Flash-Lite.
- يمكن تدوير أكثر من key.
- مناسب لردود قصيرة تعليمية.

### لماذا abstraction أفضل؟

لأنه إذا قررنا غدا تغيير Gemini أو إضافة Groq، لا نغير كل الـ pipeline. نغير provider layer فقط.

### جواب جاهز

> لدينا provider abstraction. النظام حاليا يستخدم Gemini كخيار أساسي لأنه مناسب للعبرية ومتاح بتكلفة منخفضة، لكن طبقة المزودين تسمح بإضافة fallback أو تغيير الموديل بدون إعادة بناء النظام.

---

## 11. Circuit Breakers and Failure Handling

### ما المشكلة؟

خدمات الذكاء والصوت قد تفشل:

- timeout
- quota
- network error
- auth error
- provider down
- STT failure
- TTS failure

لا نريد أن يؤدي فشل واحد إلى انهيار النظام.

### كيف يعمل حرفيا؟

يوجد circuit breaker للمزودين وللصوت:

- إذا تكررت أخطاء حقيقية، يفتح circuit.
- عندما circuit مفتوح، لا نحاول نفس الخدمة مؤقتا.
- بعد مدة، يسمح بمحاولة جديدة.

لكن quota 429 لا يعامل كعطل كامل.

### لماذا هذا مهم؟

لأنه يمنع cascade failure. بدل أن ينتظر كل مستخدم timeout طويل، النظام يتدهور بلطف ويرجع fallback واضح.

### التكنولوجيا المستخدمة

- custom CircuitBreaker
- error classification
- fallback reason codes
- provider attempt logs
- timeout wrappers

### جواب جاهز

> عندنا circuit breakers وfallback reasons. إذا مزود تعطل، نعزله مؤقتا ونرجع رسالة مفهومة بدل أن ينهار الطلب. وإذا المشكلة quota 429، لا نفتح circuit لأنها ليست عطلا دائما.

---

## 12. Post-processing Layer

### لماذا لا نرجع رد Gemini مباشرة؟

لأن الموديل قد:

- يكتب طويلا.
- يخلط عربية أو إنجليزية.
- يعطي شرحا أطول من اللازم.
- يضيف Arabic line داخل answerHe.
- يخرج عن نمط الصوت.

### كيف يعمل حرفيا؟

بعد رجوع الرد:

1. يستخرج Arabic gloss إذا موجود.
2. يفصل الرد العبري في `answerHe`.
3. يتحقق أن الرد عبري فقط.
4. يقصر الرد حسب text/voice mode.
5. في voice mode يزيل رموز غير مناسبة للقراءة.
6. يضيف metadata:

```text
fallbackUsed
fallbackReason
latencyMs
provider
model
contextChunkIds
retrievalScores
inputTokens
outputTokens
suggestedNextPrompts
```

### التكنولوجيا المستخدمة

- regex Hebrew/Arabic checks
- response schemas
- token/word caps
- structured metadata

### لماذا هذا أفضل؟

لأن LLM غير مضمون 100%. أفضل ممارسة في AI products هي عدم عرض raw model output مباشرة، بل تمريره في طبقة تحقق وتنظيم.

### جواب جاهز

> حتى بعد أن يرجع الرد من Gemini، لا نعرضه مباشرة. لدينا post-processing يتأكد من اللغة، الطول، وضع الصوت، ويفصل الشرح العربي إن وجد. هذا يجعل الرد أكثر أمانا واتساقا.

---

## 13. Voice Pipeline

### ما الذي يحدث في وضع الصوت؟

الصوت ليس نظاما منفصلا. هو مدخل صوتي لنفس عقل الشات.

```text
Audio
-> STT
-> Chat Engine
-> TTS
-> Frontend playback
```

### الخطوة 1: استقبال الصوت

الـ Frontend يرسل audio file إلى Backend:

```text
POST /api/chats/voice
```

الـ Backend يرسله إلى AI Service:

```text
POST /api/ai/chat/voice
```

### الخطوة 2: STT

STT يعني Speech-to-Text.

في `services/stt.py` يوجد selector:

- `whisper` افتراضي.
- `azure` إذا تم ضبط `STT_ENGINE=azure`.

يعني نفس الـ route لا يتغير. نغير env فقط.

### لماذا Whisper؟

Whisper المحلي مناسب لأنه:

- مجاني.
- لا يحتاج quota صوت شهري.
- يعمل محليا.
- يدعم العبرية.
- مناسب للتجارب والعرض.

### لماذا Azure خيار موجود؟

Azure أسرع غالبا في cloud STT ويدعم Hebrew `he-IL`. لكنه يحتاج مفاتيح وقد يكون له حدود أو تكلفة. لذلك تركناه configurable.

### الخطوة 3: Chat Pipeline

بعد تحويل الصوت إلى نص، النص يدخل نفس `generate_chat_response`.

هذا مهم جدا:

> نحن لم نبن منطقين منفصلين. الصوت والنص يستخدمان نفس عقل التعليم.

### الخطوة 4: Pronunciation optional

يوجد pronunciation assessment باستخدام Azure، لكنه optional ومطفأ غالبا حسب env. عندما يعمل، يعطي score من 0 إلى 100.

### الخطوة 5: TTS

TTS يعني Text-to-Speech.

في `text_to_speech.py`:

- يبني SSML.
- يختار voice عبري مثل `he-IL-HilaNeural`.
- يضبط السرعة slow للمبتدئين.
- يرجع MP3 bytes.
- route يحوله إلى `audioBase64`.

إذا فشل TTS، يرجع `audioBase64: null` والواجهة تستخدم browser fallback.

### التكنولوجيا المستخدمة

- Browser audio recording
- FormData upload
- faster-whisper
- optional Azure Speech STT
- Azure Speech TTS
- SSML
- base64 MP3
- browser speechSynthesis fallback

### لماذا هذه بنية قوية؟

لأنها flexible:

- يمكن تشغيل STT محليا لتقليل التكلفة.
- يمكن استخدام Azure لتحسين السرعة.
- TTS يعطي صوت عبري طبيعي.
- fallback يمنع كسر التجربة إذا فشل الصوت.
- نفس chat engine يستخدم للنص والصوت.

### جواب جاهز

> الصوت عندنا يمر بثلاث مراحل: STT يحول كلام الطالب إلى نص، ثم نفس chat pipeline يولد الرد، وبعدها TTS يحول الرد إلى صوت. لذلك الصوت يستفيد من نفس RAG والذاكرة والتصحيح الموجودة في الشات النصي.

---

## 14. Scenario Engine

### ما المشكلة التي يحلها؟

السيناريو ليس سؤالا عاديا. إذا الطالب اختار مطعم أو عيادة، نريد من البوت أن يبقى داخل الدور:

- نادل.
- طبيب.
- موظف استقبال.
- بائع.
- معلم.

ولا نريد أن يرد كـ chatbot عام.

### كيف يعمل حرفيا؟

إذا الطلب يحتوي `scenario`، يقوم `chat_engine.py` بتحويله إلى مسار خاص:

```text
is_scenario(request_context.scenario)
-> _generate_scenario_response
-> build_scenario_prompt
-> LLM
-> no regular cache
```

### لماذا لا يستخدم cache عادي؟

لأن role-play يعتمد على حالة المحادثة. نفس الجملة داخل مطعم غير نفس الجملة داخل عيادة.

### ماذا يحتوي prompt السيناريو؟

في `scenario_engine.py`:

- يحدد النشاط.
- يحدد الدور.
- يحدد المكان.
- يحدد مستوى الطالب.
- يحدد كلمات مفيدة.
- يطلب من الموديل أن يقود النشاط.
- يطلب أن ينهي كل turn بسؤال.

### التكنولوجيا المستخدمة

- scenario templates
- dynamic prompt generation
- curriculum words by level
- conversation memory
- LLM live path

### لماذا هذا أفضل من hardcoded scenarios؟

لأن hardcoded سيناريو يعطي جمل ثابتة. أما scenario engine يعطي محادثة حية لكنها مضبوطة. الطالب يستطيع الخروج قليلا أو يخطئ، والبوت يصحح ويكمل داخل المشهد.

### جواب جاهز

> السيناريوهات ليست مجرد نص افتتاحي. كل scenario يبني prompt خاص يجعل الموديل يؤدي دورا تعليميا محددا، مثل نادل أو طبيب، ويقود المحادثة داخل هذا الدور.

---

## 15. Backend Integration

### أين يدخل الـ Backend في القصة؟

الـ Backend هو gateway بين Frontend وAI Service.

في `backend/src/services/aiChatService.js` توجد دوال:

- `sendChatMessageToAi`
- `sendVoiceMessageToAi`
- `transcribeAudioViaAi`
- `synthesizeTextViaAi`

### ماذا يضيف Backend؟

Backend لا يرسل الطلب فقط، بل:

- يتحقق من المستخدم.
- يقرأ chat level.
- يقرأ defaultIncludeArabic.
- يضيف userId.
- يضيف sessionId.
- يضيف internal secret.
- يخزن رسالة الطالب.
- يخزن رد AI.
- يخزن token usage.
- يدعم idempotency عبر clientMessageId.

### لماذا هذا مهم؟

لأن AI Service لا يجب أن يعرف تفاصيل Firebase والمحادثات والصلاحيات. Backend هو source of truth للمستخدمين والتخزين.

### التكنولوجيا المستخدمة

- Express.js
- Firebase Admin
- Firestore
- Axios
- JWT
- multipart/form-data للصوت

### لماذا Express مناسب هنا؟

لأن المشروع أصلا يستخدم Node/Express للـ Backend، وهو مناسب لـ API gateway، auth، Firebase، route handling، وproxy calls.

### جواب جاهز

> الـ Backend هو البوابة التي تحفظ المحادثات وتدير الصلاحيات، أما AI Service فهو مسؤول عن الذكاء فقط. هذا الفصل يمنع خلط منطق التخزين مع منطق اللغة.

---

## 16. Monitoring and Readiness

### كيف نعرف أن AI Service يعمل؟

يوجد endpoints:

- `/api/ai/health`
- `/api/ai/ready`
- `/api/ai/analytics`
- `/api/ai/logs`
- `/api/ai/cache/stats`
- `/api/ai/chat/voice/health`

### الفرق بين health وready

**health** يعني السيرفر حي ويرد.

**ready** يعني الخدمة جاهزة فعلا: الكاش محمل، RAG جاهز، مفاتيح LLM موجودة، وRedis إن كان مفعلا يعمل.

### Analytics ماذا تعرض؟

تعرض:

- uptime.
- cache hits/misses.
- provider success/failure.
- latency avg/p50/p95/p99.
- fallback counts.
- request path metrics.
- rate limits.

### لماذا هذا مهم؟

لأن AI system بدون monitoring صعب الدفاع عنه. أنت تحتاج أن تعرف:

- كم طلب وصل LLM؟
- كم طلب تخدم محليا؟
- أي provider فشل؟
- هل الكاش فعال؟
- هل RAG جاهز؟

### التكنولوجيا المستخدمة

- FastAPI endpoints
- structured logs
- in-memory metrics
- provider attempt logs
- request path counters
- optional Sentry/OpenTelemetry

### جواب جاهز

> لدينا readiness وanalytics وليس فقط endpoint للشات. نستطيع معرفة إذا الكاش جاهز، RAG يعمل، مفاتيح الموديل موجودة، وكم نسبة الطلبات التي وصلت فعليا إلى LLM.

---

## 17. Full Text Chat Pipeline

هذا هو المسار الكامل لرسالة نصية:

```text
1. Frontend يرسل رسالة الطالب إلى Backend
2. Backend يتحقق من المستخدم والمحادثة
3. Backend يخزن رسالة الطالب في Firestore
4. Backend يستدعي AI Service /api/ai/chat
5. AI Service يتحقق من secret/JWT
6. يبني ChatRequestContext
7. ينظف input
8. يفحص hard rejects مثل empty أو mixed language
9. يبحث في exact cache
10. يحاول gatekeeper/local response
11. يحاول router deterministic
12. يحاول semantic/canonical cache
13. يبني RAG context من transcripts
14. يتحقق من provider circuit
15. يتحقق من LLM rate limit
16. يبني prompt ديناميكي
17. يرسل إلى Gemini/provider
18. يستقبل الرد
19. يفصل Hebrew/Arabic
20. يتحقق من Hebrew-only والطول
21. يحفظ في memory إن كان مناسبا
22. يتتبع vocabulary بشكل fire-and-forget
23. يرجع ChatResponse
24. Backend يخزن رد AI
25. Frontend يعرض الرد
```

---

## 18. Full Voice Pipeline

```text
1. الطالب يسجل صوته في Frontend
2. Frontend يرسل audio blob إلى Backend
3. Backend يتحقق من المستخدم ويجهز FormData
4. Backend يرسل الصوت إلى AI Service /api/ai/chat/voice
5. AI Service يقرأ audio bytes
6. STT يحول الصوت إلى نص عبري
7. إذا فشل STT يرجع fallback reason مثل STT_TIMEOUT
8. النص الناتج يدخل نفس chat engine
9. optional pronunciation assessment يعمل بالتوازي إذا مفعل
10. AI Service يبني answerHe
11. TTS يحول answerHe إلى MP3 base64
12. يرجع transcribedText + answerHe + audioBase64
13. Backend يخزن رسالة الطالب الصوتية ورد AI
14. Frontend يعرض النص ويشغل الصوت
```

---

## 19. Full Read Aloud / TTS Button Pipeline

هذه الإضافة الأخيرة للزر الصغير:

```text
1. الطالب يضغط Read aloud على رد البوت
2. Frontend يرسل النص إلى Backend /api/chats/tts
3. Backend يتحقق من auth
4. Backend يستدعي AI Service /api/ai/chat/tts
5. AI Service يبني SSML
6. Azure TTS يولد MP3
7. AI Service يرجع audioBase64
8. Frontend يشغل الصوت
9. إذا فشل TTS، يستخدم browser speechSynthesis
```

### لماذا عملناها عبر Backend وليس مباشرة؟

لأن Backend يحافظ على auth ويحمي مفاتيح Azure. الواجهة لا تعرف مفاتيح TTS ولا تستدعي AI Service مباشرة.

---

## 20. Why These Technologies

### FastAPI

الأفضل لهذا الجزء لأنه Python-native وسريع ومناسب لخدمات AI ويدعم schemas وdocs تلقائية.

### Express Backend

مناسب كبوابة لأنه موجود أصلا في المشروع، ويتكامل بسهولة مع Firebase وJWT وAxios.

### Firebase / Firestore

مناسب للتخزين السريع للمحادثات والمستخدمين في مشروع تعليمي، ويوفر Auth وFirestore بشكل مباشر.

### Gemini

مناسب لأنه يدعم العبرية بشكل جيد، سريع، وله free tier، ونماذج Flash مناسبة للردود التعليمية القصيرة.

### RAG محلي

مناسب لأن حجم المنهج محدود، ولا نحتاج vector database مدفوع. retrieval محلي أسرع وأرخص وأسهل تشغيل.

### Whisper STT

مناسب لأنه مجاني ومحلي ويدعم العبرية، ولا يعتمد على quota صوتي. جيد للتجارب والتشغيل منخفض التكلفة.

### Azure Speech TTS

مناسب لأنه يعطي صوت عبري طبيعي ويدعم SSML للتحكم بالسرعة والنبرة. ومع ذلك يوجد browser fallback إذا فشل.

### Redis optional

ممتاز لأنه لا يجبرنا على بنية إضافية في التطوير، لكنه يسمح بالتوسع في الإنتاج.

### Circuit Breakers

مهمة لأن خدمات AI قد تفشل. circuit breaker يمنع الانتظار الطويل ويعزل المزود المعطل.

---

## 21. أسئلة متوقعة من اللجنة وأجوبة جاهزة

### هل كل رسالة تذهب إلى Gemini؟

لا. عندنا local-first وcache وrouter. فقط الرسائل التي تحتاج فهما سياقيا أو محادثة تعليمية حقيقية تصل إلى LLM.

### كيف تمنعون إجابات خارج المنهج؟

نستخدم RAG لجلب محتوى من منهجنا، ونضيف vocabulary حسب المستوى، وبعد الرد نفحص اللغة والطول ونوع الرد.

### كيف تعرفون مستوى الطالب؟

الـ Backend يمرر `level` المرتبط بالمحادثة أو المستخدم، والـ AI Service يبني الرد بناء على هذا المستوى.

### ماذا يحدث إذا فشل Gemini؟

النظام يصنف الخطأ: timeout، quota، network، auth. ثم يستخدم fallback أو مزود آخر إن كان مفعلا. ولا ينهار الطلب.

### كيف يعمل الصوت؟

الصوت يتحول إلى نص عبر STT، ثم يدخل نفس chat pipeline، وبعدها يتحول رد المعلم إلى صوت عبر TTS.

### لماذا استخدمتم RAG؟

حتى تكون الردود مرتبطة بمنهج Lisan وليس فقط بمعرفة عامة من الموديل.

### لماذا AI Service منفصل عن Backend؟

لأن AI logic مختلف ومعقد ويستخدم Python ومكتبات AI. فصله يجعل النظام أسهل في التطوير والاختبار والتوسع.

### هل النظام آمن؟

AI Service لا يستدعى مباشرة من المستخدم. Backend يضيف secret وJWT، كما توجد guardrails وتنظيف input وrate limits.

### كيف تتعاملون مع التكلفة؟

من خلال local-first، cache، LLM rate limit، key rotation، واستخدام LLM فقط عند الحاجة.

### ما أقوى نقطة تقنية؟

القوة ليست في استخدام Gemini فقط، بل في الطبقة التعليمية حوله: RAG، memory، guardrails، voice pipeline، provider fallback، وpost-processing.

---

## 22. نسخة مختصرة للحفظ

> الـ AI Service هو عقل Lisan. لا يرسل رسالة الطالب مباشرة إلى Gemini. أولا ينظف الطلب ويتحقق منه، ثم يحاول الرد محليا أو من cache. إذا احتاج فهما أعمق، يجلب محتوى مناسب من المنهج باستخدام RAG، يضيف ذاكرة المحادثة ومستوى الطالب، ثم يبني prompt تعليمي ويرسله للموديل. بعد رجوع الرد، يفحصه وينظمه حسب وضع النص أو الصوت، ثم يرجعه للـ Backend ليتم تخزينه وعرضه للطالب.

---

## 23. نسخة تقنية أقوى للحفظ

> Lisan AI Service is not a single model call. It is an AI teaching pipeline. It combines FastAPI, request schemas, input sanitization, local-first routing, safe caching, RAG over curriculum transcripts, conversation memory, dynamic prompt construction, provider failover, guardrails, STT, TTS, and analytics. The LLM is only one component inside a larger controlled educational system.

---

## 24. خريطة الملفات المهمة

```text
ai-service/main.py
  FastAPI app, CORS, rate limiting, health, readiness

ai-service/routes/chat.py
  chat, stream, voice, transcribe, tts, analytics routes

ai-service/services/chat_engine.py
  قلب النظام: pipeline، RAG، memory، prompt، post-processing

ai-service/services/chat_provider.py
  Gemini/provider calls, key rotation, fallback, circuit breakers

ai-service/services/chat_cache.py
  level bundles, cache, rate limit, vocabulary bundles

ai-service/services/chat_retrieval.py
  transcript loading, chunking, RAG retrieval

ai-service/services/chat_guardrails.py
  input/output language checks, fallback messages, scope checks

ai-service/services/conversation_memory.py
  session memory

ai-service/services/scenario_engine.py
  role-play and learning activity prompts

ai-service/services/stt.py
  STT engine selector

ai-service/services/whisper_stt.py
  local Whisper transcription

ai-service/services/speech_to_text.py
  Azure STT

ai-service/services/text_to_speech.py
  Azure TTS and SSML

backend/src/services/aiChatService.js
  Backend proxy to AI Service

backend/src/controllers/chatController.js
  Stores messages, voice messages, token usage
```

---

## 25. الخلاصة النهائية

إذا بدك تلخص المشروع تقنيا في دقيقة:

> بنينا نظام ذكاء تعليمي وليس مجرد chatbot. الطالب يتعامل مع واجهة React، والـ Backend يدير المستخدمين والتخزين، أما AI Service فهو طبقة Python مستقلة تستقبل الرسالة، تنظفها، تفهم مستوى الطالب، تبحث في المنهج باستخدام RAG، تحفظ سياق المحادثة، وتستدعي Gemini فقط عند الحاجة. بعدها تفحص الرد وتجعله مناسبا تعليميا وصوتيا قبل عرضه. في الصوت، نضيف STT قبل نفس الـ pipeline وTTS بعده. لذلك النظام قابل للتوسع، أقل تكلفة، وأكثر تحكما من استدعاء مباشر لموديل واحد.
