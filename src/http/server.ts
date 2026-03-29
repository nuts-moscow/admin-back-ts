import type { ServerWebSocket } from "bun";
import { ApplicationConfigs } from "../configs";
import { logger } from "../logger";
import { withCors, corsHeaders } from "./cors";
import { createRouter } from "./router";
import { inGameUserStateRoutes } from "./routes/InGameUserStateRoute";
import { openApiRoutes } from "./routes/OpenApiRoute";
import { playersRoutes } from "./routes/PlayersRoute";
import { tournamentRoutes } from "./routes/TournamentRoute";
import {
  onTournamentClockSocketClose,
  onTournamentClockSocketOpen,
  type TournamentClockWsData,
} from "./tournamentClockSocket";

const CLOCK_WS_PATH = /^\/ws\/tournaments\/(\d+)\/clock\/?$/;

export function createHttpServer() {
  const routes = {
    ...inGameUserStateRoutes(),
    ...playersRoutes(),
    ...tournamentRoutes(),
    ...openApiRoutes(),
  };

  // Route handlers expect BunRequest; router passes Request with params (compatible at runtime)
  const router = createRouter(routes as Record<string, Partial<Record<string, (req: unknown) => Response | Promise<Response>>>>);
  const port = ApplicationConfigs.instance.server.port;

  Bun.serve<TournamentClockWsData>({
    port,
    async fetch(req, server) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(),
        });
      }

      const url = new URL(req.url);
      const wsMatch = url.pathname.match(CLOCK_WS_PATH);
      if (
        wsMatch &&
        req.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        const tournamentId = parseInt(wsMatch[1]!, 10);
        if (!Number.isNaN(tournamentId)) {
          const upgraded = server.upgrade(req, {
            data: { tournamentId },
          });
          if (upgraded) return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      const response = await router(req);
      if (response) {
        return withCors(response);
      }
      return withCors(new Response("Not Found", { status: 404 }));
    },
    websocket: {
      open(ws: ServerWebSocket<TournamentClockWsData>) {
        onTournamentClockSocketOpen(ws);
      },
      close(ws: ServerWebSocket<TournamentClockWsData>) {
        onTournamentClockSocketClose(ws);
      },
      message() {
        /* clock is server-pushed only */
      },
    },
  });

  logger.info({ port }, "[HTTP] Server listening");
}
