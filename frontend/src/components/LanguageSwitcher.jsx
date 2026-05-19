import React from 'react';
import { useTranslation } from 'react-i18next';

function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation();
  const language = i18n.language || 'ar';

  const changeLanguage = (nextLanguage) => {
    if (language !== nextLanguage) {
      i18n.changeLanguage(nextLanguage);
    }
  };

  if (compact) {
    return (
      <div className="language-link" aria-label={t('languageToggle')}>
        <button type="button" onClick={() => changeLanguage('ar')}>
          Arabic
        </button>
        <span>/</span>
        <button type="button" onClick={() => changeLanguage('he')}>
          Hebrew
        </button>
      </div>
    );
  }

  return (
    <div className="language-switcher" aria-label={t('languageToggle')}>
      <button type="button" className={language === 'ar' ? 'is-active' : ''} onClick={() => changeLanguage('ar')}>
        {t('languageArabic')}
      </button>
      <button type="button" className={language === 'he' ? 'is-active' : ''} onClick={() => changeLanguage('he')}>
        {t('languageHebrew')}
      </button>
    </div>
  );
}

export default LanguageSwitcher;
