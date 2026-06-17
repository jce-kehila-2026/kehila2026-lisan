# Lisan — Production & Completeness Checklist
> آخر تحديث: 2026-05-29 — مشاكل ستظهر للمستخدمين أو ميزات غير مكتملة
> نطاق: `ai-service` + `backend` (الواجهة الأمامية خارج النطاق)

---

## Legend
- 🚨 BLOCKER — يكسر الإنتاج فوراً
- 🔴 HIGH — يفشل بصمت أو يفقد بيانات
- 🟡 MEDIUM — يعمل لكن خطأ في حالات معينة
- 🟢 LOW — صقل / توحيد

---

## 🚨 BLOCKERS — يجب الإصلاح قبل أي نشر

### P01 🚨 — Auth bypass via `PYTEST_CURRENT_TEST` env var
**ملف:** [ai-service/routes/chat.py:80](kehila2026-lisan/ai-service/routes/chat.py#L80)
```python
if "PYTEST_CURRENT_TEST" in os.environ and not authorization:
    return None
```
لو هذا الـ env var تسرّب لبيئة الإنتاج (CI/CD نسيان، Docker image قديم) → أي طلب بدون `Authorization` header يمر بدون JWT validation.
**التأثير:** اختراق كامل لحماية الـ JWT.
**الحالة:** ✅ DONE

---

### P02 🚨 — CORS مقفول على `localhost` فقط في ai-service
**ملف:** [ai-service/main.py:33-38](kehila2026-lisan/ai-service/main.py#L33)
```python
allow_origins=["http://localhost:3001", "http://localhost:3000"]
```
في الإنتاج: الـ frontend على دومين حقيقي → كل طلب يُرفض بـ CORS error → التطبيق لا يعمل أبداً.
**التأثير:** الواجهة لا تستطيع الاتصال بـ ai-service.
**الحالة:** ✅ DONE

---

### P03 🚨 — `AI_SERVICE_URL` يفولت سراً لـ `localhost:8000`
**ملفات:**
- [backend/src/services/aiChatService.js:4](kehila2026-lisan/backend/src/services/aiChatService.js#L4)
- [backend/src/routes/chats.js:13](kehila2026-lisan/backend/src/routes/chats.js#L13)
- [backend/src/routes/admin.js:22](kehila2026-lisan/backend/src/routes/admin.js#L22)
```js
process.env.AI_SERVICE_URL || 'http://localhost:8000'
```
لو نسي الـ deployer هذا الـ env var → backend الإنتاج يحاول الاتصال بـ localhost → timeout على كل طلب AI.
**التأثير:** كل ميزات الـ AI تفشل في صمت بدون رسالة واضحة.
**الحالة:** ✅ DONE (يحتاج fail-fast عند البداية)

---

### P04 🚨 — Firebase credentials بدون validation عند الإقلاع
**ملف:** [backend/src/config/firebase.js:6-10](kehila2026-lisan/backend/src/config/firebase.js#L6)
```js
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(...)  // ينفجر بدون رسالة واضحة
} else {
  serviceAccount = require(.../privateKey.json)  // crash إن لم يكن موجوداً
}
```
لو الـ ENV var غير موجود والملف غير موجود → الخادم لا يقلع، لكن الـ error غامض.
**التأثير:** صعوبة تشخيص deploys فاشلة.
**الحالة:** ✅ DONE

---

## 🔴 HIGH — يجب الإصلاح هذا الأسبوع

### P05 🔴 — `JWT_SECRET` بدون validation عند البداية
**ملف:** [backend/src/server.js:23-30](kehila2026-lisan/backend/src/server.js#L23)
الـ `warnMissingEnvVars()` يفحص `AI_SERVICE_URL` فقط ولا يفحص `JWT_SECRET`. لو غير موجود، الخادم يقلع لكن كل login يفشل بـ 500.
**التأثير:** المستخدمون لا يستطيعون تسجيل الدخول.
**الحالة:** ✅ DONE

---

### P06 🔴 — Streaming proxy بدون backpressure
**ملف:** [backend/src/routes/chats.js:84-119](kehila2026-lisan/backend/src/routes/chats.js#L84)
```js
upstream.data.pipe(res);
```
لو client بطيء أو انقطع، Node يكدّس chunks في الذاكرة بلا حد. تحت الحمل: OOM crash.
**التأثير:** قد يُسقط الخادم تحت ضغط متعدد المستخدمين.
**الحالة:** ✅ DONE

---

### P07 🔴 — Stream error handler يكتب بعد `res` انتهى
**ملف:** [backend/src/routes/chats.js:111-114](kehila2026-lisan/backend/src/routes/chats.js#L111)
```js
upstream.data.on('error', () => {
  res.write('data: [ERROR]\n\n');  // قد ترمي "headers already sent"
  res.end();
});
```
لو كانت الـ headers أُرسلت أصلاً ثم upstream فشل → exception غير مُلتقط.
**التأثير:** request يتعطل بدلاً من رسالة خطأ سليمة.
**الحالة:** ✅ DONE

---

### P08 🔴 — Streaming generator في ai-service لا يتوقف عند انقطاع العميل
**ملف:** [ai-service/routes/chat.py:84-101](kehila2026-lisan/ai-service/routes/chat.py#L84)
```python
async def _sse_generator():
    for token in token_iter:
        yield f"data: {escaped}\n\n"
```
لو العميل أغلق الـ connection، الـ generator يكمل استهلاك tokens من LLM (وtokens مدفوعة!).
**التأثير:** هدر تكلفة LLM على ردود لا تُرسل.
**الحالة:** ✅ DONE

---

### P09 🔴 — Admin endpoints بدون rate limiting
**ملف:** [backend/src/routes/admin.js](kehila2026-lisan/backend/src/routes/admin.js)
كل routes الـ admin (analytics, logs, users) بدون أي حد سرعة.
**التأثير:** مهاجم يضرب `/api/admin/ai/logs` ألف مرة بالثانية → backend بطيء + ai-service يحترق.
**الحالة:** ✅ DONE

---

### P10 🔴 — `pronunciation/assess` بدون فحص حجم ملف الصوت
**ملف:** [ai-service/routes/pronunciation.py](kehila2026-lisan/ai-service/routes/pronunciation.py)
لا يوجد فحص قبل قراءة `audio_bytes` في الذاكرة.
**التأثير:** ملف صوت 500MB → OOM يقتل الـ worker.
**الحالة:** ✅ DONE

---

### P11 🔴 — Pronunciation proxy في backend لا يمرر `userToken`
**ملف:** [backend/src/routes/chats.js:126-153](kehila2026-lisan/backend/src/routes/chats.js#L126)
الـ proxy الجديد للـ pronunciation يستدعي ai-service بدون تمرير الـ JWT.
**التأثير:** لو ai-service فعّل JWT validation → الـ proxy يفشل دائماً.
**الحالة:** ✅ DONE

---

### P12 🔴 — `vocab_tracker` يستخدم daemon thread بدون graceful shutdown
**ملف:** [ai-service/services/vocab_tracker.py:113-118](kehila2026-lisan/ai-service/services/vocab_tracker.py#L113)
عند restart (rolling deploy)، الـ daemon threads تُقتل في منتصف POST → فقدان بيانات تتبع المفردات.
**التأثير:** بيانات تقدم الطلاب الأخيرة قد تُفقد عند كل نشر.
**الحالة:** ✅ DONE

---

## 🟡 MEDIUM — مكتمل لكن غير محكم

### P13 🟡 — لا يوجد `/api/ai/health` ضمن قائمة الـ rate-limit-exempt الصحيحة
**ملف:** [ai-service/main.py:82-87](ai-service/main.py#L82)
`/api/ai/health` معفى — جيد. لكن `/api/ai/analytics` و `/api/ai/logs` ليست معفاة، فإذا الـ admin dashboard يستعلم بشكل دوري قد تُحجب.
**الحالة:** ✅ DONE

---

### P14 🟡 — `is_clearly_out_of_scope` يستخدم نسبة الكلمات غير المعروفة
ملاحظة من الجلسات السابقة: لمستوى A1، رسالة تحتوي على كلمة جديدة واحدة + كلمتين معروفتين قد تُصنّف خطأً كـ OOS.
**التأثير:** ردود fallback متكررة على رسائل صحيحة للطالب.
**الحالة:** ☐ يحتاج tuning بناءً على بيانات حقيقية

---

### P15 🟡 — `text_to_speech.py` تُرجع `None` دائماً (TTS server-side معطّل)
**ملف:** [ai-service/services/text_to_speech.py](kehila2026-lisan/ai-service/services/text_to_speech.py)
الـ voice response دائماً ترجع `audioBase64=None`. الـ frontend يجب أن تعمل TTS client-side. لو frontend ينتظر audio من server → الصوت لا يُسمع أبداً.
**التأثير:** المستخدم يرى رد نصي لكن لا يسمع صوت — قد يبدو معطلاً.
**الحالة:** ☐ يحتاج توثيق صريح للـ frontend team أو تفعيل TTS server-side

---

### P16 🟡 — `/api/ai/health` لا يفحص Firestore أو Redis
**ملفات:**
- [backend/src/server.js:66](kehila2026-lisan/backend/src/server.js#L66)
- [ai-service/main.py:77](kehila2026-lisan/ai-service/main.py#L77)

Health check يرجع 200 دائماً حتى لو DB/Redis معطّل.
**التأثير:** Load balancer يظن الـ service صحي → traffic يذهب لـ instance معطّل.
**الحالة:** ✅ DONE (يحتاج readiness probe منفصل)

---

### P17 🟡 — Logging يُسرّب `userId` بدون تجريد
**ملف:** [backend/src/controllers/chatController.js](kehila2026-lisan/backend/src/controllers/chatController.js) (عدة أماكن)
كل error logs تحتوي `userId: req.user?.uid` → اللوغز قد تنتهي في 3rd party (Sentry/Datadog) بدون GDPR compliance.
**التأثير:** مشكلة compliance.
**الحالة:** ✅ DONE

---

### P18 🟡 — Error response shapes غير موحدة بين ai-service و backend
- ai-service: `{"detail": "..."}`
- backend: `{"success": false, "error": "...", "code": "..."}`

الـ frontend يحتاج كتابة كود مزدوج للتعامل مع الاثنين.
**الحالة:** ✅ DONE (توحيد عبر middleware في backend يحوّل ردود ai-service)

---

### P19 🟡 — Pronunciation timeout غير محدد على Azure SDK
**ملف:** [ai-service/services/pronunciation.py](kehila2026-lisan/ai-service/services/pronunciation.py)
لو Azure SDK علّق → الطلب ينتظر للأبد (إلا أن FastAPI يقتله بعد دقائق).
**التأثير:** worker thread محجوز.
**الحالة:** ✅ DONE

---

### P20 🟡 — Firestore composite index غير معرّف
**ملف:** [backend/src/controllers/vocabController.js](kehila2026-lisan/backend/src/controllers/vocabController.js)
الـ query `.where('userId').orderBy('seenCount')` تحتاج composite index — Firestore سيُعطي warning في الـ logs ولن يعمل في أول مرة على الـ production.
**التأثير:** الأول مرة يفتح الـ vocab progress → error حتى يُنشأ الـ index يدوياً.
**الحالة:** ✅ DONE (أضف `firestore.indexes.json`)

---

## 🟢 LOW — صقل

### P21 🟢 — `text_to_speech.build_ssml` يبني SSML لكن لا أحد يستخدمه فعلاً
الـ voice endpoint يبني SSML ويرسله في `ssmlText` لكن لا backend ولا واجهة تشغّله. ميزة "ميتة".
**الحالة:** ☐ يحتاج توثيق أو حذف

---

### P22 🟢 — `evaluation.py` و `pronunciation.py` (routes) موجودة لكن غير مغلفة بـ backend proxy
لا توجد routes في backend لـ `POST /api/ai/evaluate-speaking`. لو frontend يحاول استدعاءها → 404.
**الحالة:** ✅ DONE

---

### P23 🟢 — `voice_circuits.py` STT/TTS circuits بدون UI/endpoint لإعادة الضبط
لو STT circuit مفتوح، الأدمن لا يستطيع reset يدوياً. يجب انتظار `STT_CIRCUIT_RECOVERY_SECONDS`.
**الحالة:** ✅ DONE (أضف `/api/admin/ai/circuits/reset`)

---

### P24 🟢 — `chat_engine` يحاول استيراد `tts_circuit` و`stt_circuit` لكن في beginning of test session فقط
**ملف:** [ai-service/tests/conftest.py](kehila2026-lisan/ai-service/tests/conftest.py)
يستخدم `try/except Exception: pass` — يُخفي bugs حقيقية.
**الحالة:** ☐ replace with specific except

---

### P25 🟢 — `backend/.env.example` فيه `AI_SERVICE_STREAM_TIMEOUT_MS` لكن الكود لا يقرأها
الـ env var موثقة لكن الـ code يستخدم 60000 hardcoded.
**ملف:** [backend/src/routes/chats.js:96](kehila2026-lisan/backend/src/routes/chats.js#L96)
**الحالة:** ✅ DONE

---

## ✅ تم التحقق منها (ليست مشاكل)

| ادعاء | الحالة | السبب |
|--------|--------|--------|
| `.env` files committed | ✅ آمن | `.gitignore` يستثنيها صراحة |
| `FormData/Blob` not in Node | ✅ آمن | Node 22 يدعمها أصلاً |
| `redis` package missing | ✅ مُصلح سابقاً | في G03 |
| Backend tests | ✅ موجودة | في G06 من الجلسة السابقة |

---

## ترتيب الإصلاح المقترح

| الأولوية | المعرّف | الجهد |
|----------|---------|--------|
| 1 | P01 — إزالة PYTEST bypass | 2 دقيقة |
| 2 | P02 — CORS من env var | 5 دقائق |
| 3 | P03 — fail-fast على AI_SERVICE_URL | 10 دقائق |
| 4 | P05 — fail-fast على JWT_SECRET | 5 دقائق |
| 5 | P04 — Firebase credentials clear error | 10 دقائق |
| 6 | P09 — admin rate limiting | 10 دقائق |
| 7 | P10 — audio size limit | 5 دقائق |
| 8 | P11 — pronunciation proxy token | 5 دقائق |
| 9 | P06+P07 — streaming backpressure & errors | 30 دقيقة |
| 10 | P08 — generator cleanup | 15 دقيقة |
| 11 | P20 — Firestore index | 15 دقيقة |
| 12 | P16 — readiness probes | 30 دقيقة |
| 13 | الباقي | حسب الحاجة |
