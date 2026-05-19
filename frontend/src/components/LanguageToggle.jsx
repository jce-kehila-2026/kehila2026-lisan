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
      className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
      aria-label={t('languageToggle')}
    >
      <button
        type="button"
        onClick={() => switchLanguage('ar')}
        className={`min-h-10 rounded-full px-4 py-2 text-sm font-semibold transition ${
          active === 'ar' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        {t('languageArabic')}
      </button>
      <button
        type="button"
        onClick={() => switchLanguage('he')}
        className={`min-h-10 rounded-full px-4 py-2 text-sm font-semibold transition ${
          active === 'he' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        {t('languageHebrew')}
      </button>
    </div>
  );
}

export default LanguageToggle;
