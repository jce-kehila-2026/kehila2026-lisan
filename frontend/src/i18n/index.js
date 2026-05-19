import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import he from './he.json';

const resources = {
  ar: { translation: ar },
  he: { translation: he },
};

const getInitialLanguage = () => {
  const savedLanguage = localStorage.getItem('lisan-language');
  return savedLanguage === 'he' ? 'he' : 'ar';
};

const setDocumentDirection = (language) => {
  document.documentElement.lang = language;
  document.documentElement.dir = 'rtl';
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'ar',
  interpolation: {
    escapeValue: false,
  },
});

setDocumentDirection(i18n.language);

i18n.on('languageChanged', (language) => {
  localStorage.setItem('lisan-language', language);
  setDocumentDirection(language);
});

export default i18n;
