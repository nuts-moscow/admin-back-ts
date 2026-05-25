import type { BunRequest } from "bun";
import { PostgresClient } from "../../postgres/PostgresClient";
import { adminUserRepository } from "../../postgres/AdminUserRepository";
import type { AuthContext } from "../middleware/auth";
import { changePassword, getClientIp, login, logout } from "../services/AuthService";

const MIN_PASSWORD_LENGTH = 8;

export type AuthRequest = Request & { authCtx?: AuthContext };

function getCtx(req: Request): AuthContext | null {
  return (req as AuthRequest).authCtx ?? null;
}

function requireJsonContentType(req: Request): Response | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return new Response(
      JSON.stringify({ error: "Content-Type must be application/json" }),
      { status: 415, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

async function getUsernameById(userId: number): Promise<string> {
  try {
    const result = await PostgresClient.instance.query(
      "SELECT username FROM admin_users WHERE id = $1",
      [userId]
    );
    return String(result.rows[0]?.username ?? userId);
  } catch {
    return String(userId);
  }
}

export function authRoutes() {
  return {
    "/api/auth/login": {
      POST: async (req: BunRequest) => {
        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;

        let body: unknown;
        try { body = await req.json(); } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        if (!body || typeof body !== "object") {
          return new Response(JSON.stringify({ error: "Invalid body" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const { username, password } = body as Record<string, unknown>;
        if (typeof username !== "string" || typeof password !== "string") {
          return new Response(JSON.stringify({ error: "username and password are required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const ip = getClientIp(req);
        const result = await login(username, password, ip);

        if (!result.ok) {
          if (result.reason === "rate_limited") {
            return new Response(
              JSON.stringify({ error: "Too many login attempts. Please try again later." }),
              {
                status: 429,
                headers: { "Content-Type": "application/json", "Retry-After": "900" },
              }
            );
          }
          return new Response(JSON.stringify({ error: "Invalid credentials" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json({
          username: result.user.username,
          token: result.token,
        });
      },
    },

    "/api/auth/logout": {
      POST: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const ip = getClientIp(req);
        const username = await getUsernameById(ctx.userId);
        await logout(ctx.jti, ctx.userId, username, ip);

        return new Response(null, { status: 204 });
      },
    },

    "/api/auth/me": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const username = await getUsernameById(ctx.userId);
        const user = await adminUserRepository.findByUsername(username);
        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404, headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json({ id: user.id, username: user.username });
      },
    },

    "/api/auth/change-password": {
      POST: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;

        let body: unknown;
        try { body = await req.json(); } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        if (!body || typeof body !== "object") {
          return new Response(JSON.stringify({ error: "Invalid body" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const { currentPassword, newPassword } = body as Record<string, unknown>;
        if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
          return new Response(
            JSON.stringify({ error: "currentPassword and newPassword are required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
          return new Response(
            JSON.stringify({ error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const ip = getClientIp(req);
        const username = await getUsernameById(ctx.userId);
        const result = await changePassword(ctx.userId, username, currentPassword, newPassword, ip);

        if (!result.ok) {
          if (result.reason === "invalid_current_password") {
            return new Response(JSON.stringify({ error: "Current password is incorrect" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ error: "Failed to change password" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(null, { status: 204 });
      },
    },
  };
}
