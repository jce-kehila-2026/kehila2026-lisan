# اختبار شامل لـ Lisan AI-Service

## 📋 الإعداد

```bash
# 1. زيّد الـbudget مؤقتًا للاختبار
# في .env:
LLM_RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_MAX_REQUESTS=100

# 2. شغّل الـserver
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🧪 السيناريوهات

### السيناريو 1️⃣: Router Answers (تحيات، شكر، عبارات معروفة)

**المتوقع**: جواب محلي من الـrouter، 0ms latency، لا LLM call

```bash
# تحية
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "שלום", "level": "A1"}'

# شكر
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "תודה רבה", "level": "A1"}'

# عبارة معروفة من الـcurriculum
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "אני רוצה קפה", "level": "A1"}'
```

**✅ المؤشرات:**
- `"routerHit": true`
- `"latencyMs": 0`
- لا توجد `"cacheHit": true` (الـrouter hit ≠ cache hit)

---

### السيناريو 2️⃣: Canonical Cache — Phrasing-Invariant

**المتوقع**: نفس الجواب رغم صياغة مختلفة + cache hit على الثاني

#### 2A: Word Meaning (Arabic phrasing)
```bash
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "שו יעני בית", "level": "A1", "includeArabic": true}'
```

**الجواب المتوقع**: "בית זה מקום שאתה גר בו" (البيت مكان تسكن فيه)

#### 2B: نفس المعنى، صياغة Hebrew مختلفة
```bash
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "מה זה בית", "level": "A1"}'
```

**الجواب المتوقع**: **نفس الجواب بالضبط**
- `"answerHe"`: "בית זה מקום שאתה גר בו"
- `"cacheHit": true` ✅ (canonical cache hit!)
- `"latencyMs": 0`

#### 2C: كلمة مختلفة لتتأكد من تمييز الـkeys
```bash
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "מה זה אבא", "level": "A1"}'
```

**الجواب المتوقع**: جواب **مختلف** عن البيت ("אבא זה האב שלך")

---

### السيناريو 3️⃣: Out-of-Scope Rejection (محلي، بدون LLM)

**المتوقع**: رفض محلي فوري، بدون LLM call

```bash
# مواضيع محظورة (من topic_policy.json)
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "בורסה", "level": "A1"}'

curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "קריפטו וביטקוין", "level": "A1"}'

# في A1، מניות محظورة؛ لكن في B2 مسموح (level exception)
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "מה זה מניות", "level": "B2"}'  # يجب تجاوز الـblock
```

**✅ المؤشرات:**
- `"fallbackUsed": true`
- `"fallbackReason": "OUT_OF_SCOPE"`
- `"latencyMs": 0-5` (محلي جدًا)

---

### السيناريو 4️⃣: Exact Cache Hit

**المتوقع**: سؤال متطابق يُرجع من الـexact cache

```bash
# السؤال الأول
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "שלום מה שלומך", "level": "A1"}'

# **السؤال الثاني بالضبط** (رسالة متطابقة تمامًا)
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "שלום מה שלומך", "level": "A1"}'
```

**✅ المؤشرات (الثاني):**
- `"cacheHit": true`
- `"latencyMs": 0`
- نفس `"answerHe"`

---

### السيناريو 5️⃣: Mixed Arabic-Hebrew (canonical intent detection)

**المتوقع**: الـgatekeeper يكتشف intent عبر Arabic+Hebrew

```bash
# "What does בית mean?" but asked in Arabic
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "شو يعني בית", "level": "A1", "includeArabic": true}'

# نفس الـintent، صياغة مختلفة قليلًا
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "ما معنى בית", "level": "A1", "includeArabic": true}'
```

**✅ المؤشرات:**
- الجواب يكون نفسه (canonical cache)
- الثاني يكون `"cacheHit": true`

---

### السيناريو 6️⃣: Translation Request

```bash
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "תרגם בעברית \"hello\"", "level": "A1"}'
```

**المتوقع**: "hello" in Hebrew (محلي من templates أو LLM)

---

### السيناريو 7️⃣: Analytics Report

**المتوقع**: رؤية توزيع المسارات

```bash
curl -X GET http://localhost:8000/api/ai/analytics \
  -H "X-Internal-Service-Secret: dev-secret-only-for-testing"
```

**✅ ابحث عن:**
```json
{
  "request_paths": {
    "total_requests": 15,
    "counts": {
      "local": 8,          // router hits
      "cache": 4,          // cache hits (canonical + exact)
      "local_reject": 2,   // out-of-scope
      "llm": 1             // LLM calls (if any)
    },
    "local_served_rate": 0.8,   // 80% without LLM
    "llm_reached_rate": 0.067   // ~7% hit LLM
  }
}
```

---

## 🎯 Checklist للاختبار

- [ ] Router answers (تحيات) — `routerHit: true`, `latencyMs: 0`
- [ ] Canonical cache (2 صياغات لنفس الكلمة) — الثاني يكون `cacheHit: true`
- [ ] Out-of-scope local rejection — `fallbackUsed: true`, `latencyMs: 0-5`
- [ ] Exact cache hit — سؤال متطابق يُرجع فورًا
- [ ] Mixed AR/HE detection — يكتشف intent رغم الخليط
- [ ] Level exceptions — `مניות` محظور في A1، مسموح في B2
- [ ] Analytics — `local_served_rate` أعلى من 70%، `llm_reached_rate` أقل من 20%

---

## 🐛 Troubleshooting

### إذا كل شيء يُرجع "יש עומס"
- تحقق من `.env`: `LLM_RATE_LIMIT_MAX_REQUESTS=100` (للاختبار)
- أعد تشغيل الـserver

### إذا لم تكن cache hits
- تحقق: هل الرسالة **متطابقة تمامًا** (بما فيها المسافات)؟
- السؤال: هل الـ`level` نفسه؟

### إذا كانت canonical cache لا تعمل
- جرّب: `"message": "שו יעני בית"` ثم `"message": "מה זה בית"`
- يجب الثاني يكون `cacheHit: true`
- إذا لم يحدث: تحقق من logs — هل يوجد خطأ في `derive_intent_key`؟

---

## 📊 النتيجة المتوقعة (بعد 15-20 سؤال)

```
Total Requests:       20
Local (router):       8  (40%)
Cache (canonical):    6  (30%)
Out-of-Scope:         5  (25%)
LLM:                  1  (5%)
─────────────────────────
Local Served Rate:    95%  ✅
LLM Reached Rate:     5%   ✅
```

**النتيجة**: الـ95% من الأسئلة محلية، 5% فقط للـLLM — **هذا هو الهدف للـ1000 طالب/شهر على الـfree tier!**
