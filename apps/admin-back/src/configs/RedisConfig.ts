export interface RedisConfig {
  url: string;
  db: number;
}

export function loadRedisConfig(): RedisConfig {
  const dbRaw = process.env.REDIS_DB;
  const db = dbRaw !== undefined ? parseInt(dbRaw, 10) : 0;
  const url = process.env.REDIS_URL;
  // No default: this used to be a real password baked in as a fallback,
  // sitting in plaintext in git history.
  if (!url) {
    throw new Error("REDIS_URL must be set (no default — set the real value in .env)");
  }
  return { url, db: Number.isNaN(db) ? 1 : db };
}
