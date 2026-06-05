# Lisan AI Service — نظرة عامة على الخطة والـ Pipeline

> وثيقة للفريق: تشرح شو بيعمل الـ AI service، كيف بيشتغل، والتحسينات اللي انعملت
> عشان يكون **مجاني بالكامل** مع **أعلى جودة ممكنة** و**أقل موارد**.

---

## 1. الفلسفة العامة

الهدف: chatbot لتعليم العبرية لطلاب عرب، **بدون أي تكلفة** على الجمعية (free tiers فقط)،
مع تجربة قريبة من معلّم حقيقي. كل القرارات اتبنت على المبدأ ده.

| المكوّن | الحل المجاني | التكلفة |
|--------|-------------|---------|
| LLM (المحادثة) | Gemini 2.5 Flash-Lite (عدّة مفاتيح) | $0 |
| STT (صوت → نص) | faster-whisper محلي (موديل small) | $0 |
| TTS (نص → صوت) | متصفح المستخدم (`speechSynthesis`) | $0 |
| Cache / Memory | in-memory (Redis اختياري) | $0 |

---

## 2. المعمارية والـ Pipeline

```
┌──────────┐     /api/...      ┌──────────┐   /api/ai/...   ┌─────────────┐
│ Frontend │ ───────────────►  │ Backend  │ ──────────────► │ AI Service  │
│  (React) │   proxy + auth    │ (Express)│  internal secret│  (FastAPI)  │
│  :4173   │ ◄───────────────  │  :3000   │ ◄────────────── │   :8000     │
└──────────┘                   └──────────┘                 └─────────────┘
                                    │                              │
                               Firebase (auth                Gemini API
                               + Firestore)                  Whisper (محلي)
```

- **Frontend (4173):** واجهة الطالب. تسجيل الدخول، المحادثة النصية والصوتية.
  الصوت (TTS) بيتقرأ بالمتصفح مباشرة.
- **Backend (3000):** بوابة. مصادقة (JWT + Firebase)، rate limiting، ويمرّر طلبات
  الذكاء للـ AI service مع `X-Internal-Service-Secret`.
- **AI Service (8000):** كل منطق الذكاء (FastAPI). هاي اللي اشتغلنا عليها.

### مسار المحادثة النصية (`POST /api/ai/chat`)
```
1. تنظيف المدخل (sanitize: شيل الرموز المخفية، طبّع الـ maqaf)
2. Cache lookup            → لو موجود، يرجّع فوراً (بدون LLM)
3. Fast-reject (guardrails)→ لغة مختلطة / فاضي / طويل جداً
4. Router                  → ردود جاهزة لتحيات وكلمات بسيطة (بدون LLM)
5. Out-of-scope check      → خارج المنهاج
6. RAG استخراجي            → إجابة من نصوص المنهاج مباشرة لو متوفرة
7. بوابة الـ Circuit       → لو المزوّد واقع، يرجّع fallback نظيف
8. RAG + Gemini            → بناء سياق + استدعاء الموديل (المعلّم القائد)
9. حُرّاس المخرجات          → عبري فقط + مفردات المستوى (مع retry)
10. تخزين بالـ cache + حفظ بذاكرة المحادثة → return
```

### مسار المحادثة الصوتية (`POST /api/ai/chat/voice`)
```
1. استقبال الصوت
2. STT (faster-whisper)  → تحويل العبري لنص
3. نفس مسار المحادثة النصية فوق
4. تتبّع المفردات (fire-and-forget)
5. بناء SSML → return
6. المتصفح يقرأ الرد بصوت
```

---

## 3. التحسينات اللي انعملت (بالترتيب)

### أ. التحويل للمجاني بالكامل
- **STT:** استبدال Azure Speech (محدود 5 ساعات/شهر) بـ **faster-whisper** محلي.
  - موديل `small` (دقة عالية للعبرية)، env-tunable.
  - يعيد استخدام نفس circuit breaker + exceptions القديمة.
