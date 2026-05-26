# Lisan Chatbot Delivery Roadmap

## Executive Summary

المشروع اليوم يملك `AI service` قوية، لكنه ليس بعد منتج شات بوت جاهزاً للطالب.

الجزء الذي أُنجز بشكل جيد:
- FastAPI AI service
- chat route
- provider wrapper
- cache and startup curriculum loading
- internal security header
- pronunciation assessment route

الجزء غير المكتمل الذي يمنع التسليم كمنتج حقيقي:
- لا يوجد `chat_engine` فعلي مكتمل أو مضمون داخل `ai-service`
- لا يوجد `Express gateway` مكتمل بين الواجهة و FastAPI
- لا يوجد `Chat UI` جاهز للطالب
- لا يوجد `voice flow` متكامل
- لا يوجد `conversation persistence` مكتمل end-to-end
- لا توجد بيانات حقيقية موزعة على 4 مستويات

الخلاصة:
إذا أردنا تسليم "AI brain" فقط، فنحن قريبون جداً.
إذا أردنا تسليم "student-facing chatbot" صوتي وكتابي، فما زال هناك عمل تكاملي مهم في `backend` و `frontend`.

---

## Current Status

### 1. AI Service

جاهز تقريباً كبنية تحتية، ويشمل:
- endpoint للشات
- endpoint لتقييم النطق
- حماية عبر `X-Internal-Service-Secret`
- structured logging
- startup curriculum cache
- retry محدود لمزود Gemini
- `.env.example`

### 2. Main Product

غير جاهز بعد كتجربة استخدام نهائية، لأن هذه الأجزاء ما زالت ناقصة أو غير مضمونة:
- ربط React مع Express ثم FastAPI
- حفظ واسترجاع المحادثات
- واجهة شات كاملة
- إدخال صوتي وخروج صوتي
- اختبارات end-to-end

### 3. Content Reality

هيكل النظام يدعم تعدد المستويات، لكن بيانات المنهج الحالية ليست كافية لتسليم 4 مستويات حقيقية.

المشكلة هنا ليست برمجية فقط، بل محتوى أيضاً.

---

## Realistic Delivery Goal

الهدف العملي للتسليم الجامعي ليس بناء منصة SaaS كاملة، بل:

- شات نصي يعمل من الواجهة
- إدخال صوتي من المتصفح
- نطق الرد من المتصفح
- اتصال آمن عبر Express backend
- ردود مقيدة بالمنهج
- حفظ محادثات أساسي
- ديمو مستقر ومفهوم

هذا يكفي كتسليم قوي ومقنع.

---

## Critical Fix Before Freeze

قبل أي شيء، يجب تثبيت اعتماديات Python بشكل صحيح.

ملف `requirements.txt` داخل `ai-service` يجب أن يحتوي على الأقل:

```txt
fastapi
uvicorn
pydantic
google-genai
google-generativeai
azure-cognitiveservices-speech
python-dotenv
python-multipart
```

بدون هذا، تشغيل خدمة الشات على بيئة جديدة قد يفشل.

---

## What Remains To Finish

## Phase 1: Finalize AI Service

هذه المرحلة قصيرة، وهدفها إغلاق طبقة الذكاء الاصطناعي بشكل مستقر.

### Required
- التأكد من وجود `chat_engine.py` فعلياً
- ربط `routes/chat.py` بالمحرك الحقيقي
- تحديث `requirements.txt`
- تجربة startup كاملة للخدمة
- تجربة endpoint للشات محلياً

### Done When
- السيرفر يقلع بدون أخطاء
- `POST /api/ai/chat` يعمل عبر المحرك الحقيقي
- الأخطاء ترجع بشكل متحكم فيه

---

## Phase 2: Build Express Gateway

هذه أهم خطوة بعد AI service.

### Goal
منع الواجهة من الاتصال المباشر بـ FastAPI، وجعل Express هو البوابة الوحيدة.

### Required
- إنشاء route مثل `POST /api/chat`
- استقبال طلب الطالب في Express
- التحقق من المستخدم
- إرسال الطلب إلى FastAPI
- إضافة `X-Internal-Service-Secret`
- إعادة response للواجهة
- توحيد شكل الأخطاء

### Optional But Strongly Recommended
- timeout على طلب AI
- rate limiting
- logging آمن

### Done When
- React يتصل بـ Express فقط
- Express يتصل بـ FastAPI بنجاح
- أي فشل في AI لا يكسر backend

---

## Phase 3: Add Chat Persistence

بدون هذه المرحلة، كل محادثة ستكون مؤقتة وضعيفة.

### Required
- إنشاء conversation عند أول رسالة
- حفظ رسائل المستخدم
- حفظ ردود المساعد
- استرجاع المحادثات السابقة
- استرجاع رسائل محادثة معينة

### Data Store
- Firestore أو أي تخزين موجود لديكم في المشروع

### Done When
- refresh لا يضيع المحادثة
- الطالب يرى محادثاته السابقة
- لا يمكن لمستخدم رؤية محادثات مستخدم آخر

---

## Phase 4: Build React Chat UI

هذه المرحلة هي التي تحول المشروع من خدمة داخلية إلى منتج فعلي.

