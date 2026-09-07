import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Server-generated messages have their own catalogs, and their own way to drift.
 *
 * They are flat key/value files, separate from the frontend's namespaced ones,
 * and until now nothing compared them either. Spanish was offered in the UI for
 * months with no server catalog at all, so every localized error a Spanish
 * session received arrived in Portuguese — invisible, because a wrong language
 * still renders.
 */
const LOCALES_DIR = join(__dirname, '..', 'i18n', 'locales');
const REFERENCE = 'en';

const catalog = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8'));

const locales = readdirSync(LOCALES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

describe('backend i18n catalogs', () => {
  it('ships the reference locale', () => {
    expect(locales).toContain(REFERENCE);
  });

  it.each(locales.filter((locale) => locale !== REFERENCE))('%s matches en', (locale) => {
    const expected = Object.keys(catalog(REFERENCE)).sort();
    const actual = Object.keys(catalog(locale)).sort();

    const missing = expected.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !expected.includes(key));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(locales)('%s has no blank or placeholder values', (locale) => {
    const blank = Object.entries(catalog(locale))
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  it('keeps the same interpolation placeholders in every locale', () => {
    // A translation that drops a `{{name}}` renders a sentence with a hole in
    // it, and one that invents a placeholder renders the braces literally.
    const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();
    const reference = catalog(REFERENCE);

    for (const locale of locales.filter((l) => l !== REFERENCE)) {
      const translated = catalog(locale);
      for (const [key, value] of Object.entries(reference)) {
        if (translated[key] === undefined) continue;
        expect({ key, locale, placeholders: placeholders(translated[key]) }).toEqual({
          key,
          locale,
          placeholders: placeholders(value),
        });
      }
    }
  });
});
