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
});
