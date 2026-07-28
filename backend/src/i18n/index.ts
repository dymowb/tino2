import { Request } from 'express';
import pt from './locales/pt.json';
import en from './locales/en.json';

export type Locale = 'pt' | 'en';

// Flat dotted-key catalogs. pt is the source/fallback locale (platform default).
const catalogs: Record<Locale, Record<string, string>> = {
  pt: pt as Record<string, string>,
  en: en as Record<string, string>,
};

/**
 * Resolve the request locale from an explicit X-Locale header (set by the SPA from
 * i18next.language) or Accept-Language, defaulting to Portuguese (the platform default).
 */
export function getLocale(req: Request): Locale {
  const header = (req.headers['x-locale'] || req.headers['accept-language'] || '')
    .toString()
    .toLowerCase();
  return header.startsWith('en') ? 'en' : 'pt';
}

/** Look up a key in the given locale, fall back to pt, then to the raw key. Interpolates {{param}}. */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  let str = catalogs[locale]?.[key] ?? catalogs.pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
    }
  }
  return str;
}

/** Convenience: translate using the request's locale. */
export function t(req: Request, key: string, params?: Record<string, string | number>): string {
  return translate(getLocale(req), key, params);
}
