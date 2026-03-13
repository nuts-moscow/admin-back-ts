import { RedisClient } from "../redis";
import { createHttpServer } from "../http";
import { logger } from "../logger";

export async function wireRedis(): Promise<void> {
  try {
    await RedisClient.init();
  } catch (err) {
    logger.info({ err }, "[Redis] init failed");
    throw err;
  }
}

export function wireHttp(): void {
  createHttpServer();
}
