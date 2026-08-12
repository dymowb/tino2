/**
 * One place that formats money.
 *
 * Before this, ~20 files each called `Intl.NumberFormat('pt-BR', { currency: 'BRL' })`
 * inline, so the currency was effectively welded into every screen and an EN-locale
 * user still got Brazilian grouping. The currency and locale now come from the same
 * `app_settings` values the server charges in, fetched once at startup.
 *
 * The important discipline: **never format money from a bare number**. Every entry
 * point takes an explicit currency, even though today every caller passes the same
 * one. That is what keeps a future move to per-entity currencies a migration rather
 * than an excavation.
 */

/** Matches the server's fallbacks in backend/src/utils/money.ts. */
const DEFAULT_CURRENCY = 'BRL';
const DEFAULT_LOCALE = 'pt-BR';

let platformCurrency = DEFAULT_CURRENCY;
let platformLocale = DEFAULT_LOCALE;

/**
 * Seed the module from the public config endpoint.
 *
 * Module-level rather than React state on purpose: money is formatted in helpers and
 * non-component code too, and threading a hook through all of them would be worse
 * than a value that is written once at boot. Until it resolves, the defaults apply —
 * which is exactly the behaviour that was hardcoded before.
 */
export function configureMoney(currency?: string, locale?: string): void {
  if (currency) platformCurrency = currency.toUpperCase();
  if (locale) platformLocale = locale;
}

export function getPlatformCurrency(): string {
  return platformCurrency;
}

export function getPlatformLocale(): string {
  return platformLocale;
}

/**
 * Format a major-unit amount (275 -> "R$ 275,00").
 *
 * Values arriving from the API are `numeric` columns, which node-postgres returns as
 * strings, so the coercion here is load-bearing rather than defensive.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = platformCurrency,
  locale: string = platformLocale,
): string {
  const numeric = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

/**
 * The currency symbol on its own, for labels like "Budget (R$)" where the amount is
 * rendered by an input rather than by Intl.
 */
export function currencySymbol(currency: string = platformCurrency): string {
  const parts = new Intl.NumberFormat(platformLocale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency.toUpperCase();
}
