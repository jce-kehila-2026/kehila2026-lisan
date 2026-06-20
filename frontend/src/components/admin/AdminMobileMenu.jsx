import React, { useEffect, useState } from 'react';
import { ChevronLeft, Eye, Menu, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminNavItems } from './AdminNavStrip.jsx';

function AdminMobileMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!open) return undefined;

    const closeMenu = () => setOpen(false);

    window.addEventListener('scroll', closeMenu, { passive: true });

    return () => {
      window.removeEventListener('scroll', closeMenu);
    };
  }, [open]);

  const goTo = (to) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-violet-100/80 bg-white/90 text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.09)] transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
        aria-label="פתיחת ניווט"
        aria-expanded={open}
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          className="fixed right-3 top-[4.5rem] z-[60] w-[min(21rem,calc(100vw-1.5rem))] rounded-[24px] border border-violet-100/80 bg-white/95 p-3 text-right shadow-[0_22px_55px_rgba(109,40,217,0.16)] backdrop-blur"
          dir="rtl"
        >
          <nav className="grid gap-2" aria-label="ניווט מנהלת">
            <button
              type="button"
              onClick={() => goTo('/admin/dashboard')}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-transparent bg-violet-50/65 px-3 py-2 text-sm font-black text-violet-900/80 transition hover:border-violet-100 hover:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            >
              <span>לוח בקרה</span>
              <ChevronLeft className="h-4 w-4 text-violet-500" aria-hidden="true" />
            </button>

            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(item.to)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                    isActive
                      ? 'border-violet-200 bg-violet-100 text-violet-900 shadow-[0_10px_24px_rgba(109,40,217,0.12)]'
                      : 'border-transparent bg-violet-50/65 text-violet-900/80 hover:border-violet-100 hover:bg-white'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  <ChevronLeft className="h-4 w-4 text-violet-500" aria-hidden="true" />
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => goTo('/teacher/dashboard')}
              className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-3 py-2 text-sm font-black text-white shadow-[0_12px_26px_rgba(109,40,217,0.22)] transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-label="תצוגת תלמיד"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>תצוגת תלמיד</span>
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

export default AdminMobileMenu;
