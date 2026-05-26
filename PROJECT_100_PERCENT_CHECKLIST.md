# Project 100% Checklist

هذا الملف هو checklist تشغيل واستقرار للمشروع كله بعد الشغل المتوازي بين Codex وClaude.

الهدف:
- نوصل المشروع إلى حالة يمكن فيها تشغيله واختباره والثقة به.
- نغلق تعارضات الدمج قبل إضافة features جديدة.
- نعطي Codex وClaude قائمة موحدة بدل شغل متداخل.

## 1. قواعد العمل قبل أي تعديل جديد

- [ ] اختيار ملف owner لكل مهمة قبل البدء: `Codex` أو `Claude`
- [ ] منع تعديل نفس الملف من الأداتين في نفس الوقت
- [ ] قبل كل batch جديد: تشغيل `git status` وتسجيل الملفات التي يعمل عليها كل طرف
- [ ] أي refactor يغيّر contract يجب أن يرافقه تحديث للاختبارات والـ evals في نفس المهمة
- [ ] أي endpoint جديد يجب توثيقه في هذا الملف أو في `README.md`

## 2. Stabilization للشغل المتوازي الحالي

- [ ] توحيد contract الخاص بـ `ProviderResult` في `ai-service/services/chat_provider.py`
- [ ] تحديث كل الاختبارات والـ evals القديمة التي ما زالت تنشئ `ProviderResult` بدون `provider` و`model`
- [ ] حسم سلوك `provider_circuit` بعد refactor الـ multi-provider
- [ ] إما تحديث `ai-service/tests/test_sprint7_reliability.py` للعقد الجديد أو إضافة compatibility layer في `ai-service/services/chat_engine.py`
- [ ] توحيد طريقة clear للكاش بدل الاعتماد على `EXACT_RESPONSE_CACHE.clear()`
- [ ] تحديث الاختبارات والـ evals التي تستعمل الكاش القديم فقط
- [ ] إزالة imports أو code paths غير المستخدمة بعد الدمج مثل `live_call_provider` إذا بقي غير لازم

## 3. AI Service correctness

- [ ] مراجعة `ai-service/main.py` والتأكد أن الـ middleware لا يكسر endpoints داخلية أو health checks مهمة
- [ ] مراجعة `ai-service/routes/chat.py` بعد إضافة voice flow وlogs وcache stats وrate limit status
- [ ] مراجعة `ai-service/routes/pronunciation.py` والتأكد من اتساق العقود بين `validate` و`assess`
- [ ] مراجعة `ai-service/services/chat_engine.py` لضمان fallback reasons الصحيحة في كل مسار
- [ ] مراجعة `ai-service/services/chat_provider.py` لضمان ترتيب fallback الفعلي: `Gemini -> Claude -> OpenAI`
- [ ] مراجعة `ai-service/services/chat_retrieval.py` لضمان أن semantic fallback لا يكسر السلوك القديم
- [ ] مراجعة `ai-service/services/chat_cache.py` لضمان أن stats وTTL وeviction واضحة ومتوقعة
- [ ] مراجعة `ai-service/services/pronunciation.py` لضمان أن `language_level` مدعوم فعليًا وليس شكليًا
- [ ] إذا كان المطلوب دعم `A1/A2/B1/B2` فعلًا، تقسيم `approved-vocabulary.json` حسب المستوى

## 4. Test suite and evals

- [ ] تثبيت `pytest` داخل بيئة `ai-service`
- [ ] تشغيل اختبارات `ai-service/tests/test_cache.py`
- [ ] تشغيل اختبارات `ai-service/tests/test_provider_fallback.py`
- [ ] تشغيل اختبارات `ai-service/tests/test_rate_limit.py`
- [ ] تشغيل اختبارات `ai-service/tests/test_semantic_retrieval.py`
- [ ] تشغيل اختبارات `ai-service/tests/test_pronunciation.py`
- [ ] تشغيل اختبارات `ai-service/tests/test_sprint7_reliability.py`
- [ ] تشغيل اختبارات `ai-service/tests/test_day3_prompt_and_fallback.py`
- [ ] تشغيل اختبارات `ai-service/tests/test_hebrew_only_behavior.py`
- [ ] تشغيل أي eval scripts داخل `ai-service/evals/` بعد تحديثها للعقود الجديدة
- [ ] توثيق أي test مكسور: هل هو bug حقيقي أم test قديم يحتاج تحديث

