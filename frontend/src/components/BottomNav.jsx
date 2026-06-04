import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BotMessageSquare, Grid2X2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const navItems = [
  { to: '/profile', labelKey: 'profile', icon: UserRound },
  { to: '/chatbot', labelKey: 'chatbot', icon: BotMessageSquare, primary: true },
  { to: '/more', labelKey: 'more', icon: Grid2X2 },
];

function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-6xl px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:absolute sm:px-4 md:px-6 lg:px-8" aria-label={t('activities')}>
      <div className="mx-auto grid max-w-4xl grid-cols-3 items-center rounded-[28px] border border-slate-200 bg-white/95 px-3 py-3 shadow-[0_14px_40px_rgba(31,41,55,0.16)] backdrop-blur sm:px-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          const classes = item.primary
            ? 'mx-auto -mt-9 flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full bg-violet-600 text-white shadow-button transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2'
            : `mx-auto flex min-h-12 min-w-0 flex-col items-center justify-center rounded-2xl px-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:min-w-16 sm:px-3 ${
                active ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50 hover:text-violet-700'
              }`;

          return (
            <Link key={item.to} to={item.to} className={classes} aria-label={t(item.labelKey)}>
              <Icon className={item.primary ? 'h-8 w-8' : 'h-6 w-6'} aria-hidden="true" />
              {!item.primary ? <span className="mt-1">{t(item.labelKey)}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNav;
