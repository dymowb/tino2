import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Default new visitors to Portuguese — the detector reads localStorage first,
// so this is overridden by any explicit language switch the user makes.
if (typeof window !== 'undefined' && !window.localStorage.getItem('i18nextLng')) {
  window.localStorage.setItem('i18nextLng', 'pt');
}

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: ['pt', 'en', 'es'],
    fallbackLng: 'pt',
    defaultNS: 'common',
    ns: [
      'common',
      'auth',
      'providers',
      'bookings',
      'quotes',
      'messages',
      'payments',
      'reviews',
      'profile',
      'notifications',
      'dashboard',
      'assistant',
      'admin',
    ],
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      lookupFromPathIndex: 0,
    },
    react: {
      useSuspense: false,
    },
    // Map browser locales to our supported languages
    load: 'languageOnly', // pt-BR -> pt, en-US -> en
  });

export default i18n;
