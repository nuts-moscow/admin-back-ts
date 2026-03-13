import "./http/openapi/zod-extend";
import { ApplicationConfigs } from "./configs";
import { wireHttp, wireRedis } from "./wiring";

async function main() {
  ApplicationConfigs.init();
  await wireRedis();
  wireHttp();

  console.log("Hello via Bun!");
}

main();
