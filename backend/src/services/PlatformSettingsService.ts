import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import logger from '@/config/logger';
import {
  DEFAULT_PLATFORM_CURRENCY,
  DEFAULT_PLATFORM_LOCALE,
  isSupportedCurrency,
} from '@/utils/money';

/**
 * Deployment-wide settings that are read on nearly every money-handling request.
 *
 * Currency is one value per deployment rather than a column on each priced entity:
 * the product prices exclusively in one currency, and `Booking`/`Quote` carry no
 * currency field. Supporting genuinely mixed currencies would need FX rates, a
 * rate-at-quote vs rate-at-capture policy, and per-currency fee constants — a
 * different problem from "run this deployment in another country".
 */

const CURRENCY_KEY = 'platform_currency';
const LOCALE_KEY = 'platform_locale';

/**
 * Cached because the escrow path reads it per request and it changes about never.
 * Short TTL rather than explicit invalidation so an admin edit takes effect on its
 * own without needing every writer to remember to clear this.
 */
const CACHE_TTL_MS = 60_000;

let cache: { currency: string; locale: string; loadedAt: number } | null = null;

/**
 * True when Intl can actually use this tag. Both the canonicalisation and the
 * formatter are exercised — a tag can be structurally valid yet still be rejected
 * when a formatter is constructed with it.
 */
function isUsableLocale(locale: string): boolean {
  try {
    Intl.getCanonicalLocales(locale);
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(1);
    return true;
  } catch {
    return false;
  }
}

async function load(): Promise<{ currency: string; locale: string }> {
  const envCurrency = process.env.PLATFORM_CURRENCY?.trim().toUpperCase();
  const envLocale = process.env.PLATFORM_LOCALE?.trim();

  // Environment values get the same validation as stored ones — a typo in a deploy
  // env var must not be able to reach Stripe or throw inside a formatter either.
  let currency =
    envCurrency && isSupportedCurrency(envCurrency) ? envCurrency : DEFAULT_PLATFORM_CURRENCY;
  let locale = envLocale && isUsableLocale(envLocale) ? envLocale : DEFAULT_PLATFORM_LOCALE;

  try {
    const rows = await AppDataSource.getRepository(AppSettings).find();
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    const storedCurrency = byKey.get(CURRENCY_KEY)?.trim().toUpperCase();
    if (storedCurrency) {
      // A typo here would otherwise reach Stripe as an invalid currency and fail
      // the charge, so an unrecognised value falls back rather than propagating.
      if (isSupportedCurrency(storedCurrency)) {
        currency = storedCurrency;
      } else {
        logger.error(
          `Ignoring unsupported ${CURRENCY_KEY}='${storedCurrency}'; falling back to ${currency}`
        );
      }
    }

    const storedLocale = byKey.get(LOCALE_KEY)?.trim();
    if (storedLocale) {
      // An invalid tag makes Intl.NumberFormat throw. That throw would land inside
      // the escrow hold *after* the Stripe intent exists, so the
      // request would fail while the payment persisted — and the retry would then be
      // refused as a duplicate. Validate before it can get anywhere near that.
      if (isUsableLocale(storedLocale)) {
        locale = storedLocale;
      } else {
        logger.error(
          `Ignoring unusable ${LOCALE_KEY}='${storedLocale}'; falling back to ${locale}`
        );
      }
    }
  } catch (error) {
    // Settings are a refinement, not a dependency — a database hiccup must not take
    // the payment path down with it.
    logger.error('Failed to load platform settings; using defaults', error);
  }

  return { currency, locale };
}

async function resolve(): Promise<{ currency: string; locale: string }> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  const loaded = await load();
  cache = { ...loaded, loadedAt: Date.now() };
  return cache;
}

/** The currency every price in this deployment is denominated in. */
export async function getPlatformCurrency(): Promise<string> {
  return (await resolve()).currency;
}

/** Locale used when rendering money server-side (notification and email text). */
export async function getPlatformLocale(): Promise<string> {
  return (await resolve()).locale;
}

/** Drop the cache — used by tests and after an admin edit. */
export function clearPlatformSettingsCache(): void {
  cache = null;
}
