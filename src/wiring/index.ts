import { createHttpServer } from "../http";
import { startTournamentClockBroadcastLoop } from "../http/tournamentClockSocket";
import { logger } from "../logger";
import { PostgresClient } from "../postgres";
import { RedisClient } from "../redis";

export async function wirePostgres(): Promise<void> {
  try {
    await PostgresClient.init();
  } catch (err) {
    logger.info({ err }, "[Postgres] init failed");
    throw err;
  }
}

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
  startTournamentClockBroadcastLoop();
}
