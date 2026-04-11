import "./http/openapi/zod-extend";
import { ApplicationConfigs } from "./configs";
import { initLogger, logger } from "./logger";
import { wireHttp, wirePostgres, wireRedis } from "./wiring";

async function main() {
  ApplicationConfigs.init();
  await initLogger();
  await wirePostgres();
  await wireRedis();
  await wireHttp();

  logger.info("Application started");
}

main();
