import type { ServerWebSocket } from "bun";
import { ApplicationConfigs } from "../configs";
import { logger } from "../logger";
import { withCors, corsHeaders } from "./cors";
import { createRouter } from "./router";
import { authRoutes } from "./routes/AuthRoute";
import { inGameUserStateRoutes } from "./routes/InGameUserStateRoute";
import { openApiRoutes } from "./routes/OpenApiRoute";
import { playersRoutes } from "./routes/PlayersRoute";
import { tournamentRoutes } from "./routes/TournamentRoute";
import { requireAuth } from "./middleware/auth";
import { initDummyHash } from "./services/AuthService";
import type { AuthContext } from "./middleware/auth";
import {
  onTournamentClockSocketClose,
  onTournamentClockSocketOpen,
  type TournamentClockWsData,
} from "./tournamentClockSocket";

const CLOCK_WS_PATH = /^\/ws\/tournaments\/(\d+)\/clock\/?$/;

export async function createHttpServer() {
  // Pre-compute dummy hash for timing-safe login (prevents username enumeration via response time)
  await initDummyHash();

  const routes = {
    ...authRoutes(),
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
      const origin = req.headers.get("origin");
      try {
        if (req.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: corsHeaders(origin),
          });
        }

        // WebSocket upgrade is public — no auth required
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

        // Auth middleware — runs before all HTTP routes
        const { response: authResponse, ctx } = await requireAuth(req);
        if (authResponse) {
          return withCors(authResponse, origin);
        }

        // Attach auth context to request so route handlers can read it
        if (ctx) {
          Object.assign(req, { authCtx: ctx as AuthContext });
        }

        const response = await router(req);
        if (response) {
          return withCors(response, origin);
        }
        return withCors(new Response("Not Found", { status: 404 }), origin);
      } catch (err) {
        const url = new URL(req.url);
        logger.error({ err, method: req.method, path: url.pathname }, "[HTTP] Unhandled error in fetch handler");
        return withCors(
          new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
          origin
        );
      }
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

  const { corsOrigin } = ApplicationConfigs.instance.server;
  logger.info({ port, corsOrigin }, "[HTTP] Server listening");
}
