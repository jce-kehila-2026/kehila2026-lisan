import React from 'react';
import {
  Bell,
  BookOpenCheck,
  ChevronLeft,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  MessageSquareText,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import { getStoredUser, logout } from '../../services/auth.js';

const overviewStats = [
  { title: 'סך התלמידות', value: '128', detail: '12 פעילות השבוע', icon: Users },
  { title: 'ממתין לבדיקה', value: '18', detail: 'שיחות ומילים לבדיקה', icon: ClipboardList },
  { title: 'התראות חדשות', value: '7', detail: 'דורשות תשומת לב', icon: Bell },
  { title: 'מורות פעילות', value: '9', detail: 'מחוברות למערכת', icon: GraduationCap },
];

const dashboardSections = [
  {
    title: 'ניהול תלמידות',
    subtitle: 'חיפוש, הוספה, עריכה ומעקב אחר פרטי תלמידות',
    detail: 'כניסה למסך ניהול תלמידות עם טבלה, חיפוש ופעולות ניהול.',
    meta: 'ניהול מלא',
    icon: Users,
    to: '/admin/students',
  },
  {
    title: 'בדיקת שיחות',
    subtitle: 'סקירת שיחות לימודיות לפני אישור או דחייה',
    detail: '18 שיחות ממתינות לבדיקה, לצד שיחות שאושרו או נדחו.',
    meta: 'סקירה',
    icon: MessageSquareText,
    to: '/admin/conversations',
  },
  {
    title: 'בדיקת מילים',
    subtitle: 'אישור מילים חדשות וסיווג לפי רמות למידה',
    detail: '22 מילים ממתינות לאישור ולסיווג רמה.',
    meta: 'סקירה',
    icon: BookOpenCheck,
    to: '/admin/words',
  },
  {
    title: 'מעקב התקדמות',
    subtitle: 'מעקב אחר פעילות, תוצאות משחקים והתקדמות תלמידות',
    detail: 'תצוגה מרוכזת של פעילות למידה ותוצאות תרגול.',
    meta: 'מעקב',
    icon: GraduationCap,
    to: '/admin/progress',
  },
  {
    title: 'לוח התראות',
    subtitle: 'התראות מערכת, בקשות בדיקה ועדכונים אחרונים',
    detail: '7 התראות חדשות ממתינות לטיפול.',
    meta: 'התראות',
    icon: Bell,
    to: '/admin/notifications',
  },
];

function OverviewCard({ stat }) {
  const Icon = stat.icon;

  return (
    <article className="rounded-[1.6rem] border border-violet-100/70 bg-white/95 p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-400 to-amber-300 text-white shadow-button">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="text-3xl font-black tracking-normal text-slate-950">{stat.value}</span>
      </div>
      <h2 className="mt-4 text-sm font-black text-slate-900">{stat.title}</h2>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{stat.detail}</p>
    </article>
  );
}

function DashboardSection({ navigate, section }) {
  const Icon = section.icon;
  const isClickable = Boolean(section.to);
  const Wrapper = isClickable ? 'button' : 'article';
  const interactiveProps = isClickable
    ? {
        type: 'button',
        onClick: () => navigate(section.to),
      }
    : {};

  return (
    <Wrapper
      {...interactiveProps}
      className={`group flex h-full flex-col rounded-[1.75rem] border border-violet-100/70 bg-white/95 p-5 text-right shadow-card transition duration-200 sm:p-6 ${
        isClickable
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2'
          : ''
      }`}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black text-slate-950 sm:text-xl">{section.title}</h2>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
              {section.meta}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{section.subtitle}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-1 items-end justify-between gap-3 rounded-2xl bg-slate-50/80 px-4 py-3">
        <p className="text-sm font-semibold leading-6 text-slate-600">{section.detail}</p>
        {isClickable ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm transition group-hover:bg-violet-600 group-hover:text-white">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </Wrapper>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm">
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            מרכז ניהול
          </div>
          <Button type="button" variant="secondary" onClick={handleLogout}>
            יציאה
          </Button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-card sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-black text-violet-700">
                שלום {user?.name || 'מנהלת'}, טוב לראות אותך
              </p>
              <h1 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-4xl">
                לוח בקרה לניהול מערכת ליסאן
              </h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                מבט מהיר על תלמידות, בדיקות, התראות ופעילות למידה. המסך בנוי כמרכז שליטה נקי שמוכן להתרחב לחיבורי נתונים נוספים.
              </p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-right">
              <p className="text-xs font-black text-violet-700">מצב מערכת</p>
              <p className="mt-1 text-sm font-bold text-slate-700">המערכת פעילה ומוכנה לניהול</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewStats.map((stat) => (
              <OverviewCard key={stat.title} stat={stat} />
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          {dashboardSections.map((section) => (
            <DashboardSection key={section.title} navigate={navigate} section={section} />
          ))}
        </section>
      </div>
    </main>
  );
}

export default AdminDashboard;