- **TTS:** ثُبّت إنه أصلاً مجاني (المتصفح) — ما احتجنا أي خدمة مدفوعة.
- **Provider chain:** حذف Anthropic/OpenAI (بدون مفاتيح) — Gemini فقط.
- **Pronunciation:** مطفي افتراضياً (`USE_AZURE_PRONUNCIATION=false`) — هي الوحيدة
  اللي بتحتاج Azure؛ تنفتح وقت الحاجة فقط (مثلاً B2).

### ب. سلوك "المعلّم القائد"
البوت كان يردّ بجملة وحدة قصيرة (شريك محادثة سلبي). صار **معلّم استباقي**:
```
1. يصحّح الخطأ بلطف (يعرض الصيغة الصحيحة بكلمات قليلة)
2. يمدح لو صح
3. يتأكد إنه الطالب فهم
4. دايماً يختم بسؤال يقود فيه الحوار
```
- أعدنا كتابة البرومبتات (`prompts/chat-system-prompt-v2.txt` و `-voice.txt`).
- رفعنا حد الطول (env-tunable): نص 30 كلمة / صوت 20 كلمة عشان يسع التصحيح + السؤال.

### ج. إصلاح حلقة التكرار (loop)
**المشكلة:** كلمة وحدة برّا قائمة A1 الصارمة كانت تلغي **كل** الرد وتحطّ نص جاهز
مكرّر ("בוא נתרגל...") — ويتخزّن بالـ cache → حلقة لا نهائية.
**الحل:**
- توسيع مفردات المعلّم (كلمات أدب/تشجيع: רבה، מצוין، גם...).
- **تسامح المفردات:** بدل صفر تسامح، يرفض بس لو الرد **مغمور** بكلمات غير معروفة.
- **retry ذكي:** عند تسرّب، يطلب من Gemini يعيد الصياغة بالمفردات المسموحة قبل الـ fallback.
- **وقف تخزين fallback التسرّب** عشان المدخل ما "يتجمّد".

### د. إصلاح الـ Cascade (الأهم — كشفه live audit)
**المشكلة:** أول `429 PROVIDER_QUOTA` كان يفتح الـ circuit، وبعدها **كل** المحادثات
الصحيحة ترجع `CIRCUIT_OPEN` (انهيار متسلسل — 21 من 35 حالة فشلت).
**الحل:**
- 429 (rate-limit) صار **ما يفتح** الـ circuit (لا engine ولا per-provider) — لأنه
  ليس عطلاً، بل حدّ سرعة. التعافي صار فوري لمّا يرجع الرصيد.
- نقل بوابة الـ circuit **بعد** كل المسارات اللي ما تحتاج LLM (cache/guardrails/router/
  RAG استخراجي) — فلو المزوّد واقع، هاي تظل تشتغل صح.
- تقليل إعادة المحاولة على 429 (توفير رصيد).
- **النتيجة: 21 فشل متسلسل → صفر.**

### هـ. التقوية الأمنية (Hardening audit)
- `sanitize_input`: يشيل الرموز المخفية (zero-width + bidi/directional) وينظّف الـ maqaf.
- توسيع كشف اللغة: يمسك **أي حرف غير عبري** (Latin/Cyrillic/Greek...) → يمنع هجمات
  الـ homoglyph (مثل حرف سيريلي مموّه وسط عبري).
- prompt injection / تسريب أسرار / safety: كلها نجحت بدون مشاكل.

### و. تدوير مفاتيح Gemini (3× رصيد مجاني)
- يقرأ `GEMINI_API_KEYS` (عدّة مفاتيح مفصولة بفواصل، كل واحد من project مختلف).
- **Round-robin:** يوزّع الحمل على كل المفاتيح.
- **Failover:** لو مفتاح وصل حدّه (429) → ينتقل فوراً للتالي.
- بس لمّا **كل** المفاتيح يوصلوا الحد → fallback نظيف (متكامل مع إصلاح الـ cascade).
- إضافة مفتاح رابع = سطر واحد بالـ `.env`، بدون تعديل كود.

---

## 4. الإعدادات (env) — `ai-service/.env`

