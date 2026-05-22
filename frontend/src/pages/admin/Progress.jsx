import React from 'react';
import { Activity, BarChart3, Gamepad2, GraduationCap } from 'lucide-react';
import AdminDemoPage from './AdminDemoPage.jsx';

const cards = [
  {
    title: 'התקדמות תלמידות',
    text: 'סקירת התקדמות כללית לפי פעילות, תרגול יומי ורמת שליטה בחומר.',
    badge: 'מעקב',
    footer: 'תצוגת נתונים לדוגמה בלבד',
    icon: BarChart3,
  },
  {
    title: 'תוצאות משחקים',
    text: 'מקום עתידי להצגת ציונים, ניסיונות, הצלחות ונקודות חוזק במשחקי למידה.',
    badge: 'משחקים',
    footer: 'מתאים לחיבור נתוני משחקים בהמשך',
    icon: Gamepad2,
  },
  {
    title: 'פעילות למידה',
    text: 'מעקב אחר זמן תרגול, שיחות שבוצעו, מילים שנלמדו ורצף פעילות.',
    badge: 'פעילות',
    footer: 'נועד לתמוך בהחלטות פדגוגיות',
    icon: Activity,
  },
];

function Progress() {
  return (
    <AdminDemoPage
      accentLabel="מעקב התקדמות"
      cards={cards}
      description="עמוד הדגמה למעקב אחר התקדמות תלמידות, תוצאות משחקים ופעילות למידה בצורה מסודרת וברורה."
      icon={GraduationCap}
      title="מעקב התקדמות"
    />
  );
}

export default Progress;
