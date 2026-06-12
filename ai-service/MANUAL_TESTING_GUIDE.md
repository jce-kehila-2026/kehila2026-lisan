# Manual Testing Guide — Lisan AI Service

## 🛠️ الـSetup قبل الاختبار

```bash
# 1. تأكد الـserver شغّال على port 8000
# في terminal منفصل:
cd c:\Users\mshar\Desktop\lisan\kehila2026-lisan\ai-service
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. الـinternal secret من الـ.env
X-Internal-Service-Secret: lisan-dev-secret-2026
```

---

## طريقة 1️⃣: استخدام cURL (Terminal/PowerShell)

### الأساسيات

```powershell
# التحية البسيطة
$secret = "lisan-dev-secret-2026"
$body = @{
    message = "שלום"
    level = "A1"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{"X-Internal-Service-Secret" = $secret} `
  -Body $body | Select-Object -ExpandProperty Content | ConvertFrom-Json
```

### سيناريوهات الاختبار

#### 1️⃣ معنى كلمة (Canonical Cache)

```powershell
$secret = "lisan-dev-secret-2026"

# السؤال الأول
$body1 = @{
    message = "שו יעני בית"
    level = "A1"
    includeArabic = $true
} | ConvertTo-Json

$r1 = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
  -Method POST -ContentType "application/json" `
  -Headers @{"X-Internal-Service-Secret" = $secret} `
  -Body $body1
$j1 = $r1.Content | ConvertFrom-Json

Write-Output "الجواب الأول:"
Write-Output $j1.answerHe
Write-Output "cacheHit: $($j1.cacheHit)"
Write-Output ""

# السؤال الثاني (نفس الكلمة، صياغة مختلفة)
$body2 = @{
    message = "מה זה בית"
    level = "A1"
} | ConvertTo-Json

$r2 = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
  -Method POST -ContentType "application/json" `
  -Headers @{"X-Internal-Service-Secret" = $secret} `
  -Body $body2
$j2 = $r2.Content | ConvertFrom-Json

Write-Output "الجواب الثاني (يجب نفسه):"
Write-Output $j2.answerHe
Write-Output "cacheHit: $($j2.cacheHit) ← يجب TRUE"
Write-Output ""

# تحقق أن الجوابات متطابقة
if ($j1.answerHe -eq $j2.answerHe) {
    Write-Output "✅ الـcanonical cache يعمل (جوابات متطابقة)"
} else {
    Write-Output "❌ مشكلة: الجوابات مختلفة"
}
```

#### 2️⃣ Out-of-Scope Rejection (محلي)

```powershell
$secret = "lisan-dev-secret-2026"

# مواضيع محظورة
$blocked = @("בורסה", "קריפטו", "ביטקוין")

foreach ($topic in $blocked) {
    $body = @{
        message = $topic
        level = "A1"
    } | ConvertTo-Json
    
    $r = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
      -Method POST -ContentType "application/json" `
      -Headers @{"X-Internal-Service-Secret" = $secret} `
      -Body $body
    $j = $r.Content | ConvertFrom-Json
    
    Write-Output "Topic: $topic"
    Write-Output "  fallbackUsed: $($j.fallbackUsed)"
    Write-Output "  fallbackReason: $($j.fallbackReason)"
    Write-Output "  latencyMs: $($j.latencyMs) (يجب < 5)"
    Write-Output ""
}
```

#### 3️⃣ Level Exception (مניות محظورة في A1، مسموח في B2)

```powershell
$secret = "lisan-dev-secret-2026"

# A1 - يجب رفض
Write-Output "🔴 A1 - מניות (يجب رفض):"
$body_a1 = @{
    message = "מה זה מניות"
    level = "A1"
} | ConvertTo-Json

$r_a1 = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
  -Method POST -ContentType "application/json" `
  -Headers @{"X-Internal-Service-Secret" = $secret} `
  -Body $body_a1
$j_a1 = $r_a1.Content | ConvertFrom-Json
Write-Output "fallbackUsed: $($j_a1.fallbackUsed) (يجب TRUE)"
Write-Output "fallbackReason: $($j_a1.fallbackReason)"
Write-Output ""

# B2 - يجب قبول
Write-Output "🟢 B2 - מניות (يجب قبول):"
$body_b2 = @{
    message = "מה זה מניות"
    level = "B2"
} | ConvertTo-Json

