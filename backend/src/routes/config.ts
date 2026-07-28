import { Router, Request, Response } from 'express';
import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import logger from '@/config/logger';

const router = Router();

// Public, read-only client configuration. Exposes a whitelist of app_settings
// (admin-editable via /admin/settings) so the frontend doesn't hardcode them as
// build-time env defaults. Keep this whitelist tight — never leak operational keys.
const PUBLIC_SETTINGS: Record<string, { key: string; default: number }> = {
  maxProvidersPerQuote: { key: 'max_providers_per_quote', default: 5 },
};

// GET /api/v1/config
router.get('/', async (_req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AppSettings);
    const rows = await repo.find();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const data: Record<string, number> = {};
    for (const [field, { key, default: def }] of Object.entries(PUBLIC_SETTINGS)) {
      const row = byKey.get(key);
      const val = row ? Number(row.value) : NaN;
      data[field] = Number.isFinite(val) ? val : def;
    }
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching public config:', error);
    // Never block the client on config — fall back to defaults.
    const data: Record<string, number> = {};
    for (const [field, { default: def }] of Object.entries(PUBLIC_SETTINGS)) data[field] = def;
    res.json({ success: true, data });
  }
});

export default router;
