import "./http/openapi/zod-extend";
import { ApplicationConfigs } from "./configs";
import { initLogger, logger } from "./logger";
import { wireHttp, wireRedis } from "./wiring";

async function main() {
  ApplicationConfigs.init();
  await initLogger();
  await wireRedis();
  wireHttp();

  logger.info("Application started");
}

main();
