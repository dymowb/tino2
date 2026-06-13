import 'reflect-metadata';
import '@/config/environment'; // loads dotenv before any DataSource is constructed
import { AppDataSource } from '@/config/database';
import { QuoteRequest } from '@/models/QuoteRequest';
import locationService from '@/services/LocationService';
import logger from '@/config/logger';

/**
 * One-off backfill: geocode quote_requests that were created before geocoding-at-
 * creation (`8d1720f`) and still have (0,0) coords. Geocodable rows get real
 * coords (so broadcast radius matching can narrow them); rows with junk/empty
 * addresses are left untouched and reported.
 */
async function main() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(QuoteRequest);
  const all = await repo.find();
  const zero = all.filter(r => {
    const loc: any = r.location || {};
    return Number(loc.latitude) === 0 && Number(loc.longitude) === 0;
  });
  logger.info(`Found ${zero.length} quote_requests with (0,0) coords`);

  let fixed = 0, skipped = 0;
  for (const r of zero) {
    const loc: any = r.location || {};
    const addr = [loc.address, loc.city, loc.state, loc.country || 'Brasil'].filter(Boolean).join(', ').trim();
    if (!loc.address) { skipped++; logger.warn(`Skip ${r.id.slice(0, 8)} — no address`); continue; }
    try {
      const geo = await locationService.geocodeAddress(addr);
      const { latitude, longitude } = geo.location;
      if (!latitude || !longitude) { skipped++; logger.warn(`Skip ${r.id.slice(0, 8)} — geocode returned 0`); continue; }
      // Reject low-precision matches (junk input → region/country centroid).
      if (geo.partialMatch || geo.locationType === 'APPROXIMATE') {
        skipped++; logger.warn(`Skip ${r.id.slice(0, 8)} — imprecise (${geo.locationType}, partial=${geo.partialMatch}) for "${addr}"`); continue;
      }
      r.location = { ...loc, latitude, longitude };
      await repo.save(r);
      fixed++;
      logger.info(`Geocoded ${r.id.slice(0, 8)}: "${addr}" → ${latitude},${longitude}`);
    } catch {
      skipped++;
      logger.warn(`Skip ${r.id.slice(0, 8)} — geocode failed for "${addr}"`);
    }
  }
  logger.info(`Backfill done: ${fixed} fixed, ${skipped} skipped`);
  await AppDataSource.destroy();
  process.exit(0);
}

main().catch(err => { logger.error('Backfill failed:', err); process.exit(1); });
