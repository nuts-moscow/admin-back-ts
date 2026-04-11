import { ApplicationConfigs } from "../../configs";
import { logger } from "../../logger";
import {
  getClientIp,
  getSessionIdFromCookie,
  SESSION_COOKIE_NAME,
  verifySession,
} from "../services/AuthService";
import { sessionStore } from "../../redis/SessionStore";

const PUBLIC_ROUTES: Array<{ method: string; path: string }> = [
  { method: "POST", path: "/api/auth/login" },
  { method: "POST", path: "/api/auth/setup" },
];

function isPublicRoute(method: string, pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => r.method === method && r.path === pathname);
}

export interface AuthContext {
  userId: number;
  sessionId: string;
}

/**
 * Auth middleware. Returns a 401/403 Response if the request is not authorized,
 * or null to allow it through. Also performs sliding session refresh.
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

  // CSRF: for non-GET/HEAD requests with a cookie, verify Origin matches allowed origin
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin) {
      const allowedOrigin = ApplicationConfigs.instance.server.corsOrigin;
      if (allowedOrigin !== "*" && origin !== allowedOrigin) {
        logger.warn({ origin, allowedOrigin, path: pathname, ip }, "[Auth] Forbidden: Origin mismatch");
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

  const cookieHeader = req.headers.get("cookie");
  const sessionId = getSessionIdFromCookie(cookieHeader);

  if (!sessionId) {
    logger.warn({ path: pathname, ip }, "[Auth] Unauthorized: no session cookie");
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
      ctx: null,
    };
  }

  const result = await verifySession(sessionId);
  if (!result.ok) {
    logger.warn({ sessionId: sessionId.slice(0, 8), path: pathname, ip }, "[Auth] Unauthorized: invalid or expired session");
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
        },
      }),
      ctx: null,
    };
  }

  // Sliding session: reset TTL on every authenticated request
  await sessionStore.refresh(sessionId, result.userId);

  return { response: null, ctx: { userId: result.userId, sessionId } };
}
