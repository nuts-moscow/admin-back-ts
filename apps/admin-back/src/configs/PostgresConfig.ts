export interface PostgresConfig {
  url: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  /** Resolved host for logging (from URL or env) */
  host: string;
  /** Resolved database for logging (from URL or env) */
  database: string;
}

/** Assembles a connection string from POSTGRES_PASSWORD — no fallback
 * password: this used to have one baked in, which meant it was sitting in
 * plaintext in git history. Set POSTGRES_URL directly instead if that's
 * more convenient. */
function buildUrlFromPassword(user: string, host: string, port: string, database: string): string {
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) {
    throw new Error(
      "POSTGRES_URL or POSTGRES_PASSWORD must be set (no default — set the real value in .env)"
    );
  }
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function loadPostgresConfig(): PostgresConfig {
  const user = process.env.POSTGRES_USER ?? "nuts-user";
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const database = process.env.POSTGRES_DATABASE ?? "nuts-poker";
  const url = process.env.POSTGRES_URL ?? buildUrlFromPassword(user, host, port, database);
  const ssl = process.env.POSTGRES_SSL !== "false" && process.env.POSTGRES_SSL !== "0";
  const sslRejectUnauthorized = process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === "true" || process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === "1";
  let resolvedHost = host;
  let resolvedDb = database;
  if (process.env.POSTGRES_URL) {
    try {
      const u = new URL(process.env.POSTGRES_URL.replace(/^postgres:/, "https:"));
      resolvedHost = u.hostname;
      resolvedDb = u.pathname?.replace(/^\//, "") || database;
    } catch {
      /* keep defaults */
    }
  }
  return { url, ssl, sslRejectUnauthorized, host: resolvedHost, database: resolvedDb };
}