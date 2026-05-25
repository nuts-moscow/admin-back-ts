import { logger } from "../../logger";
import { resolveAllowedOrigin } from "../cors";
import {
  getBearerToken,
  getClientIp,
  verifyAccessToken,
} from "../services/AuthService";

const PUBLIC_EXACT_ROUTES: Array<{ method: string; path: string }> = [
  { method: "POST", path: "/api/auth/login" },
];

function isPublicRoute(method: string, pathname: string): boolean {
  if (PUBLIC_EXACT_ROUTES.some((r) => r.method === method && r.path === pathname)) return true;
  if (method === "GET" && pathname.startsWith("/public/")) return true;
  // Player auth subsystem owns its own routing — admin middleware never touches it.
  if (pathname.startsWith("/api/player-auth/") || pathname.startsWith("/api/player/")) return true;
  return false;
}

export interface AuthContext {
  userId: number;
  jti: string;
}

/**
 * Auth middleware. Returns a 401/403 Response if the request is not authorized,
 * or null to allow it through.
 *
 * Attach AuthContext to the request via requireAuth result for downstream use.
 */
export type RequireAuthResult =
  | { response: Response; ctx: null }
  | { response: null; ctx: AuthContext | null };

export async function requireAuth(req: Request): Promise<RequireAuthResult> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();
  const ip = getClientIp(req);

  if (isPublicRoute(method, pathname)) {
    return { response: null, ctx: null };
  }

  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin) {
      const resolved = resolveAllowedOrigin(origin);
      if (resolved === null) {
        logger.warn({ origin, path: pathname, ip }, "[Auth] Forbidden: Origin not in whitelist");
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
    logger.warn(
      { method, path: pathname, ip, hasAuthorization: req.headers.get("authorization") != null },
      "[Auth] Unauthorized: no Bearer token"
    );
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
      ctx: null,
    };
  }

  const result = await verifyAccessToken(token);
  if (!result.ok) {
    logger.warn({ path: pathname, ip }, "[Auth] Unauthorized: invalid or revoked token");
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
      ctx: null,
    };
  }

  return { response: null, ctx: { userId: result.userId, jti: result.jti } };
}
