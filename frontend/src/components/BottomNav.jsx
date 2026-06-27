import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BotMessageSquare, Gamepad2, Grid2X2, MessageCircle, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { getStoredToken, getStoredUser } from '../services/auth.js';

async function fetchUnreadSharedCount() {
  try {
    const token = getStoredToken();
    const user = getStoredUser();
    if (!token || !user?.uid) return 0;
    const res = await fetch('/api/shared-chats/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const chats = data.chats || data.data || [];
    return chats.filter(
      (c) => Array.isArray(c.unreadBy) && c.unreadBy.includes(user.uid)
    ).length;
  } catch {
    return 0;
  }
}

// Order LTR: History | SharedChat | [FAB] | Games | Profile
const allItems = [
  { to: '/more',         labelKey: 'more',       icon: Grid2X2,      primary: false, badge: false },
  { to: '/shared-chat',  labelKey: 'sharedChat', icon: MessageCircle, primary: false, badge: true  },
  { to: '/chatbot',      labelKey: 'chatbot',    icon: BotMessageSquare, primary: true },
  { to: '/games',        labelKey: 'games',      icon: Gamepad2,     primary: false, badge: false },
  { to: '/profile',      labelKey: 'profile',    icon: UserRound,    primary: false, badge: false },
];

function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUnreadSharedCount().then(setUnreadCount);
    const id = setInterval(() => fetchUnreadSharedCount().then(setUnreadCount), 30_000);
    return () => clearInterval(id);
  }, []);

  const primaryItem = allItems.find((i) => i.primary);
  const sideItems = allItems.filter((i) => !i.primary);

  return (
    <nav
      dir="ltr"
      className="lisan-bottom-nav fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 px-0 pointer-events-none"
      style={{ width: 'min(760px, calc(100% - 32px))' }}
      aria-label={t('activities')}
    >
      <div className="pointer-events-auto relative grid w-full grid-cols-5 items-center rounded-[24px] border border-slate-200 bg-white/95 px-2 py-1 shadow-[0_14px_40px_rgba(31,41,55,0.16)] backdrop-blur sm:px-3">

        {/* Col 1 — History */}
        {[sideItems[0]].map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to}
              className={`relative mx-auto flex flex-col items-center justify-start rounded-2xl px-2 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                active ? 'text-violet-700' : 'text-slate-500 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-violet-700'
              }`}
              aria-label={t(item.labelKey)}
            >
              {active && <motion.span layoutId="lisan-nav-indicator" aria-hidden="true" className="absolute inset-0 -z-10 rounded-2xl bg-violet-50" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span className="mt-1 text-center leading-tight whitespace-normal">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {/* Col 2 — SharedChat with badge */}
        {[sideItems[1]].map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to}
              className={`relative mx-auto flex flex-col items-center justify-start rounded-2xl px-2 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                active ? 'text-violet-700' : 'text-slate-500 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-violet-700'
              }`}
              aria-label={t(item.labelKey)}
            >
              {active && <motion.span layoutId="lisan-nav-indicator" aria-hidden="true" className="absolute inset-0 -z-10 rounded-2xl bg-violet-50" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
              <span className="relative">
                <Icon className="h-6 w-6" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                    {unreadCount}
                  </span>
                )}
              </span>
              <span className="mt-1 text-center leading-tight whitespace-normal">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {/* Col 3 — FAB placeholder + actual FAB */}
        <div className="relative flex h-14 items-center justify-center" aria-hidden="true">
          <Link
            to={primaryItem.to}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-[56px] w-[56px] flex-col items-center justify-center rounded-full bg-violet-600 text-white shadow-button focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 pointer-events-auto"
            style={{ transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(-50%) translateY(-58%) scale(1.08)'; e.currentTarget.style.boxShadow = '0 18px 36px rgba(124,58,237,0.38)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(-50%) translateY(-50%)'; e.currentTarget.style.boxShadow = ''; }}
            aria-label={t(primaryItem.labelKey)}
          >
            <span className="pointer-events-none absolute inset-0 rounded-full bg-violet-400" style={{ animation: 'lisan-chatbot-pulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite' }} aria-hidden="true" />
            <BotMessageSquare className="relative h-7 w-7" aria-hidden="true" />
          </Link>
        </div>

        {/* Col 4 — Games */}
        {[sideItems[2]].map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to}
              className={`relative mx-auto flex flex-col items-center justify-start rounded-2xl px-2 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                active ? 'text-violet-700' : 'text-slate-500 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-violet-700'
              }`}
              aria-label={t(item.labelKey)}
            >
              {active && <motion.span layoutId="lisan-nav-indicator" aria-hidden="true" className="absolute inset-0 -z-10 rounded-2xl bg-violet-50" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span className="mt-1 text-center leading-tight whitespace-normal">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {/* Col 5 — Profile */}
        {[sideItems[3]].map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to}
              className={`relative mx-auto flex flex-col items-center justify-start rounded-2xl px-2 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                active ? 'text-violet-700' : 'text-slate-500 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-violet-700'
              }`}
              aria-label={t(item.labelKey)}
            >
              {active && <motion.span layoutId="lisan-nav-indicator" aria-hidden="true" className="absolute inset-0 -z-10 rounded-2xl bg-violet-50" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }} />}
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span className="mt-1 text-center leading-tight whitespace-normal">{t(item.labelKey)}</span>
            </Link>
          );
        })}

      </div>
    </nav>
  );
}

export default BottomNav;
