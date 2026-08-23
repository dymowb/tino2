import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import {
  getPlatformCurrency,
  getPlatformLocale,
  clearPlatformSettingsCache,
} from '@/services/PlatformSettingsService';

/**
 * Currency is a deployment setting rather than a constant, so the value the server
 * charges in and the value the client displays come from one place. These pin that
 * the setting is actually read, and that a bad value cannot reach Stripe.
 */
describe('platform currency configuration', () => {
  const server = new App().app;

  async function setSetting(key: string, value: string) {
    await AppDataSource.getRepository(AppSettings).upsert({ key, value }, ['key']);
    clearPlatformSettingsCache();
  }

  beforeEach(() => {
    clearPlatformSettingsCache();
  });

  it('defaults to BRL when nothing is configured', async () => {
    expect(await getPlatformCurrency()).toBe('BRL');
    expect(await getPlatformLocale()).toBe('pt-BR');
  });

  it('reads a configured currency and locale', async () => {
    await setSetting('platform_currency', 'EUR');
    await setSetting('platform_locale', 'de-DE');

    expect(await getPlatformCurrency()).toBe('EUR');
    expect(await getPlatformLocale()).toBe('de-DE');
  });

  it('normalizes case and surrounding whitespace', async () => {
    await setSetting('platform_currency', '  eur  ');
    expect(await getPlatformCurrency()).toBe('EUR');
  });

  it('ignores an unsupported currency rather than sending it to Stripe', async () => {
    await setSetting('platform_currency', 'XYZ');
    // Falls back instead of propagating — an invalid code would fail the charge.
    expect(await getPlatformCurrency()).toBe('BRL');
  });

  it('serves the configured currency to the client so display matches the charge', async () => {
    await setSetting('platform_currency', 'EUR');
    await setSetting('platform_locale', 'de-DE');

    const response = await request(server).get('/api/v1/config').expect(200);

    expect(response.body.data.platformCurrency).toBe('EUR');
    expect(response.body.data.platformLocale).toBe('de-DE');
  });

  it('does not serve an unsupported currency to the client either', async () => {
    await setSetting('platform_currency', 'XYZ');

    const response = await request(server).get('/api/v1/config').expect(200);

    expect(response.body.data.platformCurrency).toBe('BRL');
  });

  it('ignores a locale Intl cannot use', async () => {
    await setSetting('platform_locale', 'not a locale');

    // An invalid tag makes Intl.NumberFormat throw. In the escrow hold path that
    // throw lands after the Stripe intent and payment row already exist, so the
    // request fails while the payment persists and the retry is refused as a
    // duplicate. It must never get that far.
    const locale = await getPlatformLocale();
    expect(locale).toBe('pt-BR');
    expect(() =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(1)
    ).not.toThrow();
  });

  it('reports the environment currency to the client when no database row exists', async () => {
    // The gap this closes: the payment path fell back to the environment while the
    // public config fell back to the built-in default, so the server could charge
    // EUR while telling the client to display BRL.
    await AppDataSource.getRepository(AppSettings).delete({ key: 'platform_currency' });
    await AppDataSource.getRepository(AppSettings).delete({ key: 'platform_locale' });
    process.env.PLATFORM_CURRENCY = 'EUR';
    process.env.PLATFORM_LOCALE = 'de-DE';
    clearPlatformSettingsCache();

    try {
      const response = await request(server).get('/api/v1/config').expect(200);

      expect(await getPlatformCurrency()).toBe('EUR');
      expect(response.body.data.platformCurrency).toBe('EUR');
      expect(response.body.data.platformLocale).toBe('de-DE');
    } finally {
      delete process.env.PLATFORM_CURRENCY;
      delete process.env.PLATFORM_LOCALE;
      clearPlatformSettingsCache();
    }
  });

  it('does not let seeding overwrite a configured currency', async () => {
    // Seeding used to upsert BRL unconditionally, which made PLATFORM_CURRENCY
    // unreachable (a database row always wins) and reset any deliberate admin
    // change on every reseed.
    await setSetting('platform_currency', 'EUR');

    await AppDataSource.getRepository(AppSettings)
      .createQueryBuilder()
      .insert()
      .values([{ key: 'platform_currency', value: 'BRL' }])
      .orIgnore()
      .execute();
    clearPlatformSettingsCache();

    expect(await getPlatformCurrency()).toBe('EUR');
  });

  it('ignores an unsupported currency supplied through the environment', async () => {
    await AppDataSource.getRepository(AppSettings).delete({ key: 'platform_currency' });
    process.env.PLATFORM_CURRENCY = 'XYZ';
    clearPlatformSettingsCache();

    try {
      expect(await getPlatformCurrency()).toBe('BRL');
    } finally {
      delete process.env.PLATFORM_CURRENCY;
      clearPlatformSettingsCache();
    }
  });
});
