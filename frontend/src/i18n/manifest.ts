/**
 * The authoritative declaration of what this application translates.
 *
 * Before this file there were four partial answers and nothing reconciling them:
 * `i18n.ts`'s `supportedLngs`/`ns`, `LanguageSwitcher`'s own menu, the set of
 * files actually present under `public/locales/`, and a `types/i18next.d.ts`
 * that typed its resources from `src/locales/` — a directory that does not
 * exist, silenced by `skipLibCheck`. They had already drifted: the switcher
 * offered Spanish, three namespaces were missing from it entirely, and roughly
 * two hundred keys were absent from files it did have, which is how a locale can
 * be advertised and half-translated at the same time.
 *
 * Everything now reads this file, and `manifest.test.ts` fails the build when
 * the files on disk disagree with it.
 */

/** The locale every other is measured against. Its key set is the contract. */
export const REFERENCE_LOCALE = 'en' as const;

export interface LocaleDefinition {
  code: string;
  /** Shown in the language switcher, in the language itself. */
  name: string;
  flag: string;
}

/** Locales offered to users. Adding one here makes the completeness check
 * demand a full set of files for it, which is the intended order of events. */
export const LOCALES: LocaleDefinition[] = [
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
];

export const LOCALE_CODES = LOCALES.map((locale) => locale.code);

/**
 * Locales that were offered once and are not currently supported.
 *
 * Their translation files are kept, out of the served path, so retiring a locale
 * does not throw away the work. `archivePath` is relative to `frontend/`.
 *
 * To bring one back:
 *   1. `git mv i18n-archive/<code> public/locales/<code>`
 *   2. move its entry from `RETIRED_LOCALES` into `LOCALES`
 *   3. run `npm test` — the completeness check names every missing key and
 *      namespace, which is the actual remaining work
 *   4. add a matching `backend/src/i18n/locales/<code>.json`, or server-generated
 *      messages will silently arrive in the fallback language
 */
export const RETIRED_LOCALES: Array<LocaleDefinition & { archivePath: string; note: string }> = [
  {
    code: 'es',
    name: 'Español',
    flag: '🇪🇸',
    archivePath: 'i18n-archive/es',
    note:
      'Retired 2026-09-06: offered in the switcher but never completed — missing the admin and ' +
      'memory namespaces outright, ~200 keys short across the twelve it had, and with no ' +
      'backend catalog at all, so server messages fell back to Portuguese. Roughly 450 strings ' +
      'to finish.',
  },
];

/**
 * Translation namespaces, one JSON file per locale each.
 *
 * A namespace listed here must exist for every supported locale. Adding a file
 * without adding it here leaves it unloaded at runtime, which is how `admin`,
 * `memory` and `assistant` came to be missing from the typed resources.
 */
export const NAMESPACES = [
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
  'memory',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = 'common';

/** New visitors get Portuguese; the detector's stored choice overrides it. */
export const FALLBACK_LOCALE = 'pt';
