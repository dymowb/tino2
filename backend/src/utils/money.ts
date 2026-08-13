/**
 * One representation of money, one conversion boundary.
 *
 * Application-side money is stored and passed as **major units** — `numeric(10,2)`
 * columns like `Booking.totalAmount` and `Payment.amount` hold 275.00, meaning
 * R$275.00. Stripe wants **minor units** (integer). Every crossing of that boundary
 * goes through `toStripeMinorUnits` / `fromStripeMinorUnits`, so a `* 100` should
 * never appear at a call site again.
 *
 * Historically the frontend converted to cents *and* the backend multiplied by 100
 * again, and the escrow hold charged `usd` for prices quoted in BRL. Both classes of
 * bug are only preventable by having a single place that knows the rules.
 */

/**
 * Currencies Stripe treats as having no minor unit — ¥100 is `amount: 100`, not 10000.
 * Multiplying these by 100 overcharges by 100x.
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

/**
 * The currency every price in this deployment is denominated in.
 *
 * Deliberately a single constant rather than a per-entity field: the product prices
 * exclusively in BRL today, and `Booking`/`Quote` carry no currency column. Making
 * this configurable per deployment is the next step and only has to change here —
 * which is precisely why nothing below hardcodes a currency literal.
 */
export const PLATFORM_CURRENCY = 'BRL';

/** Locale used to render money server-side (notification fallback text, emails). */
export const PLATFORM_LOCALE = 'pt-BR';

/** Number of decimal places Stripe expects for a currency. */
export function currencyExponent(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/**
 * Round away IEEE-754 representation error before rounding to an integer.
 *
 * `1.005 * 100` is `100.49999999999999`, so a naive `Math.round` silently drops half
 * a cent. Normalising to 12 significant digits first — comfortably inside float
 * precision, comfortably outside the error — makes the rounding match what the
 * decimal value actually is.
 */
function roundScaled(scaled: number): number {
  return Math.round(Number(scaled.toPrecision(12)));
}

/** Major units (275.00) -> Stripe minor units (27500). */
export function toStripeMinorUnits(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`Cannot convert non-finite amount to minor units: ${amount}`);
  }
  return roundScaled(amount * 10 ** currencyExponent(currency));
}

/** Stripe minor units (27500) -> major units (275.00). */
export function fromStripeMinorUnits(minorUnits: number, currency: string): number {
  return minorUnits / 10 ** currencyExponent(currency);
}

/**
 * Round a major-unit amount to the precision the currency actually supports, so
 * derived values (fees, provider payouts) cannot accumulate sub-cent drift before
 * being persisted into a `numeric(10,2)` column.
 */
export function roundMajorUnits(amount: number, currency: string): number {
  const factor = 10 ** currencyExponent(currency);
  return roundScaled(amount * factor) / factor;
}

/**
 * Render a major-unit amount for display. Server-side rendering is only a fallback —
 * notifications also carry `i18nParams` so the client can format in the reader's
 * locale — but the fallback should still name the right currency.
 */
export function formatMajorUnits(amount: number, currency: string): string {
  return new Intl.NumberFormat(PLATFORM_LOCALE, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}
