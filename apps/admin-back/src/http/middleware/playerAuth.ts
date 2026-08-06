import { logger } from "../../logger";
import { playerUserRepository } from "../../postgres/PlayerUserRepository";
import { resolveAllowedOrigin } from "../cors";
import { getBearerToken, getClientIp } from "../services/AuthService";
import { playerSessionService } from "../services/PlayerSessionService";

export interface PlayerAuthContext {
  playerUserId: number;
  playerId: number;
  jti: string;
}

const PLAYER_AUTH_PUBLIC: Array<{ method: string; path: string }> = [
  { method: "POST", path: "/api/player-auth/login" },
  // Open self-registration — must be reachable without an existing token.
  { method: "POST", path: "/api/player-auth/signup/begin" },
  { method: "POST", path: "/api/player-auth/signup/complete" },
  // Asked while a newcomer is typing their name, before any account exists.
  { method: "GET", path: "/api/player-auth/nickname-available" },
  // Recovery is for people who cannot sign in; a grant is the one thing they
  // do not have. The proof travels in the body instead.
  { method: "POST", path: "/api/player-auth/password/reset-request" },
  { method: "POST", path: "/api/player-auth/password/reset" },
];

export function isPlayerAuthPublicPath(method: string, pathname: string): boolean {
  return PLAYER_AUTH_PUBLIC.some((r) => r.method === method && r.path === pathname);
}

export type RequirePlayerAuthResult =
  | { response: Response; ctx: null }
  | { response: null; ctx: PlayerAuthContext };

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requirePlayerAuth(req: Request): Promise<RequirePlayerAuthResult> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();
  const ip = getClientIp(req);

  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin) {
      const resolved = resolveAllowedOrigin(origin);
      if (resolved === null) {
        logger.warn({ origin, path: pathname, ip }, "[PlayerAuth] Forbidden: Origin not in whitelist");
        return {
          response: new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
          ctx: null,
        };
      }
    }
  }

  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    logger.warn({ method, path: pathname, ip }, "[PlayerAuth] Unauthorized: no Bearer token");
    return { response: unauthorized(), ctx: null };
  }

  const result = await playerSessionService.verify(token);
  if (!result.ok) {
    logger.warn({ path: pathname, ip }, "[PlayerAuth] Unauthorized: invalid or revoked token");
    return { response: unauthorized(), ctx: null };
  }

  const user = await playerUserRepository.findById(result.playerUserId);
  if (!user) {
    logger.warn({ path: pathname, ip, playerUserId: result.playerUserId }, "[PlayerAuth] Unauthorized: player user not found");
    return { response: unauthorized(), ctx: null };
  }

  return {
    response: null,
    ctx: { playerUserId: user.id, playerId: user.playerId, jti: result.jti },
  };
}
