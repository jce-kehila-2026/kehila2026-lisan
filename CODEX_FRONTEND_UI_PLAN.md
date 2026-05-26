# خطة عمل كوديكس/كيرسور - تطوير واجهة المستخدم (Voice Bot UI)

**الدور (Persona):** أنت مطور واجهات تفاعلية خبير بـ React و Tailwind CSS.
**المهمة:** تطوير واجهةالمستخدم لميزة "التحدث الصوتي" في تطبيق Lisan ودمجها مع الـ Backend.

يرجى تنفيذ المهام التالية بالترتيب (Task by Task) في مشروع الـ Frontend:

## Task 1: إدارة حالة تسجيل الصوت (Custom Hook)
**الهدف:** التعامل مع الـ Microphone API بأمان وسهولة.
1. أنشئ Hook جديد `frontend/src/hooks/useAudioRecorder.js`.
2. استخدم `navigator.mediaDevices.getUserMedia` للحصول على إذن المايكروفون.
3. استخدم `MediaRecorder` لتسجيل الصوت وتخزينه كـ `Blob`.
4. أعد الحالات التالية: `isRecording`, `audioBlob`, `startRecording`, `stopRecording`, `cancelRecording`.
5. تعامل مع رفض الصلاحيات (Permission Denied) بشكل أنيق.

## Task 2: مكونات واجهة المستخدم (UI Components)
**الهدف:** إضافة زر المايكروفون والمؤشرات البصرية.
1. في `frontend/src/components/chat/ChatComposer.jsx`، أضف زر مايكروفون بجانب زر الإرسال.
2. عند الضغط مع الاستمرار (أو النقر)، يتغير شكل الزر ليظهر حالة التسجيل (مثلاً لون أحمر مع تأثير Pulse).
3. أثناء التسجيل، أخفِ الـ `textarea` واعرض مؤشر وقت (Timer) أو تأثير موجات صوتية بسيط (Audio Visualizer).
4. أضف زر لإلغاء التسجيل (Cancel) أثناء التحدث.

## Task 3: الربط مع الـ API
**الهدف:** إرسال الصوت المستلم إلى الـ Backend Gateway.
1. في `frontend/src/services/chat.js`، أنشئ دالة `sendVoiceMessage(audioBlob, level, includeArabic)`.
2. استخدم `FormData` لإرفاق الـ `audioBlob` كملف (multipart/form-data) وإرساله إلى `POST /api/chat/voice`.
3. تعامل مع حالة التحميل (Loading State) في واجهة المحادثة حتى يصل الرد.

## Task 4: عرض وتشغيل الصوتيات في المحادثة
**الهدف:** تمكين المستخدم من سماع رده ورد الـ AI.
1. قم بتحديث مكون `frontend/src/components/chat/ChatMessage.jsx`.
2. إذا كانت الرسالة تحتوي على `audioUrl` أو `audioBase64`، اعرض مكون مشغل صوت بسيط (Play/Pause Button).
3. بالنسبة لرسالة الـ AI المردودة للتو، قم بتشغيل الصوت تلقائياً (Auto-play) فور وصول الرسالة لتحقيق تجربة محادثة طبيعية.

## Task 5: تحسين تجربة المستخدم (UX Polish & Fallbacks)
**الهدف:** جعل التجربة سلسة وخالية من العيوب.
1. أوقف الموسيقى التلقائية إذا قام المستخدم بالنقر على زر المايكروفون مرة أخرى.
2. إذا فشل النظام في إعادة صوت (فقط نص)، اعرض النص كالمعتاد ولا تظهر مشغل الصوت.
3. تأكد من توافق تصميم المايكروفون ومشغل الصوت مع وضع الظلام (Dark Mode) و RTL (دعم اللغتين العربية والعبرية).