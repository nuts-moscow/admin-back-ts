export interface PostgresConfig {
  url: string;
}

export function loadPostgresConfig(): PostgresConfig {
  const user = process.env.POSTGRES_USER ?? "nuts-user";
  const password = process.env.POSTGRES_PASSWORD ?? "GdftXsks8eN6L";
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const database = process.env.POSTGRES_DATABASE ?? "nuts";
  const url =
    process.env.POSTGRES_URL ??
    `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  return { url };
}