## 5. Env and secrets

- [ ] التأكد من وجود `.env` صالح لـ `ai-service`
- [ ] التأكد من مفاتيح `Gemini`
- [ ] التأكد من مفاتيح `Anthropic`
- [ ] التأكد من مفاتيح `OpenAI`
- [ ] التأكد من إعدادات `Azure Speech` إذا كان pronunciation assessment مطلوبًا
- [ ] التأكد من timeouts وcircuit breaker env vars
- [ ] التأكد من أن أي secret داخلي بين `backend` و`ai-service` مضبوط وغير مكشوف للـ frontend

## 6. Backend integration

- [ ] مراجعة كيف يستهلك `backend` ردود `ai-service`
- [ ] التأكد أن أي حقل جديد مثل `retrievalScores` لا يكسر العقود الحالية
- [ ] التأكد أن backend يتعامل مع `429`, `Retry-After`, fallback responses, وprovider errors
- [ ] التأكد أن مسارات voice إن كانت مستخدمة تمر عبر الـ backend وليس اتصالًا مباشرًا غير مقصود
- [ ] التأكد من logging وerror mapping بين `backend` و`ai-service`

## 7. Frontend integration

- [ ] التأكد أن frontend لا يعتمد على contract قديم لرد الشات
- [ ] التأكد أن chat UI يتحمل fallback responses بدون crash
- [ ] التأكد أن أي voice flow متصل بالمصدر الصحيح
- [ ] التأكد أن أي latency أو loading states متوافقة مع rate limiting وfallback
- [ ] التأكد أن الأخطاء تظهر للمستخدم بشكل مفهوم

## 8. End-to-end manual verification

- [ ] تشغيل المشروع كاملًا محليًا
- [ ] تجربة chat happy path من الواجهة حتى `ai-service`
- [ ] تجربة cache hit فعلي على نفس السؤال مرتين
- [ ] تجربة provider fallback فعلي عند تعطيل المزود الأول
- [ ] تجربة rate limiting فعلي لمستخدم واحد
- [ ] تجربة semantic retrieval على سؤال مرتبط بالمحتوى
- [ ] تجربة fallback retrieval على سؤال لا يطابق threshold
- [ ] تجربة pronunciation validation لكلمة صحيحة
- [ ] تجربة pronunciation validation لكلمة مشابهة
- [ ] تجربة pronunciation assessment لكلمة معتمدة
- [ ] تجربة رفض pronunciation assessment لكلمة غير معتمدة
- [ ] إذا كان voice chat جزءًا من التسليم: تجربة STT وTTS وhealth endpoint

## 9. Cleanup and docs

- [ ] تحديث `AI_SERVICE_TASKS.md` بحالة كل task
- [ ] تحديث `README.md` بخطوات التشغيل الفعلية
- [ ] توثيق endpoints الجديدة في `ai-service`
- [ ] توثيق env vars المطلوبة
- [ ] توثيق known limitations الحالية إن وجدت
- [ ] تنظيف dead code وimports غير المستخدمة

## 10. Definition of done

نعتبر المشروع قريبًا من 100% فقط عندما:

- [ ] لا يوجد تعارض مفتوح بين شغل Codex وClaude في نفس الملفات الحرجة
- [ ] جميع اختبارات `ai-service` الأساسية تمر أو يوجد توثيق واضح لأي test legacy
- [ ] الـ evals الأساسية تعمل بدون كسر contracts
- [ ] backend وfrontend وai-service يعملون معًا محليًا
- [ ] الـ secrets والـ env vars موثقة ومضبوطة
- [ ] المسارات الحرجة: chat, fallback, cache, rate limit, retrieval, pronunciation تعمل end-to-end
- [ ] التوثيق الحالي يكفي لأي شخص في الفريق ليشغل المشروع بدون تخمين

## 11. Suggested split between Codex and Claude

- [ ] Codex: stabilization داخل `ai-service/services/*` و`ai-service/tests/*`
- [ ] Claude: مراجعة تكامل `backend` و`frontend` مع العقود الجديدة
- [ ] Codex: تشغيل الاختبارات وإصلاح العقود المكسورة
- [ ] Claude: توثيق التشغيل والـ env والتدفقات من منظور المنتج
- [ ] بعد كل batch: مراجعة مشتركة سريعة على `git diff` قبل المتابعة
