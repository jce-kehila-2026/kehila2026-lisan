import React from 'react';
import { BookOpenCheck, CheckCircle2, Layers3, Sparkles } from 'lucide-react';
import AdminDemoPage from './AdminDemoPage.jsx';

const cards = [
  {
    title: 'מילים ממתינות',
    text: 'מילים חדשות שנוספו מהתרגול וממתינות לאישור לפני שימוש רחב במערכת.',
    badge: '22 מילים',
    footer: 'הדגמה של תור בדיקה עתידי',
    icon: Sparkles,
  },
  {
    title: 'מילים שאושרו',
    text: 'מאגר מילים שעברו בדיקה ויכולות להופיע בתרגול, במשחקים ובשיחות.',
    badge: 'מאושר',
    footer: 'מיועד לניהול תוכן לימודי',
    icon: CheckCircle2,
  },
  {
    title: 'סיווג לפי רמות',
    text: 'חלוקה מתוכננת של מילים לפי רמת קושי כדי להתאים את התוכן לכל תלמידה.',
    badge: 'רמות',
    footer: 'מתחילה, בינונית ומתקדמת',
    icon: Layers3,
  },
];

function Words() {
  return (
    <AdminDemoPage
      accentLabel="בדיקת מילים"
      cards={cards}
      description="עמוד הדגמה לניהול מילים חדשות, אישור תוכן לימודי וסיווג מילים לפי רמות למידה."
      icon={BookOpenCheck}
      title="בדיקת מילים"
    />
  );
}

export default Words;
