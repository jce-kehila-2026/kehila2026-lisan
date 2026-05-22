import React from 'react';
import { AlertTriangle, Bell, Inbox, MessageCircleWarning } from 'lucide-react';
import AdminDemoPage from './AdminDemoPage.jsx';

const cards = [
  {
    title: 'התראות אחרונות',
    text: 'ריכוז הודעות מערכת ועדכונים אחרונים שהמנהלת צריכה לראות בתחילת העבודה.',
    badge: '7 חדשות',
    footer: 'הדגמה של תיבת התראות',
    icon: Inbox,
  },
  {
    title: 'אזהרות',
    text: 'אזור מתוכנן להצגת בעיות מערכת, שגיאות חיבור או אירועים שדורשים תשומת לב.',
    badge: 'חשוב',
    footer: 'לא מחובר לשרת בשלב זה',
    icon: AlertTriangle,
  },
  {
    title: 'בקשות בדיקה',
    text: 'בקשות שמגיעות משיחות, מילים או פעילות תלמידות וממתינות לפעולת ניהול.',
    badge: 'לטיפול',
    footer: 'מוכן להרחבה לתהליך עבודה מלא',
    icon: MessageCircleWarning,
  },
];

function Notifications() {
  return (
    <AdminDemoPage
      accentLabel="לוח התראות"
      cards={cards}
      description="עמוד הדגמה לריכוז התראות מערכת, אזהרות ובקשות בדיקה במקום אחד בתוך אזור הניהול."
      icon={Bell}
      title="לוח התראות"
    />
  );
}

export default Notifications;