### Required
- صفحة شات حقيقية
- message list
- input أو textarea
- send button
- loading state
- error state
- fallback display
- mobile-friendly layout

### Important
- React يجب أن يكلم Express فقط
- لا تعرض تفاصيل أخطاء داخلية للمستخدم

### Done When
- الطالب يستطيع إرسال رسالة واستلام رد واضح
- الواجهة لا تنكسر على المحمول
- هناك حالة واضحة للتحميل والخطأ

---

## Phase 5: Voice Experience

هذه المرحلة مطلوبة إذا كان هدف التسليم "شات بوت صوتي".

### Recommended Architecture
- `Web Speech API` لتحويل كلام الطالب إلى نص
- إرسال النص عبر Express إلى AI
- استخدام `window.speechSynthesis` لنطق الرد

### Important
- لا تستخدم Azure TTS/STT للمحادثة الحرة
- احتفظ بـ Azure فقط لمسار تقييم النطق

### Done When
- الطالب يضغط زر المايك
- كلامه يتحول إلى نص
- الرد يظهر كنص
- الرد يُنطق من المتصفح

---

## Phase 6: Levels and Curriculum Data

هيكل الكود يدعم المستويات، لكن البيانات يجب أن تلحق به.

### Required
- توسيع بيانات المحتوى لتشمل مستويات حقيقية
- مثال:
  - `A1`
  - `A2`
  - `B1`
  - `B2`

### Important
- إذا بقيت البيانات على مستوى واحد فقط، فلا تدّعِ في التسليم أن المنتج يدعم 4 مستويات فعلياً

### Done When
- لكل مستوى بيانات فعلية
- الكاش يحمل هذه البيانات عند startup
- الطلبات حسب المستوى ترجع ضمن المحتوى الصحيح

---

## Phase 7: End-to-End QA

هذه المرحلة تمنع مفاجآت الديمو.

### Required Scenarios
- login ثم دخول صفحة الشات
- إرسال رسالة نصية
- رسالة خارج المنهج
- fallback صحيح
- تكرار نفس السؤال
- استئناف محادثة قديمة
- إدخال صوتي
- نطق الرد
- تعطّل AI service
- مفتاح داخلي خاطئ

### Done When
- التجربة كاملة تعمل من الواجهة حتى الرد النهائي
- لا يوجد crash واضح
- حالات الفشل مفهومة ومسيطر عليها

---

## Suggested Team Split

إذا كان الشغل متوازياً، فهذا أفضل توزيع:

### Developer 1
- تثبيت AI service نهائياً
- إنهاء `chat_engine`
- إصلاح `requirements.txt`
- QA داخلي لمسارات FastAPI

### Developer 2
- Express gateway
- persistence
- security and rate limiting

### Developer 3
- React chat UI
- voice UX
- conversation history UI

---

## Priority Order

إذا الوقت ضيق، هذا هو الترتيب الصحيح:

1. إصلاح `requirements.txt`
2. إنهاء `chat_engine`
3. بناء Express gateway
4. بناء Chat UI
5. إضافة الصوت في المتصفح
6. إضافة حفظ المحادثات
7. تحسين المحتوى والمستويات
8. QA كامل

---

## Honest Project Percentage

### AI Infrastructure Only
- حوالي `80%`

### Full Student-Facing Chatbot
- حوالي `40%`

### Voice + Text Demo Ready
- بين `45%` و `60%` حسب وضع backend/frontend الحالي

الفرق الكبير هنا ليس في AI، بل في التكامل.

---

## Minimum Demo Scope

إذا أردنا أسرع طريق لتسليم محترم:

- مستوى واحد يعمل جيداً أفضل من 4 مستويات فارغة
- شات نصي يعمل جيداً
- صوت إدخال وإخراج يعملان من المتصفح
- حفظ محادثات أساسي
- fallback واضح
- حماية داخلية بين Express و FastAPI

هذا أفضل بكثير من توسيع المزايا قبل إغلاق الأساسيات.

---

## Out of Scope For Now

لا يُنصح بإضاعة الوقت الآن على:
- semantic RAG متقدم
- multi-agent flows
- tool calling
- dashboard إداري
- fine-tuning
- model comparison موسع
- TTS/STT مدفوع للمحادثة الحرة

---

## Final Delivery Definition

نعتبر المشروع جاهزاً للتسليم عندما:

- تعمل `ai-service` محلياً بدون أخطاء
- يعمل `Express` كـ gateway وحيد
- تعمل واجهة React للشات
- يمكن للطالب الكتابة والتحدث
- يمكنه رؤية الرد وسمعه
- يمكنه العودة إلى محادثة سابقة
- لا يوجد اتصال مباشر من frontend إلى FastAPI
- لا يوجد crash في سيناريوهات الديمو الأساسية

---

## Final Note

الـ `ai-service` لم يعد هو عنق الزجاجة الرئيسي.

عنق الزجاجة الحقيقي الآن هو:
- integration
- UI
- persistence
- voice flow
- content completeness

إذا أُنجزت هذه الطبقات بشكل نظيف، فالمشروع يصبح قابلاً للتسليم بثقة.
