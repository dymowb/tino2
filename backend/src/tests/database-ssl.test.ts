import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildDatabaseSsl } from '@/config/databaseSsl';

/**
 * The database connection used to be configured with `rejectUnauthorized: false`
 * in production: encrypted, but authenticating nobody, so anything able to sit
 * between the app and PostgreSQL could present its own certificate and read or
 * rewrite credentials, messages and payment metadata. These tests pin the two
 * properties that fix costs nothing to lose silently — verification is on
 * whenever TLS is used, and the insecure mode cannot activate in production.
 */
describe('buildDatabaseSsl', () => {
  const SAVED = { ...process.env };

  afterEach(() => {
    process.env = { ...SAVED };
  });

  const clearSslEnv = () => {
    delete process.env.DATABASE_SSL_CA;
    delete process.env.DATABASE_SSL_CA_FILE;
    delete process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED;
  };

  beforeEach(clearSslEnv);

  it('leaves a sslmode=disable connection unencrypted in every environment', () => {
    const url = 'postgresql://tino:tino@localhost:5432/tino_app?sslmode=disable';
    expect(buildDatabaseSsl(url, false)).toBe(false);
    // What production runs today; requiring TLS here would break a working deploy.
    expect(buildDatabaseSsl(url, true)).toBe(false);
  });

  it('does not enable TLS for a plain development connection string', () => {
    expect(buildDatabaseSsl('postgresql://tino:tino@localhost:5432/tino_app', false)).toBe(false);
  });

  it('verifies the peer whenever TLS is used', () => {
    // Stricter than libpq on purpose: `require` skips verification there.
    for (const mode of ['require', 'verify-ca', 'verify-full', 'prefer']) {
      expect(buildDatabaseSsl(`postgresql://h/db?sslmode=${mode}`, false)).toEqual({
        rejectUnauthorized: true,
      });
    }

    expect(buildDatabaseSsl('postgresql://h/db', true)).toEqual({ rejectUnauthorized: true });
  });

  it('supplies an inline CA to the verifier', () => {
    process.env.DATABASE_SSL_CA = '-----BEGIN CERTIFICATE-----inline-----END CERTIFICATE-----';

    expect(buildDatabaseSsl('postgresql://h/db?sslmode=require', false)).toEqual({
      rejectUnauthorized: true,
      ca: process.env.DATABASE_SSL_CA,
    });
  });

  it('supplies a file-based CA to the verifier', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'ca.pem');
    fs.writeFileSync(file, 'file-ca');
    process.env.DATABASE_SSL_CA_FILE = file;

    expect(buildDatabaseSsl('postgresql://h/db?sslmode=require', false)).toEqual({
      rejectUnauthorized: true,
      ca: 'file-ca',
    });
  });

  it('refuses to start rather than fall back to the system store', () => {
    process.env.DATABASE_SSL_CA_FILE = '/nonexistent/ca.pem';

    // Silently ignoring a configured-but-unreadable CA is the same silent
    // downgrade this module exists to prevent.
    expect(() => buildDatabaseSsl('postgresql://h/db?sslmode=require', false)).toThrow(
      /DATABASE_SSL_CA_FILE/
    );
  });

  it('allows an unverified peer only outside production', () => {
    process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED = 'true';

    expect(buildDatabaseSsl('postgresql://h/db?sslmode=require', false)).toEqual({
      rejectUnauthorized: false,
    });
    expect(() => buildDatabaseSsl('postgresql://h/db?sslmode=require', true)).toThrow(
      /cannot be used in production/
    );
  });

  it('ignores the escape hatch unless it is set to exactly "true"', () => {
    process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED = 'false';
    expect(buildDatabaseSsl('postgresql://h/db?sslmode=require', false)).toEqual({
      rejectUnauthorized: true,
    });

    process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED = '1';
    expect(buildDatabaseSsl('postgresql://h/db?sslmode=require', false)).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('does not enable TLS without a connection string', () => {
    expect(buildDatabaseSsl(undefined, true)).toBe(false);
  });
});
