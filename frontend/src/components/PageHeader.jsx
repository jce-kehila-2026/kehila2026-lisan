import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import LanguageToggle from './LanguageToggle.jsx';
import Logo from './Logo.jsx';

function PageHeader({ backTo, controlsSlot = null, showBack = false, showLogout = false }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-4">
      <button
        type="button"
        onClick={() => navigate('/home')}
        className="rounded-2xl transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
        aria-label="דף הבית"
        title="דף הבית"
      >
        <Logo />
      </button>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {controlsSlot}

        <LanguageToggle />

        {showBack ? (
          <button
            type="button"
            onClick={() => {
              if (backTo) {
                navigate(backTo);
              } else if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/home');
              }
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label="חזרה"
            title="חזרה"
          >
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}

        {showLogout ? (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label={t('logout')}
            title={t('logout')}
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export default PageHeader;
