import * as fs from 'fs';

/**
 * TLS policy for every PostgreSQL connection the backend opens.
 *
 * The previous setting — `ssl: { rejectUnauthorized: false }` whenever
 * NODE_ENV=production — encrypted the wire but authenticated nobody, so anything
 * able to sit between the app and PostgreSQL could present its own certificate
 * and read or rewrite credentials, messages and payment metadata. Verification is
 * therefore the default and the insecure mode is an explicit, non-production-only
 * escape hatch that refuses to activate in production rather than downgrading
 * silently.
 *
 * ## Why this returns the URL as well as the options
 *
 * TypeORM hands node-postgres *both* the connection string and the `ssl` object
 * (`PostgresDriver.createPool`), and pg merges the parsed connection string **over**
 * the explicit config:
 *
 * ```js
 * config = Object.assign({}, mergedConfig, parse(mergedConfig.connectionString))
 * ```
 *
 * pg-connection-string sets `config.ssl` as soon as the URL carries any `ssl*`
 * parameter, so a URL saying `sslmode=require` **replaces** whatever this module
 * decided: the configured CA is discarded, and the verification setting becomes
 * pg's rather than ours (today `{}`; under libpq semantics, which pg is migrating
 * to, `require` does not verify at all). Splitting the decision across two inputs
 * means the stricter one silently loses.
 *
 * So the URL is returned with the `ssl*` parameters this module understands removed.
 * The connection string still decides *whether* TLS is used — that decision is read
 * here first — but the options object is then the single authority on *how*. An
 * `ssl*` parameter that could not be honoured is an error, never a silent drop.
 */
export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

export interface DatabaseConnection {
  /** The connection string with the consumed `ssl*` parameters stripped. */
  url: string | undefined;
  ssl: false | DatabaseSslOptions;
}

/** libpq modes that ask for an encrypted, verified connection. */
const TLS_MODES = new Set(['allow', 'prefer', 'require', 'verify-ca', 'verify-full']);

/**
 * node-postgres' own mode for "encrypt but do not verify". It is a real mode an
 * operator can reasonably copy from a hosting guide, so it is honoured through the
 * same path as the escape hatch — refused in production — rather than treated as
 * unrecognised.
 */
const UNVERIFIED_MODE = 'no-verify';

/**
 * `ssl*` parameters this module understands and therefore consumes from the URL.
 * Anything else `ssl*` is rejected rather than dropped: stripping a parameter the
 * options object cannot express (`sslcert`, `sslkey`) would silently disable
 * client-certificate authentication.
 */
const CONSUMED_SSL_PARAMS = new Set(['sslmode', 'sslrootcert']);

