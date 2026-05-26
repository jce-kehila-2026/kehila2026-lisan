# خطة عمل كلود - تثبيت النظام والوصول لنسبة 100% (Stabilization)

**الدور (Persona):** أنت مهندس برمجيات ومهندس ذكاء اصطناعي خبير (Senior Backend & AI Architect).
**المهمة:** إغلاق تعارضات الباك إند، تثبيت عقود الـ API، وضمان جاهزية النظام 100% للاستخدام الفعلي.

يرجى تنفيذ المهام التالية بالترتيب (Task by Task):

## Task 1: تثبيت عقود `ai-service` (API Contracts)
**الهدف:** التأكد من عدم وجود أي تعارض في البيانات بين FastAPI و Express.
- راجع `ai-service/routes/chat.py` و `services/chat_schemas.py`.
- تأكد من تطابق الـ JSON Response تماماً مع المتوقع في بوابة `Express.js` (شاملاً الحقول: `answerHe`, `fallbackUsed`, `latencyMs`, الخ).
- أصلح أي مسارات أو دوال مكسورة بسبب الدمج الأخير.

## Task 2: مراجعة البيئة والـ Secrets (Environment & Security)
**الهدف:** تأمين نقطة الاتصال بين الباك إند وخدمة الذكاء الاصطناعي.
- تأكد من وجود وتفعيل `X-Internal-Service-Secret` في كل من Express و FastAPI.
- حدّث ملفات `.env.example` في كلا المشروعين لتشمل كافة المتغيرات الجديدة (مثل مفاتيح STT/TTS إذا وجدت).
- راجع الـ Rate Limiting في الباك إند للتأكد من فاعليته.

## Task 3: حل تعارضات الدمج والتكامل في الباك إند (Backend Integration)
**الهدف:** ضمان تمرير الطلبات (Gateway) وحفظها بنجاح.
- راجع ملفات `backend/src/routes/chat.js` و `backend/src/controllers/chatController.js`.
- حل أي تعارضات دمج (Merge Conflicts) موجودة في هذه الملفات.
- تأكد من أن خدمة `chatPersistenceService` تعمل بشكل سليم ولا تقوم بحفظ بيانات فارغة في Firestore في حال فشل الـ AI.

## Task 4: تشغيل وتمرير اختبارات الذكاء الاصطناعي (Evaluation Harness)
**الهدف:** التأكد من جودة الردود واستقرار الموديل.
- قم بتشغيل سكريبت `run_chat_eval.py` في `ai-service`.
- عالج أي أخطاء تظهر في الـ Report النهائي (مثل Vocabulary leakage أو فشل الـ Fallback).
- اضبط الـ Timeouts و الـ Circuit Breakers إذا كانت تفشل بشكل متكرر.

## Task 5: الاختبارات النهائية للباك إند (Backend E2E Validation)
**الهدف:** ضمان جاهزية الـ API للواجهة الأمامية 100%.
- قم بتشغيل `Supertest` أو اكتب سكربت اختبار سريع بـ `curl`/`Postman` لعمل E2E Flow كامل.
- اختبر: طلب صحيح، طلب بدون توثيق، طلب يؤدي لـ Timeout، للتأكد من أن جميع الحالات تُرجع استجابة نظيفة للفرونت إند.

---
**النتيجة المتوقعة بنهاية الخطة:** Backend & AI Service مستقران بنسبة 100% ولا يوجد أي Crash.