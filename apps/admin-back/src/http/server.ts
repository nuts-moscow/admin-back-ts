import type { ServerWebSocket } from "bun";
import { ApplicationConfigs } from "../configs";
import { logger } from "../logger";
import { withCors, corsHeaders } from "./cors";
import { createRouter } from "./router";
import { authRoutes } from "./routes/AuthRoute";
import { hallOfFameRoutes } from "./routes/HallOfFameRoute";
import { inGameUserStateRoutes } from "./routes/InGameUserStateRoute";
import { openApiRoutes } from "./routes/OpenApiRoute";
import { mailWebhookRoutes } from "./routes/MailWebhookRoute";
import { playerAuthRoutes } from "./routes/PlayerAuthRoute";
import { playerSessionRoutes } from "./routes/PlayerSessionRoute";
import { playerRoutes } from "./routes/PlayerRoute";
import { playersRoutes } from "./routes/PlayersRoute";
import { publicRoutes } from "./routes/PublicRoute";
import { seasonFinalRoutes } from "./routes/SeasonFinalRoute";
import { tournamentRoutes } from "./routes/TournamentRoute";
import { requireAuth } from "./middleware/auth";
import {
  isPlayerAuthPublicPath,
  requirePlayerAuth,
  type PlayerAuthContext,
} from "./middleware/playerAuth";
import { initDummyHash } from "./services/AuthService";
import { initPlayerDummyHash } from "./services/PlayerAuthService";
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
  await initPlayerDummyHash();

  const routes = {
    ...authRoutes(),
    ...publicRoutes(),
    ...inGameUserStateRoutes(),
    ...playersRoutes(),
    ...tournamentRoutes(),
    ...openApiRoutes(),
    ...hallOfFameRoutes(),
    ...mailWebhookRoutes(),
    ...playerAuthRoutes(),
    ...playerSessionRoutes(),
    ...playerRoutes(),
    ...seasonFinalRoutes(),
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

        // The mail provider's delivery webhook belongs to neither realm: it
        // carries no grant and authenticates itself by a shared secret, so it
        // must reach its handler before the admin auth middleware.
        if (url.pathname === "/api/mail/delivery") {
          const mailResponse = await router(req);
          if (mailResponse) return withCors(mailResponse, origin);
          return withCors(new Response("Not Found", { status: 404 }), origin);
        }

        // Routing split: player-app endpoints are gated by playerAuth, never by admin auth.
        if (
          url.pathname.startsWith("/api/player-auth/") ||
          url.pathname.startsWith("/api/player/")
        ) {
          if (!isPlayerAuthPublicPath(req.method.toUpperCase(), url.pathname)) {
            const { response: pResp, ctx: pCtx } = await requirePlayerAuth(req);
            if (pResp) {
              return withCors(pResp, origin);
            }
            Object.assign(req, { playerAuthCtx: pCtx as PlayerAuthContext });
          }
          const playerResponse = await router(req);
          if (playerResponse) return withCors(playerResponse, origin);
          return withCors(new Response("Not Found", { status: 404 }), origin);
        }

        // Admin auth middleware — runs before remaining HTTP routes
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
