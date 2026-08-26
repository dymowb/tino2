import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildDatabaseConnection, buildDatabaseSsl } from '@/config/databaseSsl';

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
      /database CA at "\/nonexistent\/ca.pem" could not be read/
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

  it('treats sslmode=no-verify as the escape hatch, not as an unknown mode', () => {
    // A real node-postgres mode. Reading it as "unrecognised, so no TLS" would
    // turn an encrypted connection into a plaintext one.
    expect(buildDatabaseSsl('postgresql://h/db?sslmode=no-verify', false)).toEqual({
      rejectUnauthorized: false,
    });
    expect(() => buildDatabaseSsl('postgresql://h/db?sslmode=no-verify', true)).toThrow(
      /cannot be used in production/
    );
  });

  it('refuses an unrecognised sslmode rather than dropping TLS', () => {
    // Before this module, pg's own parser turned even this typo into a verified
    // TLS connection. Failing open here would be a downgrade, not a no-op.
    expect(() => buildDatabaseSsl('postgresql://h/db?sslmode=required', true)).toThrow(
      /not a recognised mode/
    );
  });

  it('refuses an ssl parameter it cannot honour instead of silently dropping it', () => {
    // Stripping these would disable client-certificate authentication with no sign
    // that any configuration had been discarded.
    expect(() =>
      buildDatabaseSsl('postgresql://h/db?sslmode=require&sslcert=/etc/pg/client.crt', false)
    ).toThrow(/sslcert/);
    expect(() =>
      buildDatabaseSsl('postgresql://h/db?sslmode=require&sslkey=/etc/pg/client.key', false)
    ).toThrow(/sslkey/);
  });

  it('accepts the CA named by the URL when no env CA is set', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'root.pem');
    fs.writeFileSync(file, 'url-ca');

    expect(
      buildDatabaseSsl(`postgresql://h/db?sslmode=verify-full&sslrootcert=${file}`, false)
    ).toEqual({ rejectUnauthorized: true, ca: 'url-ca' });
  });
});

/**
 * The unit tests above only prove what this module *decides*. They passed while
 * the decision was being thrown away downstream: TypeORM hands pg both the
 * connection string and the `ssl` object, and pg merges the parsed string over
 * the explicit config, so any `sslmode` in the URL replaced our options — the
 * configured CA vanished and the verification setting became pg's.
 *
 * These tests therefore assert on what pg actually ends up with, through pg's own
 * ConnectionParameters, assembled exactly as PostgresDriver.createPool does.
 */
describe('buildDatabaseConnection through pg', () => {
  const SAVED = { ...process.env };

  afterEach(() => {
    process.env = { ...SAVED };
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ConnectionParameters = require('pg/lib/connection-parameters.js');

  const effectiveSsl = (url: string | undefined, isProduction: boolean): unknown => {
    const connection = buildDatabaseConnection(url, isProduction);
    // PostgresDriver.createPool: { connectionString: credentials.url, ssl: credentials.ssl }
    return new ConnectionParameters({ connectionString: connection.url, ssl: connection.ssl }).ssl;
  };

  it('keeps the configured CA instead of letting the URL discard it', () => {
    process.env.DATABASE_SSL_CA = 'MY-PRIVATE-CA';

    expect(effectiveSsl('postgresql://u:p@db.example.com:5432/app?sslmode=require', false)).toEqual(
      {
        rejectUnauthorized: true,
        ca: 'MY-PRIVATE-CA',
      }
    );
  });

  it('verifies the peer for every TLS mode the URL can name', () => {
    for (const mode of ['require', 'verify-ca', 'verify-full', 'prefer', 'allow']) {
      expect(
        effectiveSsl(`postgresql://u:p@db.example.com:5432/app?sslmode=${mode}`, false)
      ).toEqual({ rejectUnauthorized: true });
    }
  });

  it('leaves sslmode=disable unencrypted, as production runs today', () => {
    expect(
      effectiveSsl('postgresql://tino:tino@localhost:5432/tino_app?sslmode=disable', true)
    ).toBe(false);
  });

  it('preserves the rest of the connection string while removing ssl parameters', () => {
    const ca = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'root.pem');
    fs.writeFileSync(ca, 'root-ca');

    const { url } = buildDatabaseConnection(
      `postgresql://u:p%3Fx@db.example.com:5432/app?sslmode=verify-full&application_name=tino&sslrootcert=${ca}`,
      false
    );

    expect(url).toBe('postgresql://u:p%3Fx@db.example.com:5432/app?application_name=tino');
  });

  it('leaves a connection string without ssl parameters untouched', () => {
    const raw = 'postgresql://u:p@localhost:5432/app';
    expect(buildDatabaseConnection(raw, false).url).toBe(raw);
  });

  it('does not let sslmode=no-verify reach pg as an unencrypted connection', () => {
    expect(
      effectiveSsl('postgresql://u:p@db.example.com:5432/app?sslmode=no-verify', false)
    ).toEqual({ rejectUnauthorized: false });
  });
});
