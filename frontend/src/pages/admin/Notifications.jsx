import React from 'react';
import { ArrowRight, Bell, BookOpenCheck, MessageSquareText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import { adminReviewNotifications } from '../../data/adminMockData.js';
import { logout } from '../../services/auth.js';

function notificationIcon(type) {
  return type === 'word' ? BookOpenCheck : MessageSquareText;
}

function Notifications() {
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח הבקרה
          </button>
          <Button type="button" variant="secondary" onClick={handleLogout}>
            יציאה
          </Button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-card sm:p-7">
          <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
            <Bell className="h-4 w-4" aria-hidden="true" />
            התראות סקירת תוכן
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-4xl">התראות למנהלת</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            כאן מופיעות רק מילים חדשות ושיחות חדשות שממתינות לבדיקה.
          </p>
        </section>

        <section className="mt-5 grid gap-3">
          {adminReviewNotifications.map((notification) => {
            const Icon = notificationIcon(notification.type);

            return (
              <article key={notification.id} className="rounded-[1.75rem] border border-violet-100/70 bg-white/95 p-5 shadow-card">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-black text-slate-950">{notification.title}</h2>
                      <span className="text-xs font-bold text-slate-400">{notification.time}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{notification.text}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

export default Notifications;
