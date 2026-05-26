# خطة عمل كلود - تطوير الـ Backend ومحرك الذكاء الاصطناعي (Voice Bot)

**الدور (Persona):** أنت مهندس برمجيات ومهندس ذكاء اصطناعي خبير (Senior Backend & AI Architect).
**المهمة:** تنفيذ البنية التحتية والربط الخلفي لميزة "التحدث الصوتي" في تطبيق Lisan.

يرجى تنفيذ المهام التالية بالترتيب (Task by Task). لا تنتقل للمهمة التالية إلا بعد التأكد من نجاح الحالية:

## Task 1: تحديث الـ AI Service (FastAPI)
**الهدف:** استقبال الصوت، تحويله لنص، معالجته، ثم تحويل الرد لنص وصوت.
1. قم بإضافة نقطة نهاية جديدة في `ai-service/routes/chat.py` باسم `POST /api/ai/chat/voice`.
2. استقبل الملف الصوتي من نوع `UploadFile`.
3. استخدم مكتبة/خدمة STT (مثل OpenAI Whisper API أو خدمة Google) لتحويل الصوت العبري إلى نص (Hebrew Transcription).
4. مرر النص المستخرج إلى المحرك الحالي `chat_engine.py` للحصول على الرد (RAG & Guardrails).
5. استخدم خدمة TTS (Text-to-Speech) لتحويل النص الناتج (`answerHe`) إلى ملف صوتي.
6. أعد استجابة JSON تحتوي على: `answerHe`, `answerAr`, `audioBase64` (أو رابط), `fallbackUsed`, و `latencyMs`.

## Task 2: تحديث بوابة الـ Backend (Express.js)
**الهدف:** استقبال الصوت من الـ Frontend وتمريره بأمان إلى الـ AI Service.
1. في `backend/src/routes/chat.js`، أضف راوت جديد `POST /api/chat/voice`.
2. استخدم مكتبة `multer` لاستقبال ملف الصوت (multipart/form-data) في الذاكرة (MemoryStorage).
3. تأكد من تطبيق ميزة التحقق من المستخدم `requireAuth` و `rateLimit`.
4. قم بعمل Forward للملف الصوتي عبر `axios` أو `fetch` إلى `AI_SERVICE_URL/api/ai/chat/voice` مع تمرير الـ Secret Headers.
5. استقبل الرد من خدمة الـ AI وأعده للـ Frontend.

## Task 3: التخزين (Firestore & Cloud Storage)
**الهدف:** حفظ الرسائل الصوتية للاحتفاظ بسجل المحادثة (Chat History).
1. في `backend/src/services/chatPersistenceService.js`، قم بتحديث الـ Schema لإضافة `audioUrlUser` و `audioUrlAssistant`.
2. قبل حفظ مستند الرسالة في Firestore، قم برفع ملف صوت المستخدم (Buffer) وملف صوت الـ AI (Buffer/Base64) إلى Firebase Cloud Storage.
3. احصل على الروابط العامة (Download URLs) واحفظها داخل الـ Message Document في Firestore بجانب النص المستخرج (`textHe`).

## Task 4: معالجة الأخطاء والـ Fallbacks (Reliability)
**الهدف:** ضمان عدم انهيار النظام إذا فشل الـ STT أو TTS.
1. أضف Circuit Breaker و Timeouts محددة لخدمات الصوت.
2. إذا فشل STT: أعد رسالة خطأ واضحة للـ Frontend بـ fallback code معين (مثال: `STT_FAILED`).
3. إذا فشل TTS: أعد النص فقط (`answerHe`) مع `audioBase64: null`، لكي يتمكن الـ Frontend من عرض النص حتى لو فشل الصوت.

## Task 5: كتابة اختبارات التكامل (Integration Tests)
1. أضف اختبارات باستخدام `Supertest` في `backend/tests/` لاختبار مسار الـ Voice (حالة النجاح، وحالة عدم وجود ملف صوتي، وحالة فشل الـ AI).