import type { BunRequest } from "bun";
import { playerRepository } from "../../postgres/PlayerRepository";
import { playerUserRepository } from "../../postgres/PlayerUserRepository";
import type { PlayerAuthContext } from "../middleware/playerAuth";
import { getClientIp } from "../services/AuthService";
import { playerLogin, playerLogout } from "../services/PlayerAuthService";

export type PlayerAuthRequest = Request & { playerAuthCtx?: PlayerAuthContext };

function getCtx(req: Request): PlayerAuthContext | null {
  return (req as PlayerAuthRequest).playerAuthCtx ?? null;
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

export function playerAuthRoutes() {
  return {
    "/api/player-auth/login": {
      POST: async (req: BunRequest) => {
        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;

        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (!body || typeof body !== "object") {
          return new Response(JSON.stringify({ error: "Invalid body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { email, password } = body as Record<string, unknown>;
        if (typeof email !== "string" || typeof password !== "string") {
          return new Response(
            JSON.stringify({ error: "email and password are required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return new Response(
            JSON.stringify({ error: "Invalid email format" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const ip = getClientIp(req);
        const result = await playerLogin(normalizedEmail, password, ip);

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
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const player = await playerRepository.findById(String(result.user.playerId));
        return Response.json({
          token: result.token,
          player: {
            id: result.user.playerId,
            email: result.user.email,
            nickname: player?.nickname ?? "",
          },
        });
      },
    },

    "/api/player-auth/logout": {
      POST: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const ip = getClientIp(req);
        await playerLogout(ctx.jti, ctx.playerUserId, ip);
        return new Response(null, { status: 204 });
      },
    },

    "/api/player-auth/me": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const user = await playerUserRepository.findById(ctx.playerUserId);
        const player = await playerRepository.findById(String(ctx.playerId));
        if (!user || !player) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({
          playerUserId: user.id,
          playerId: player.id,
          email: user.email,
          nickname: player.nickname,
        });
      },
    },
  };
}
