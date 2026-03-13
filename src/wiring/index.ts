import { RedisClient } from "../redis";
import { createHttpServer } from "../http";

export async function wireRedis(): Promise<void> {
  try {
    await RedisClient.init();
  } catch (err) {
    console.error("[Redis] init failed:", err);
    throw err;
  }
}

export function wireHttp(): void {
  createHttpServer();
}
