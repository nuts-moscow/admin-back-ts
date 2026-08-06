import type { BunRequest } from "bun";
import type { PlayerAuthContext } from "../middleware/playerAuth";
import { getClientIp } from "../services/AuthService";
import { type EndScope, playerSessionService } from "../services/PlayerSessionService";
import { logger } from "../../logger";

type PlayerAuthRequest = Request & { playerAuthCtx?: PlayerAuthContext };

function getCtx(req: Request): PlayerAuthContext | null {
  return (req as PlayerAuthRequest).playerAuthCtx ?? null;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A player's own sessions. Ending them costs one call and no letter — the
 * alternative used to be a full password reset, which spends a code and a
 * mailbox round-trip for something the blocklist answers.
 */
export function playerSessionRoutes() {
  return {
    "/api/player-auth/sessions/end": {
      POST: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();

        // Scope is optional; a bare call ends the presented grant only.
        let scope: EndScope = "current";
        const contentType = req.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          try {
            const body = (await req.json()) as { scope?: unknown };
            if (body?.scope === "all") scope = "all";
          } catch {
            // A malformed body is not worth refusing over: the default stands.
          }
        }

        await playerSessionService.endSession(scope, ctx.jti, ctx.playerUserId);
        logger.info(
          { playerUserId: ctx.playerUserId, scope, ip: getClientIp(req) },
          "[PlayerSession] player ended sessions"
        );
        return new Response(null, { status: 204 });
      },
    },
  };
}
