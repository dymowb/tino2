import * as fs from 'fs';

/**
 * TLS policy for every PostgreSQL connection the backend opens.
 *
 * The previous setting — `ssl: { rejectUnauthorized: false }` whenever
 * NODE_ENV=production — encrypted the wire but authenticated nobody, so anything
 * able to sit between the app and the database could present its own certificate
 * and read or rewrite credentials, messages and payment metadata. Verification is
 * therefore the default and the insecure mode is an explicit, non-production-only
 * escape hatch that refuses to activate in production rather than downgrading
 * silently.
 *
 * Whether TLS is used at all still follows the connection string, so a local
 * `sslmode=disable` database (what production runs today) is unaffected.
 */
export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

/** libpq modes that ask for an encrypted connection. */
const TLS_MODES = new Set(['allow', 'prefer', 'require', 'verify-ca', 'verify-full']);

const readCa = (): string | undefined => {
  const inline = process.env.DATABASE_SSL_CA?.trim();
  if (inline) return inline;

  const path = process.env.DATABASE_SSL_CA_FILE?.trim();
  if (!path) return undefined;

  try {
    return fs.readFileSync(path, 'utf8');
  } catch (error) {
    // A CA that was configured but cannot be read must not fall back to the
    // system store — that is the silent downgrade this function exists to stop.
    throw new Error(
      `DATABASE_SSL_CA_FILE is set to "${path}" but could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const sslModeOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get('sslmode')?.toLowerCase() ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * @param url          the connection string this data source will use
 * @param isProduction whether to default to TLS when the URL says nothing
 */
export const buildDatabaseSsl = (
  url: string | undefined,
  isProduction = process.env.NODE_ENV === 'production'
): false | DatabaseSslOptions => {
  // Nothing to secure: this data source has no connection string to use.
  if (!url) return false;

  const mode = sslModeOf(url);

  // `sslmode=disable` is an explicit "no TLS"; without a mode, production keeps
  // its historical default of connecting over TLS.
  if (mode === 'disable') return false;
  if (!mode && !isProduction) return false;
  if (mode && !TLS_MODES.has(mode)) return false;

  const allowUnauthorized = process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED === 'true';
  if (allowUnauthorized) {
    if (isProduction) {
      throw new Error(
        'DATABASE_SSL_ALLOW_UNAUTHORIZED cannot be used in production: an unverified ' +
          'database peer may be an impersonator. Install the provider CA through ' +
          'DATABASE_SSL_CA or DATABASE_SSL_CA_FILE instead.'
      );
    }
    return { rejectUnauthorized: false };
  }

  // Note this is stricter than libpq: `sslmode=require` skips verification there,
  // while here every TLS mode verifies. Opting out is the escape hatch above.
  const ca = readCa();
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
};
