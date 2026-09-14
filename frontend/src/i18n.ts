import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import {
  DEFAULT_NAMESPACE,
  FALLBACK_LOCALE,
  LOCALE_CODES,
  NAMESPACES,
} from './i18n/manifest';

// Default new visitors to Portuguese — the detector reads localStorage first,
// so this is overridden by any explicit language switch the user makes.
if (typeof window !== 'undefined' && !window.localStorage.getItem('i18nextLng')) {
  window.localStorage.setItem('i18nextLng', FALLBACK_LOCALE);
}

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Locales and namespaces come from the manifest, which is the single place
    // that decides what this app translates. A visitor whose stored language is
    // no longer supported — someone who chose Spanish before it was retired —
    // falls through to `fallbackLng` rather than seeing untranslated keys.
    supportedLngs: LOCALE_CODES,
    fallbackLng: FALLBACK_LOCALE,
    defaultNS: DEFAULT_NAMESPACE,
    ns: [...NAMESPACES],
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
