import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import he from './locales/he.json';

const resources = {
  ar: { translation: ar },
  he: { translation: he },
};

const getInitialLanguage = () => {
  const saved = localStorage.getItem('lisan-language');
  return saved === 'he' ? 'he' : 'ar';
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'ar',
  interpolation: {
    escapeValue: false,
  },
});

const setHtmlAttrs = (lang) => {
  document.documentElement.lang = lang;
  document.documentElement.dir = 'rtl';
};

setHtmlAttrs(i18n.language);

i18n.on('languageChanged', (lang) => {
  localStorage.setItem('lisan-language', lang);
  setHtmlAttrs(lang);
});

export default i18n;