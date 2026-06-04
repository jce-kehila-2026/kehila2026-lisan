# Lisan Production Deploy

## 1. أول مرة فقط — أسرار + Firebase

```bash
# توليد أسرار جديدة للإنتاج
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 32   # → AI_SERVICE_INTERNAL_SECRET

# تحضير ملف Firebase كسطر واحد
cat serviceAccountKey.json | tr -d '\n'   # → الصق في FIREBASE_SERVICE_ACCOUNT
```

## 2. ملف `.env`

```bash
cp .env.production.example .env
# عبّئ كل القيم — البودي حماية fail-fast سترفض الإقلاع إذا أيّ شيء ناقص
```

**⚠️ هام:** المفاتيح الموجودة الآن في الـ chat (Firebase + Gemini + Azure) **مكشوفة** —
أعد توليدها قبل النشر الفعلي.

## 3. نشر Firestore indexes (مرّة واحدة)

```bash
firebase login
firebase deploy --only firestore:indexes,firestore:rules
```

## 4. بناء وتشغيل الـ stack

```bash
docker compose up -d --build
docker compose logs -f
```

## 5. التحقق

```bash
# Liveness (سريع، لا يفحص DB)
curl http://localhost:3000/api/health

# Readiness (يفحص Firestore + ai-service + Redis)
curl http://localhost:3000/api/ready
curl http://localhost:8000/api/ai/ready   # من داخل docker network فقط
```

## 6. عمليات يدوية

```bash
# Reset لكل circuit breakers بعد عودة provider
curl -X POST http://localhost:3000/api/admin/ai/circuits/reset \
  -H "Authorization: Bearer <admin-jwt>"

# مراقبة استخدام الـ LLM
curl http://localhost:3000/api/admin/ai/analytics \
  -H "Authorization: Bearer <admin-jwt>"

# سجلات الـ provider (للتشخيص)
curl http://localhost:3000/api/admin/ai/logs?provider=gemini&status=failed \
  -H "Authorization: Bearer <admin-jwt>"
```

## 7. Rolling deploy (zero-downtime)

```bash
docker compose up -d --build --no-deps backend
# انتظر 10 ثوانٍ، تحقق من /api/ready
docker compose up -d --build --no-deps ai-service
```

vocab_tracker يجمع الـ in-flight threads لـ 5 ثوانٍ على الـ SIGTERM،
بحيث لا تُفقد بيانات الطلاب الأخيرة عند restart.

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| `[FATAL] JWT_SECRET is too short` | استخدم `openssl rand -hex 64`، ليس قيمة dev |
| `Firebase credentials not found` | تأكد أن `FIREBASE_SERVICE_ACCOUNT` JSON بسطر واحد |
| CORS errors في console | عبّئ `CORS_ALLOWED_ORIGINS` بدومين الـ frontend |
| `/api/ready` يرجع 503 | راجع الـ `checks` field — أيّ خدمة معطلة؟ |
| AI requests تفشل بـ timeout | تحقق أن `ai-service` container يعمل: `docker compose ps` |
| Vocab progress غير محفوظ | تحقق من سجل `vocab_tracker_error` في ai-service logs |
