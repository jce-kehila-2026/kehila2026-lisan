import React from 'react';
import { ArrowRight, CheckCircle2, Clock, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function demoCardClass(count) {
  if (count === 3) {
    return 'w-full flex-none lg:basis-[calc((100%_-_2rem)/3)]';
  }

  if (count === 4) {
    return 'w-full flex-none md:basis-[calc(50%_-_0.5rem)] xl:basis-[calc((100%_-_3rem)/4)]';
  }

  return 'w-full flex-none md:basis-[calc(50%_-_0.5rem)] lg:basis-[calc((100%_-_2rem)/3)]';
}

function AdminDemoPage({ accentLabel, cards, description, icon: Icon, title }) {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח הבקרה
          </button>
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-sm font-black text-violet-700">
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            אזור ניהול
          </div>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-[#EEE5FF] bg-white/75 p-5 shadow-card backdrop-blur-[8px] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {accentLabel}
              </p>
              <h1 className="mt-2 text-[clamp(2.2rem,4.2vw,4.25rem)] font-black leading-tight text-slate-950">
                {title}
              </h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                {description}
              </p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-right">
              <p className="text-xs font-black text-violet-700">מצב עמוד</p>
              <p className="mt-1 text-sm font-bold text-slate-700">תצוגת הדגמה בלבד, ללא חיבור לשרת</p>
            </div>
          </div>
        </section>

        <section className="mt-5 flex flex-wrap justify-center gap-4">
          {cards.map((card) => {
            const CardIcon = card.icon || Clock;

            return (
              <article
                key={card.title}
                className={`rounded-[1.75rem] border border-violet-100/70 bg-white/95 p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg ${demoCardClass(cards.length)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-400 to-amber-300 text-white shadow-button">
                    <CardIcon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                    {card.badge}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-black text-slate-950">{card.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{card.text}</p>
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
                  {card.footer}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

export default AdminDemoPage;
