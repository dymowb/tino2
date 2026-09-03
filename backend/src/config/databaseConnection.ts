import * as fs from 'fs';
import { parse } from 'pg-connection-string';

/**
 * Resolves one PostgreSQL connection — where to connect and how to secure it.
 *
 * ## Why nothing here hands TypeORM a URL
 *
 * TypeORM passes node-postgres *both* the connection string and the `ssl` object
 * (`PostgresDriver.createPool`), and pg then merges the parsed string **over** the
 * explicit config:
 *
 * ```js
 * config = Object.assign({}, mergedConfig, parse(mergedConfig.connectionString))
 * ```
 *
 * So whenever the URL said anything about TLS, it replaced whatever policy this
 * module had decided. The obvious repair — strip the `ssl*` parameters out of the
 * URL first — requires re-deriving pg's parsing rules by hand, and four successive
 * reviews found four places where that derivation was wrong: percent-encoded keys
 * decode (`%73slmode` is `sslmode`), *any* `ssl*` parameter enables TLS rather than
 * `sslmode` alone, and duplicate parameters resolve last-wins where `URLSearchParams`
 * gives first. Each fix uncovered the next divergence, because a second parser can
 * always disagree with the first.
 *
 * The connection string is therefore parsed **once, by pg's own parser**, and its
 * fields are handed to TypeORM explicitly. No `connectionString` reaches pg, so
 * there is nothing left to re-parse and nothing to disagree with: this module's
 * `ssl` is the connection's `ssl`, by construction rather than by vigilance.
 */
export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

export interface DatabaseConnection {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl: false | DatabaseSslOptions;
  /** Remaining libpq parameters (`application_name`, …), forwarded to the driver. */
  extra: Record<string, unknown>;
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

/** Keys this module consumes, so they are never forwarded to the driver twice. */
const CONSUMED_KEYS = new Set([
  'host',
  'port',
  'database',
  'user',
  'password',
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'sslnegotiation',
  'uselibpqcompat',
]);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** An empty password is a real setting; an empty host or database is not. */
const asSecret = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** The CA configured by environment, which outranks anything the URL names. */
const envCa = (): string | undefined => {
  const inline = process.env.DATABASE_SSL_CA?.trim();
  if (inline) return inline;

  const path = process.env.DATABASE_SSL_CA_FILE?.trim();
  if (!path) return undefined;

  try {
    return fs.readFileSync(path, 'utf8');
  } catch (error) {
    // A CA that was configured but cannot be read must not fall back to the system
    // store — that is the silent downgrade this module exists to stop. (pg fails the
    // same way for a `sslrootcert` it cannot read, while parsing.)
    throw new Error(
      `The database CA at "${path}" could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * The TLS policy for a connection string pg has already parsed.
 *
 * Every question about *what the URL said* is answered from pg's own output rather
 * than re-read from the text: `parsed.ssl` is `false` for `sslmode=disable`,
 * `undefined` when no `ssl*` parameter was given, and otherwise an object carrying
 * whatever files pg loaded. Duplicate parameters, percent-encoded names and the
 * "any `ssl*` parameter enables TLS" rule therefore need no restating here.
 *
 * @param parsed       pg's own reading of the connection string
 * @param isProduction whether to default to TLS when the string says nothing
 */
export const resolveDatabaseSsl = (
  parsed: Record<string, unknown>,
  isProduction = process.env.NODE_ENV === 'production'
): false | DatabaseSslOptions => {
  const fromUrl = parsed.ssl;

  // `sslmode=disable` is an explicit "no TLS", and it outranks everything else.
  if (fromUrl === false) return false;

  // pg sets this as soon as the string carries any `ssl*` parameter.
  const requestedByUrl = fromUrl !== undefined;
  if (!requestedByUrl && !isProduction) return false;

  const loaded = (typeof fromUrl === 'object' && fromUrl !== null ? fromUrl : {}) as {
    ca?: string;
    cert?: string;
    key?: string;
  };

  // A client certificate is something these options cannot express. Honouring the
  // URL only partially would silently disable certificate authentication.
  if (loaded.cert !== undefined || loaded.key !== undefined) {
    throw new Error(
      'The database connection string sets sslcert/sslkey, which this configuration ' +
        'cannot honour. TLS options are resolved from DATABASE_SSL_CA / ' +
        'DATABASE_SSL_CA_FILE; client-certificate authentication is not supported.'
    );
  }

  const mode = asString(parsed.sslmode)?.toLowerCase();
  const unverified =
    mode === UNVERIFIED_MODE || process.env.DATABASE_SSL_ALLOW_UNAUTHORIZED === 'true';

  // Deliberately stricter than pg, which treats an unrecognised mode as "verify".
  // Silence about a mode nobody implemented is a configuration error worth failing on,
  // and failing *closed* — never by dropping TLS.
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

  // Stricter than libpq: `sslmode=require` skips verification there, while every TLS
  // mode verifies here. Opting out is the escape hatch above.
  const ca = envCa() ?? loaded.ca;
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
};

/**
 * @param rawUrl       the connection string configured for this data source
 * @param isProduction whether to default to TLS when the string says nothing
 */
export const buildDatabaseConnection = (
  rawUrl: string | undefined,
  isProduction = process.env.NODE_ENV === 'production'
): DatabaseConnection => {
  if (!rawUrl) return { ssl: false, extra: {} };

  // pg's parser, not ours. Percent-encoded keys, duplicate parameters, IPv6 hosts,
  // unix sockets and encoded credentials are then read exactly as the driver would
  // have read them, because it is the same code.
  const parsed = parse(rawUrl) as unknown as Record<string, unknown>;
  const ssl = resolveDatabaseSsl(parsed, isProduction);

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (CONSUMED_KEYS.has(key) || value === undefined || value === null) continue;
    extra[key] = value;
  }

  const port = asString(parsed.port);

  return {
    host: asString(parsed.host),
    port: port === undefined ? undefined : Number(port),
    username: asString(parsed.user),
    password: asSecret(parsed.password),
    database: asString(parsed.database),
    ssl,
    extra,
  };
};
