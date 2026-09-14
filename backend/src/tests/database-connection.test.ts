import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildDatabaseConnection } from '@/config/databaseConnection';

/**
 * The database connection used to be configured with `rejectUnauthorized: false`
 * in production: encrypted, but authenticating nobody, so anything able to sit
 * between the app and PostgreSQL could present its own certificate and read or
 * rewrite credentials, messages and payment metadata.
 *
 * The first repair kept handing TypeORM the URL and tried to sanitise it, which
 * meant re-deriving pg's parsing rules by hand; four reviews found four places
 * where that derivation diverged. The connection string is now parsed once by pg's
 * own parser and passed on as explicit fields, so these tests pin two things: the
 * TLS policy itself, and the structural property that makes it hold — nothing this
 * module returns can be re-parsed into a different `ssl`.
 */
describe('buildDatabaseConnection', () => {
  const SAVED = { ...process.env };

  beforeEach(() => {
    delete process.env.DATABASE_SSL_CA;
    delete process.env.DATABASE_SSL_CA_FILE;
    delete process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED;
  });

  afterEach(() => {
    process.env = { ...SAVED };
  });

  const caFile = (contents: string): string => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'root.pem');
    fs.writeFileSync(file, contents);
    return file;
  };

  describe('where to connect', () => {
    it('reads the connection fields out of the URL', () => {
      const connection = buildDatabaseConnection(
        'postgresql://tino:secret@db.example.com:5432/tino_app',
        false
      );

      expect(connection).toMatchObject({
        host: 'db.example.com',
        port: 5432,
        username: 'tino',
        password: 'secret',
        database: 'tino_app',
      });
    });

    it('decodes credentials the way the driver would', () => {
      // Percent-decoding a password by hand is one of the divergences this design
      // removes: pg's parser does it, so it is done exactly once and identically.
      const connection = buildDatabaseConnection(
        'postgresql://tino:p%40ss%3Fword@localhost:5432/app',
        false
      );

      expect(connection.password).toBe('p@ss?word');
    });

    it('forwards remaining libpq parameters to the driver', () => {
      const connection = buildDatabaseConnection(
        'postgresql://u:p@localhost:5432/app?application_name=tino',
        false
      );

      expect(connection.extra).toEqual({ application_name: 'tino' });
    });

    it('refuses a parameter that would override the resolved connection', () => {
      // TypeORM merges `extra` last, so a forwarded `connectionString` outranks the
      // host, credentials and TLS policy resolved above — pg re-parses it and
      // connects somewhere else, unverified.
      expect(() =>
        buildDatabaseConnection(
          'postgresql://trusted/db?connectionString=postgresql://other/db%3Fsslmode=no-verify',
          false
        )
      ).toThrow(/does not support/);
    });

    it('refuses an unrecognised parameter rather than dropping it', () => {
      expect(() =>
        buildDatabaseConnection(
          'postgresql://u:p@localhost:5432/app?target_session_attrs=any',
          false
        )
      ).toThrow(/does not support/);
    });

    it('returns nothing to connect to when no URL is configured', () => {
      expect(buildDatabaseConnection(undefined, true)).toEqual({ ssl: false, extra: {} });
    });
  });

  describe('how to secure it', () => {
    it('leaves a sslmode=disable connection unencrypted in every environment', () => {
      const url = 'postgresql://tino:tino@localhost:5432/tino_app?sslmode=disable';

      expect(buildDatabaseConnection(url, false).ssl).toBe(false);
      // What production runs today; requiring TLS here would break a working deploy.
      expect(buildDatabaseConnection(url, true).ssl).toBe(false);
    });

    it('does not enable TLS for a plain development connection string', () => {
      expect(buildDatabaseConnection('postgresql://tino:tino@localhost:5432/app', false).ssl).toBe(
        false
      );
    });

    it('verifies the peer whenever TLS is used', () => {
      // Stricter than libpq on purpose: `require` skips verification there.
      for (const mode of ['require', 'verify-ca', 'verify-full', 'prefer', 'allow']) {
        expect(buildDatabaseConnection(`postgresql://h/db?sslmode=${mode}`, false).ssl).toEqual({
          rejectUnauthorized: true,
        });
      }

      expect(buildDatabaseConnection('postgresql://h/db', true).ssl).toEqual({
        rejectUnauthorized: true,
      });
    });

    it('supplies an inline CA to the verifier', () => {
      process.env.DATABASE_SSL_CA = '-----BEGIN CERTIFICATE-----inline-----END CERTIFICATE-----';

      expect(buildDatabaseConnection('postgresql://h/db?sslmode=require', false).ssl).toEqual({
        rejectUnauthorized: true,
        ca: process.env.DATABASE_SSL_CA,
      });
    });

    it('supplies a file-based CA to the verifier', () => {
      process.env.DATABASE_SSL_CA_FILE = caFile('file-ca');

      expect(buildDatabaseConnection('postgresql://h/db?sslmode=require', false).ssl).toEqual({
        rejectUnauthorized: true,
        ca: 'file-ca',
      });
    });

    it('accepts the CA named by the URL when no env CA is set', () => {
      const file = caFile('url-ca');

      expect(
        buildDatabaseConnection(`postgresql://h/db?sslmode=verify-full&sslrootcert=${file}`, false)
          .ssl
      ).toEqual({ rejectUnauthorized: true, ca: 'url-ca' });
    });

    it('treats a CA named by the URL as a request for TLS, with no sslmode present', () => {
      // pg enables TLS for any `ssl*` parameter. Reading only `sslmode` would answer
      // "no TLS" for a URL that asked to verify a certificate.
      expect(
        buildDatabaseConnection(`postgresql://h/db?sslrootcert=${caFile('url-ca')}`, false).ssl
      ).toEqual({ rejectUnauthorized: true, ca: 'url-ca' });
    });

    it('lets sslmode=disable outrank a CA named alongside it', () => {
      expect(
        buildDatabaseConnection(
          `postgresql://h/db?sslmode=disable&sslrootcert=${caFile('unused-ca')}`,
          false
        ).ssl
      ).toBe(false);
    });

    it('refuses to start rather than fall back to the system store', () => {
      process.env.DATABASE_SSL_CA_FILE = '/nonexistent/ca.pem';

      // Silently ignoring a configured-but-unreadable CA is the same silent
      // downgrade this module exists to prevent.
      expect(() => buildDatabaseConnection('postgresql://h/db?sslmode=require', false)).toThrow(
        /could not be read/
      );
    });

    it('allows an unverified peer only outside production', () => {
      process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED = 'true';

      expect(buildDatabaseConnection('postgresql://h/db?sslmode=require', false).ssl).toEqual({
        rejectUnauthorized: false,
      });
      expect(() => buildDatabaseConnection('postgresql://h/db?sslmode=require', true)).toThrow(
        /cannot be used in production/
      );
    });

    it('ignores the escape hatch unless it is set to exactly "true"', () => {
      for (const value of ['false', '1']) {
        process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED = value;
        expect(buildDatabaseConnection('postgresql://h/db?sslmode=require', false).ssl).toEqual({
          rejectUnauthorized: true,
        });
      }
    });

    it('treats sslmode=no-verify as the escape hatch, not as an unknown mode', () => {
      // A real node-postgres mode. Reading it as "unrecognised, so no TLS" would
      // turn an encrypted connection into a plaintext one.
      expect(buildDatabaseConnection('postgresql://h/db?sslmode=no-verify', false).ssl).toEqual({
        rejectUnauthorized: false,
      });
      expect(() => buildDatabaseConnection('postgresql://h/db?sslmode=no-verify', true)).toThrow(
        /cannot be used in production/
      );
    });

    it('refuses an unrecognised sslmode rather than dropping TLS', () => {
      // pg would have connected over TLS for anything it did not read as `disable`.
      expect(() => buildDatabaseConnection('postgresql://h/db?sslmode=required', true)).toThrow(
        /not a recognised mode/
      );
    });

    it('refuses an ssl parameter it cannot honour instead of silently dropping it', () => {
      // pg loads these files while parsing, so the rejection is based on what it
      // actually loaded rather than on a second reading of the URL text.
      for (const param of ['sslcert', 'sslkey']) {
        expect(() =>
          buildDatabaseConnection(
            `postgresql://h/db?sslmode=require&${param}=${caFile('client-material')}`,
            false
          )
        ).toThrow(/client-certificate/);
      }
    });

    it('fails closed when the URL names a CA that cannot be read', () => {
      expect(() =>
        buildDatabaseConnection('postgresql://h/db?sslrootcert=/nonexistent/ca.pem', false)
      ).toThrow(/ENOENT|no such file/);
    });
  });

  /**
   * The rules below are pg's, and every one of them was a separate blocking review
   * finding while this module maintained its own parser. They now hold because the
   * parser *is* pg's — these tests exist to fail loudly if anyone reintroduces a
   * second reading of the connection string.
   */
  describe("agrees with pg's reading of the connection string", () => {
    it('resolves a duplicated parameter the way pg does, last one winning', () => {
      // `URLSearchParams.get` returns the first; pg keeps the last. Reading it as
      // `disable` here would hand pg a plaintext connection for a URL asking for TLS.
      expect(
        buildDatabaseConnection('postgresql://h/db?sslmode=disable&sslmode=require', false).ssl
      ).toEqual({ rejectUnauthorized: true });
    });

    it('reads a percent-encoded parameter name', () => {
      // `%73slmode` is `sslmode` to pg, so it must be to us.
      expect(buildDatabaseConnection('postgresql://h/db?%73slmode=disable', true).ssl).toBe(false);
    });

    it('never returns a connection string for pg to re-parse', () => {
      // The structural guarantee. TypeORM only forwards `connectionString` when the
      // options carry a `url`; nothing here produces one, so pg has no second source
      // of truth that could overwrite `ssl`.
      const connection = buildDatabaseConnection(
        'postgresql://u:p@db.example.com:5432/app?sslmode=require',
        false
      );

      expect(connection).not.toHaveProperty('url');
      expect(Object.values(connection.extra)).not.toContainEqual(
        expect.stringContaining('sslmode')
      );
    });
  });
});