```bash
# LLM — عدّة مفاتيح Gemini (كل واحد من project مختلف = رصيد مستقل)
GEMINI_API_KEYS=key1,key2,key3
LLM_MODEL=gemini-2.5-flash-lite

# STT — faster-whisper محلي
WHISPER_MODEL=small          # base أسرع / small أدق
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
STT_TIMEOUT_SECONDS=30

# طول رد المعلّم (قابل للضبط)
CHAT_TEXT_MAX_WORDS=30
CHAT_VOICE_MAX_WORDS=20

# الكاش (يمدّد رصيد جيميني المجاني)
RESPONSE_CACHE_TTL_SECONDS=86400
RESPONSE_CACHE_MAX_ENTRIES=2000

# Pronunciation (Azure) — مطفي افتراضياً
USE_AZURE_PRONUNCIATION=false

# مشترك مع الباكند
AI_SERVICE_INTERNAL_SECRET=...
BACKEND_URL=http://127.0.0.1:3000
```

---

## 5. التشغيل محلياً

```bash
# 1. AI Service (محتاج faster-whisper متثبّت: pip install -r requirements.txt)
cd ai-service
uvicorn main:app --host 127.0.0.1 --port 8000

# 2. Backend
cd backend && node src/server.js          # :3000

# 3. Frontend
cd frontend && npm run dev                 # :5173 (أو 4173)
```
> ملاحظة: الفرونتند يستخدم `localhost:3000` للباكند. لو 3000 مشغول، استخدم proxy
> أو حرّر المنفذ.

---

## 6. الـ Audits (فحص حيّ على السيرفر)

```bash
cd ai-service
# سيناريوهات وظيفية
python evals/run_chat_scenario_audit.py
# تقوية / حالات حافة / أمان
python evals/run_chat_scenario_audit.py --dataset evals/chat_hardening_audit_dataset.json
```
التقارير بتنحفظ بـ `evals/reports/*.md` و `*.json`.

---

## 7. الحدود المعروفة والقرارات المعلّقة

| البند | الوضع |
|-------|-------|
| **رصيد Gemini المجاني** | تدوير 3 مفاتيح يعطي 3× رصيد. تحت ضغط عالٍ جداً ممكن يوصل الحد → يتدهور بلطف (`PROVIDER_QUOTA`، بدون انهيار). الحل النهائي = رصيد مدفوع بسيط أو مزوّد احتياطي (Groq). |
| **سرعة Whisper small على CPU** | ~4-10 ثواني للصوت حسب الجهاز. لو بطيء: `WHISPER_MODEL=base`. |
| **فخاخ RAG** | أسئلة خارج المنهاج فيها كلمات معروفة ممكن تسحب context؛ الموديل + حارس المفردات يمنعوا الإجابة الخاطئة. (قرار: نتركها أم نشدّد العتبة) |
| **ردود الراوتر الجاهزة** | بعض أسئلة المنهاج يرد عليها رد منسّق (يوفّر رصيد) بدل RAG كامل. (قرار: مقايضة جودة/كلفة) |
| **خصوصية free tier** | Gemini free tier ممكن تستخدم البيانات للتحسين — انتبهوا لخصوصية الطلاب. |

---

## 8. الملفات الرئيسية المتغيّرة (في `ai-service/`)

| الملف | التغيير |
|------|---------|
| `services/whisper_stt.py` | **جديد** — محرّك STT المحلي |
| `services/chat_provider.py` | Gemini-only + تدوير المفاتيح + 429 لا يفتح circuit |
| `services/chat_engine.py` | المعلّم القائد + retry + نقل بوابة circuit + sanitize + caps |
| `services/chat_guardrails.py` | sanitize_input + كشف اللغة الموسّع + تسامح المفردات |
| `services/chat_router.py` | حذف الـ Q&A المستخرج المكسور |
| `services/chat_cache.py` | كاش أكبر + مفردات معلّم موسّعة |
| `services/vocab_tracker.py` | retry + backoff |
| `prompts/*.txt` | برومبتات المعلّم القائد |
| `evals/` | أدوات الـ audit الحيّة |
| `.env` / `.env.example` | الإعدادات الجديدة |

---

*آخر تحديث: 2026-06-05*
