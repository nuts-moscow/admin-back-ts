import { ApplicationConfigs } from "../configs";
import { logger } from "../logger";
import { withCors, corsHeaders } from "./cors";
import { createRouter } from "./router";
import { inGameUserStateRoutes } from "./routes/InGameUserStateRoute";
import { openApiRoutes } from "./routes/OpenApiRoute";

export function createHttpServer() {
  const routes = {
    ...inGameUserStateRoutes(),
    ...openApiRoutes(),
  };

  // Route handlers expect BunRequest; router passes Request with params (compatible at runtime)
  const router = createRouter(routes as Record<string, Partial<Record<string, (req: unknown) => Response | Promise<Response>>>>);
  const port = ApplicationConfigs.instance.server.port;

  Bun.serve({
    port,
    async fetch(req) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(),
        });
      }

      const response = await router(req);
      if (response) {
        return withCors(response);
      }
      return withCors(new Response("Not Found", { status: 404 }));
    },
  });

  logger.info({ port }, "[HTTP] Server listening");
}