const readCa = (rootCertPath?: string): string | undefined => {
  const inline = process.env.DATABASE_SSL_CA?.trim();
  if (inline) return inline;

  // The URL's own `sslrootcert` is the same statement as DATABASE_SSL_CA_FILE, and
  // it has to be read here because the parameter is stripped before pg sees it.
  const path = process.env.DATABASE_SSL_CA_FILE?.trim() || rootCertPath?.trim();
  if (!path) return undefined;

  try {
    return fs.readFileSync(path, 'utf8');
  } catch (error) {
    // A CA that was configured but cannot be read must not fall back to the
    // system store — that is the silent downgrade this function exists to stop.
    throw new Error(
      `The database CA at "${path}" could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * The name of a query parameter as its *consumers* see it. `URLSearchParams` and
 * pg-connection-string both percent-decode keys, so `%73slmode` is `sslmode` to
 * both. Comparing raw text here instead would let an encoded key pass the strip
 * while still reaching pg — two parsers disagreeing about one setting, which is
 * the whole failure this module exists to prevent.
 */
const decodeParamName = (raw: string): string => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).toLowerCase();
  } catch {
    // Malformed escape: not decodable, so it cannot be one of ours either.
    return raw.toLowerCase();
  }
};

const searchParamsOf = (url: string): URLSearchParams => {
  try {
    return new URL(url).searchParams;
  } catch {
    return new URLSearchParams();
  }
};

const sslModeOf = (url: string): string | undefined =>
  searchParamsOf(url).get('sslmode')?.toLowerCase() ?? undefined;

/**
 * Rejects any `ssl*` parameter this module would otherwise drop on the floor.
 * Called before the URL is stripped, so nothing is discarded unnoticed.
 */
const assertNoUnsupportedSslParams = (url: string): void => {
  // `URLSearchParams` has already decoded these keys; `stripSslParams` decodes its
  // own the same way, so both agree on what counts as `sslmode`.
  for (const key of searchParamsOf(url).keys()) {
    const name = key.toLowerCase();
    if (name.startsWith('ssl') && !CONSUMED_SSL_PARAMS.has(name)) {
      throw new Error(
        `The database connection string sets "${key}", which this configuration cannot ` +
          'honour. TLS options are resolved from DATABASE_SSL_CA / DATABASE_SSL_CA_FILE; ' +
          'client-certificate authentication is not supported.'
      );
    }
  }
};

/**
 * Removes the `ssl*` query parameters this module consumes, so pg's
 * connection-string parser has no reason to synthesise an `ssl` config that would
 * overwrite ours.
 *
 * Each pair that survives is copied through verbatim, and everything before the
 * query string is preserved byte for byte rather than rebuilt through `URL`, so no
 * credential is re-encoded on the way past. Only the *comparison* is decoded.
 */
const stripSslParams = (url: string): string => {
  const separator = url.indexOf('?');
  if (separator === -1) return url;

  const base = url.slice(0, separator);
  const kept = url
    .slice(separator + 1)
    .split('&')
    .filter((pair) => {
      if (pair === '') return false;
      return !CONSUMED_SSL_PARAMS.has(decodeParamName(pair.split('=')[0]));
    });

  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
};

/**
 * @param rawUrl       the connection string configured for this data source
 * @param isProduction whether to default to TLS when the URL says nothing
 */
export const buildDatabaseConnection = (
  rawUrl: string | undefined,
  isProduction = process.env.NODE_ENV === 'production'
): DatabaseConnection => ({
  url: rawUrl === undefined ? undefined : stripSslParams(rawUrl),
  ssl: buildDatabaseSsl(rawUrl, isProduction),
});

/**
 * The TLS options alone. Exported for tests and for any caller that already
 * holds a sanitised URL; production code should prefer `buildDatabaseConnection`,
 * which cannot be used while leaving the URL's own `ssl*` parameters in place.
 */
export const buildDatabaseSsl = (
  rawUrl: string | undefined,
  isProduction = process.env.NODE_ENV === 'production'
): false | DatabaseSslOptions => {
  // Nothing to secure: this data source has no connection string to use.
  if (!rawUrl) return false;

  assertNoUnsupportedSslParams(rawUrl);
  const mode = sslModeOf(rawUrl);

  // `sslmode=disable` is an explicit "no TLS"; without a mode, production keeps
  // its historical default of connecting over TLS.
  if (mode === 'disable') return false;
  if (!mode && !isProduction) return false;

  const unverified =
    mode === UNVERIFIED_MODE || process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED === 'true';

  // An unrecognised mode must not mean "no TLS". Before this module existed, pg's
  // own parser turned even a typo into a TLS connection, so failing open here would
  // downgrade an encrypted connection to plaintext — the exact fault being fixed.
  if (mode && !TLS_MODES.has(mode) && !unverified) {
    throw new Error(
      `The database connection string sets sslmode="${mode}", which is not a recognised ` +
        'mode. Use disable, require, verify-ca, verify-full, or no-verify.'
    );
  }

  if (unverified) {
    if (isProduction) {
      throw new Error(
        'An unverified database peer may be an impersonator, so sslmode=no-verify and ' +
          'DATABASE_SSL_ALLOW_UNAUTHORIZED cannot be used in production. Install the ' +
          'provider CA through DATABASE_SSL_CA or DATABASE_SSL_CA_FILE instead.'
      );
    }
    return { rejectUnauthorized: false };
  }

  // Note this is stricter than libpq: `sslmode=require` skips verification there,
  // while here every TLS mode verifies. Opting out is the escape hatch above.
  const ca = readCa(searchParamsOf(rawUrl).get('sslrootcert') ?? undefined);
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
};
