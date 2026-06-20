import React from 'react';
import { useTranslation } from 'react-i18next';

function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const active = i18n.language || 'ar';

  const switchLanguage = (lang) => {
    if (lang !== active) {
      i18n.changeLanguage(lang);
    }
  };

  return (
    <div
      className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 shadow-sm sm:p-1"
      aria-label={t('languageToggle')}
    >
      <button
        type="button"
        onClick={() => switchLanguage('ar')}
        className={`min-h-8 rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:min-h-10 sm:px-4 sm:py-2 sm:text-sm ${
          active === 'ar' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        {t('languageArabic')}
      </button>
      <button
        type="button"
        onClick={() => switchLanguage('he')}
        className={`min-h-8 rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:min-h-10 sm:px-4 sm:py-2 sm:text-sm ${
          active === 'he' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        {t('languageHebrew')}
      </button>
    </div>
  );
}

export default LanguageToggle;
