export interface RedisConfig {
  url: string;
  db: number;
}

export function loadRedisConfig(): RedisConfig {
  const dbRaw = process.env.REDIS_DB;
  const db = dbRaw !== undefined ? parseInt(dbRaw, 10) : 0;
  return {
    url: process.env.REDIS_URL ?? "redis://:O2SAyRh2Fba40ri@localhost:6379",
    db: Number.isNaN(db) ? 1 : db,
  };
}