$r_b2 = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
  -Method POST -ContentType "application/json" `
  -Headers @{"X-Internal-Service-Secret" = $secret} `
  -Body $body_b2
$j_b2 = $r_b2.Content | ConvertFrom-Json
Write-Output "fallbackUsed: $($j_b2.fallbackUsed) (يجب FALSE)"
Write-Output "answerHe: $($j_b2.answerHe)"
```

#### 4️⃣ Exact Cache Hit

```powershell
$secret = "lisan-dev-secret-2026"

# السؤال الأول
$body = @{
    message = "שלום מה שלומך"
    level = "A1"
} | ConvertTo-Json

Write-Output "الـrequest الأول (store in cache):"
$r1 = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
  -Method POST -ContentType "application/json" `
  -Headers @{"X-Internal-Service-Secret" = $secret} `
  -Body $body
$j1 = $r1.Content | ConvertFrom-Json
$ans1 = $j1.answerHe
Write-Output "cacheHit: $($j1.cacheHit) (يجب FALSE - أول مرة)"
Write-Output ""

# السؤال الثاني (متطابق تمامًا)
Write-Output "الـrequest الثاني (نفس الـmessage بالضبط):"
$r2 = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
  -Method POST -ContentType "application/json" `
  -Headers @{"X-Internal-Service-Secret" = $secret} `
  -Body $body
$j2 = $r2.Content | ConvertFrom-Json
$ans2 = $j2.answerHe
Write-Output "cacheHit: $($j2.cacheHit) ✅ (يجب TRUE)"
Write-Output ""

if ($ans1 -eq $ans2) {
    Write-Output "✅ الأجوبات متطابقة"
} else {
    Write-Output "❌ الأجوبات مختلفة"
}
```

#### 5️⃣ Analytics Report

```powershell
$secret = "lisan-dev-secret-2026"

Write-Output "📊 Analytics Report:"
$r = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/analytics" `
  -Method GET `
  -Headers @{"X-Internal-Service-Secret" = $secret}
$analytics = $r.Content | ConvertFrom-Json
$analytics.request_paths | ConvertTo-Json -Depth 5 | Write-Output
```

---

## طريقة 2️⃣: استخدام Postman

### الـSetup

1. **Download Postman** من https://www.postman.com/downloads/
2. **إنشاء Collection جديدة** تسمى "Lisan AI Testing"
3. **إنشاء Environment متغيرات:**
   - `base_url` = `http://localhost:8000`
   - `secret` = `lisan-dev-secret-2026`

### Requests

#### Request 1: Greeting
```
POST {{base_url}}/api/ai/chat
Headers:
  X-Internal-Service-Secret: {{secret}}
  Content-Type: application/json

Body (raw JSON):
{
  "message": "שלום",
  "level": "A1"
}
```

#### Request 2: Word Meaning (Arabic phrasing)
```
POST {{base_url}}/api/ai/chat
Headers:
  X-Internal-Service-Secret: {{secret}}
  Content-Type: application/json

Body:
{
  "message": "שו יעני בית",
  "level": "A1",
  "includeArabic": true
}
```

#### Request 3: Word Meaning (Hebrew phrasing)
```
POST {{base_url}}/api/ai/chat
Headers:
  X-Internal-Service-Secret: {{secret}}

Body:
{
  "message": "מה זה בית",
  "level": "A1"
}
```

**المتوقع**: الجواب نفسه رغم الصياغ المختلفة ✅

#### Request 4: Blocked Topic
```
POST {{base_url}}/api/ai/chat

Body:
{
  "message": "בורסה",
  "level": "A1"
}
```

**المتوقع**: `fallbackUsed: true`, `fallbackReason: "OUT_OF_SCOPE"`

#### Request 5: Analytics
```
GET {{base_url}}/api/ai/analytics
Headers:
  X-Internal-Service-Secret: {{secret}}
```

---

## طريقة 3️⃣: استخدام Browser (REST Client Extension)

### VS Code Extension

1. **Install**: REST Client extension (Huachao Mao)
2. **Create file**: `test.http` في نفس الـdirectory

