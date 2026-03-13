import { ApplicationConfigs } from "../configs";
import { logger } from "../logger";
import { inGameUserStateRoutes } from "./routes/InGameUserStateRoute";
import { openApiRoutes } from "./routes/OpenApiRoute";

export function createHttpServer() {
  const routes = {
    ...inGameUserStateRoutes(),
    ...openApiRoutes(),
  };

  const port = ApplicationConfigs.instance.server.port;

  Bun.serve({
    port,
    routes,
    fetch(req) {
      return new Response("Not Found", { status: 404 });
    },
  });

  logger.info({ port }, "[HTTP] Server listening");
}
