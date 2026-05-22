import React from 'react';
import { CheckCircle2, MessageSquareText, ShieldCheck, Timer } from 'lucide-react';
import AdminDemoPage from './AdminDemoPage.jsx';

const cards = [
  {
    title: 'שיחות ממתינות',
    text: 'רשימת שיחות שממתינות לבדיקת מורה או מנהלת לפני אישור סופי.',
    badge: '18 שיחות',
    footer: 'כולל סינון לפי תאריך, תלמידה ורמת שפה בעתיד',
    icon: Timer,
  },
  {
    title: 'שיחות שאושרו',
    text: 'תצוגה מסודרת של שיחות שעברו בדיקה ונשמרו כחומר לימודי תקין.',
    badge: 'מאושר',
    footer: 'מיועד לסקירת איכות וללמידה חוזרת',
    icon: CheckCircle2,
  },
  {
    title: 'שיחות שנדחו',
    text: 'אזור מעקב אחרי שיחות שנדחו, כולל סיבת דחייה והמלצה לשיפור.',
    badge: 'דורש טיפול',
    footer: 'הנתונים בעמוד זה הם הדגמה בלבד',
    icon: ShieldCheck,
  },
];

function Conversations() {
  return (
    <AdminDemoPage
      accentLabel="בדיקת שיחות"
      cards={cards}
      description="עמוד הדגמה לסקירת שיחות לימודיות, הפרדה בין שיחות ממתינות, מאושרות ודחויות, והכנה לחיבור עתידי לתהליך בדיקה מלא."
      icon={MessageSquareText}
      title="בדיקת שיחות"
    />
  );
}

export default Conversations;