```http
### Variables
@base_url = http://localhost:8000
@secret = lisan-dev-secret-2026

### 1. Greeting
POST {{base_url}}/api/ai/chat
X-Internal-Service-Secret: {{secret}}
Content-Type: application/json

{
  "message": "שלום",
  "level": "A1"
}

### 2. Word Meaning - Arabic
POST {{base_url}}/api/ai/chat
X-Internal-Service-Secret: {{secret}}
Content-Type: application/json

{
  "message": "שו יעני בית",
  "level": "A1",
  "includeArabic": true
}

### 3. Word Meaning - Hebrew (same word)
POST {{base_url}}/api/ai/chat
X-Internal-Service-Secret: {{secret}}
Content-Type: application/json

{
  "message": "מה זה בית",
  "level": "A1"
}

### 4. Out-of-Scope (Stocks)
POST {{base_url}}/api/ai/chat
X-Internal-Service-Secret: {{secret}}
Content-Type: application/json

{
  "message": "בורסה",
  "level": "A1"
}

### 5. Level Exception - A1
POST {{base_url}}/api/ai/chat
X-Internal-Service-Secret: {{secret}}
Content-Type: application/json

{
  "message": "מה זה מניות",
  "level": "A1"
}

### 6. Level Exception - B2
POST {{base_url}}/api/ai/chat
X-Internal-Service-Secret: {{secret}}
Content-Type: application/json

{
  "message": "מה זה מניות",
  "level": "B2"
}

### 7. Analytics
GET {{base_url}}/api/ai/analytics
X-Internal-Service-Secret: {{secret}}
```

**الاستخدام:**
- اضغط "Send Request" فوق كل request
- شوف الـresponse في الـpanel اليمين

---

## 🎯 Checklist — يجب تختبر هاي الحاجات

- [ ] **Greeting** → `routerHit: true` أو `latencyMs: 0`
- [ ] **Canonical Cache** → السؤال الثاني يكون `cacheHit: true` (أو الجوابات متطابقة)
- [ ] **Out-of-Scope** → `fallbackUsed: true`, `fallbackReason: "OUT_OF_SCOPE"`
- [ ] **Level Exception** → בורסה رفض في A1، قبول في B2
- [ ] **Exact Cache** → السؤال المتطابق يكون فوري (0ms)
- [ ] **Analytics** → `local_served_rate` > 70%, `llm_reached_rate` < 30%

---

## 🐛 Debugging Tips

### إذا الـresponse فيها خطأ

```powershell
# اطبع الـresponse كاملًا
$r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

### إذا الـlatency عالية

```powershell
# تحقق من الـserver logs في الـterminal الأخرى
# ابحث عن errors أو warnings
```

### إذا cache ما تعمل

```powershell
# تأكد الـmessage متطابقة بالضبط (بما فيها المسافات)
# وأن الـ`level` نفسه
```

### إذا LLM budget consumed بسرعة

```
اطّلع على الـ.env:
LLM_RATE_LIMIT_MAX_REQUESTS=100   # يجب تكون عالية للـdev
```

---

## 📝 ملاحظات مهمة

1. **الـserver يجب يكون شغّال** قبل أي اختبار
2. **الـ.env variables مهمة** — تحقق أنها صحيحة
3. **الـcache stateful** — requests اللاحقة تستفيد من الأولى
4. **الـrate limit per-user** — استخدم `X-User-ID` header لتغيير الـuser

---

## مثال عملي — Testing كامل (PowerShell)

```powershell
function Test-LisanAI {
    param([string]$message, [string]$level = "A1")
    
    $secret = "lisan-dev-secret-2026"
    $body = @{
        message = $message
        level = $level
    } | ConvertTo-Json
    
    $r = Invoke-WebRequest -Uri "http://localhost:8000/api/ai/chat" `
      -Method POST -ContentType "application/json" `
      -Headers @{"X-Internal-Service-Secret" = $secret} `
      -Body $body
    $j = $r.Content | ConvertFrom-Json
    
    return $j
}

# استخدام
$r1 = Test-LisanAI "שלום"
Write-Output "Greeting: $($r1.answerHe)"
Write-Output "LatencyMs: $($r1.latencyMs)"
```

**شغّل الـfunction:**
```powershell
Test-LisanAI "מה זה בית" | ConvertTo-Json
```

---

جاهز للاختبار؟ 🚀
