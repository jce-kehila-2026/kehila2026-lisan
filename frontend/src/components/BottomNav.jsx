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
  const primaryItem = navItems.find((item) => item.primary);
  const sideItems = navItems.filter((item) => !item.primary);

  return (
    <nav
      className="lisan-bottom-nav fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 px-0"
      style={{ width: 'min(680px, calc(100% - 48px))' }}
      aria-label={t('activities')}
    >
      <div
        className="relative grid w-full grid-cols-2 items-center rounded-[28px] border border-slate-200 bg-white/95 px-3 py-3 shadow-[0_14px_40px_rgba(31,41,55,0.16)] backdrop-blur sm:px-5"
      >
        {sideItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          const classes = `mx-auto flex min-h-12 min-w-0 flex-col items-center justify-center rounded-2xl px-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:min-w-16 sm:px-3 ${
            active ? 'bg-violet-50 text-violet-700 hover:-translate-y-0.5' : 'text-slate-500 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-violet-700'
          }`;

          return (
            <Link key={item.to} to={item.to} className={classes} aria-label={t(item.labelKey)}>
              <Icon className="h-6 w-6 transition" aria-hidden="true" />
              <span className="mt-1">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {primaryItem ? (
          <Link
            to={primaryItem.to}
            className="group absolute left-1/2 top-0 flex h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-violet-600 text-white shadow-button transition hover:-translate-y-[54%] hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label={t(primaryItem.labelKey)}
          >
            <BotMessageSquare className="h-8 w-8 transition group-hover:text-white" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export default BottomNav;
