import { Router, Request, Response } from 'express';
import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import logger from '@/config/logger';
import { getAiConfigurationView } from '@/services/AiConfigurationService';
import { DEFAULT_PLATFORM_CURRENCY, DEFAULT_PLATFORM_LOCALE } from '@/utils/money';
import { getPlatformCurrency, getPlatformLocale } from '@/services/PlatformSettingsService';

const router = Router();

// Public, read-only client configuration. Exposes a whitelist of app_settings
// (admin-editable via /admin/settings) so the frontend doesn't hardcode them as
// build-time env defaults. Keep this whitelist tight — never leak operational keys.
const PUBLIC_SETTINGS: Record<string, { key: string; default: number }> = {
  maxProvidersPerQuote: { key: 'max_providers_per_quote', default: 5 },
};

// Boolean feature flags. Exposed so the client can hide an entry point whose
// endpoint would 404 — a visible button backed by a disabled feature is worse
// than no button at all.
const PUBLIC_FLAGS: Record<string, { key: string; default: boolean }> = {
  bookingReadinessEnabled: { key: 'booking_readiness_enabled', default: false },
};

// Money formatting has to agree between server and client, so the currency and
// locale are resolved through the *same* service the payment path uses rather than
// being read from app_settings a second time here. Re-reading independently meant a
// deployment configuring PLATFORM_CURRENCY via the environment (with no database
// row) charged in that currency while telling the client to display BRL.

// GET /api/v1/config
router.get('/', async (_req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AppSettings);
    const rows = await repo.find();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const data: Record<string, number | boolean | string> = {};
    for (const [field, { key, default: def }] of Object.entries(PUBLIC_SETTINGS)) {
      const row = byKey.get(key);
      const val = row ? Number(row.value) : NaN;
      data[field] = Number.isFinite(val) ? val : def;
    }
    for (const [field, { key, default: def }] of Object.entries(PUBLIC_FLAGS)) {
      const row = byKey.get(key);
      data[field] = row ? row.value === 'true' : def;
    }
    data.platformCurrency = await getPlatformCurrency();
    data.platformLocale = await getPlatformLocale();
    res.json({ success: true, data: { ...data, ai: getAiConfigurationView() } });
  } catch (error) {
    logger.error('Error fetching public config:', error);
    // Never block the client on config — fall back to defaults.
    const data: Record<string, number | boolean | string> = {};
    for (const [field, { default: def }] of Object.entries(PUBLIC_SETTINGS)) data[field] = def;
    for (const [field, { default: def }] of Object.entries(PUBLIC_FLAGS)) data[field] = def;
    data.platformCurrency = DEFAULT_PLATFORM_CURRENCY;
    data.platformLocale = DEFAULT_PLATFORM_LOCALE;
    res.json({ success: true, data: { ...data, ai: getAiConfigurationView() } });
  }
});

export default router;
