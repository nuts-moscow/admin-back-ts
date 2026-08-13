import { parseConsents } from "../../domain/legalDocuments";
import { nicknameRefusalMessage, weighNickname } from "../../domain/nicknameRule";
import type { BunRequest } from "bun";
import { playerRepository } from "../../postgres/PlayerRepository";
import { playerUserRepository } from "../../postgres/PlayerUserRepository";
import type { PlayerAuthContext } from "../middleware/playerAuth";
import { getClientIp } from "../services/AuthService";
import { playerLogin, playerLogout } from "../services/PlayerAuthService";
import { playerSignupService } from "../services/PlayerSignupService";

function jsonError(error: string, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

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

        // Identifier is a login (open-registration users) or an email (legacy).
        const { login, email, password } = body as Record<string, unknown>;
        const rawIdentifier =
          typeof login === "string" ? login : typeof email === "string" ? email : null;
        if (rawIdentifier == null || typeof password !== "string") {
          return jsonError("login and password are required", 400);
        }
        const identifier = rawIdentifier.trim();
        if (identifier.length === 0) {
          return jsonError("login and password are required", 400);
        }

        const ip = getClientIp(req);
        const result = await playerLogin(identifier, password, ip);

        if (!result.ok) {
          if (result.reason === "rate_limited") {
            return jsonError("Too many login attempts. Please try again later.", 429, {
              "Retry-After": "900",
            });
          }
          return jsonError("Invalid credentials", 401);
        }

        const player = await playerRepository.findById(String(result.user.playerId));
        return Response.json({
          token: result.token,
          player: {
            id: result.user.playerId,
            login: result.user.login,
            email: result.user.email,
            nickname: player?.nickname ?? "",
          },
        });
      },
    },

    "/api/player-auth/signup/begin": {
      POST: async (req: BunRequest) => {
        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;

        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return jsonError("Invalid JSON", 400);
        }
        if (!body || typeof body !== "object") return jsonError("Invalid body", 400);

        const { email, password } = body as Record<string, unknown>;
        if (typeof email !== "string" || typeof password !== "string") {
          return jsonError("email and password are required", 400);
        }

        const result = await playerSignupService.begin(email, password);
        if (result.ok) {
          // Nothing exists yet: the address is claimed, not registered.
          return new Response(null, { status: 202 });
        }
        if (result.reason === "taken") return jsonError("Email already registered", 409);
        if (result.reason === "weak_password") {
          return jsonError(
            "Password must be at least 8 characters and contain a letter and a digit",
            400
          );
        }
        if (result.reason === "undeliverable") {
          return jsonError("Could not deliver a code to this address", 502);
        }
        return jsonError("Too many attempts. Please try again later.", 429, {
          "Retry-After": "900",
        });
      },
    },

    /**
     * Advisory only: it tells a person typing a name whether it is free, so the
     * last screen of a signup is not where they first hear «нет». The write is
     * still the authority — a name free here can be lost in the seconds before
     * submitting, and that refusal costs no code.
     */
    "/api/player-auth/nickname-available": {
      GET: async (req: BunRequest) => {
        const proposed = new URL(req.url).searchParams.get("nickname") ?? "";
        const verdict = weighNickname(proposed);
        if (!verdict.ok) {
          return Response.json({
            available: false,
            error: nicknameRefusalMessage(verdict.reason),
          });
        }
        const taken = await playerRepository.findByFoldedNickname(verdict.nickname);
        return Response.json(
          taken
            ? { available: false, error: nicknameRefusalMessage("taken") }
            : { available: true }
        );
      },
    },

    "/api/player-auth/signup/complete": {
      POST: async (req: BunRequest) => {
        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;

        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return jsonError("Invalid JSON", 400);
        }
        if (!body || typeof body !== "object") return jsonError("Invalid body", 400);

        const { email, code, password, nickname } = body as Record<string, unknown>;
        if (
          typeof email !== "string" ||
          typeof code !== "string" ||
          typeof password !== "string"
        ) {
          return jsonError("email, code and password are required", 400);
        }
        // Required, with no default offered for acceptance: a person who does
        // not name themselves does not finish signing up.
        if (typeof nickname !== "string" || nickname.trim() === "") {
          return jsonError(nicknameRefusalMessage("empty"), 400);
        }

        const consents = parseConsents((body as Record<string, unknown>).consents);
        if (!consents) return jsonError("Consent to the required documents is mandatory", 400);

        const result = await playerSignupService.complete({
          address: email,
          code,
          nickname,
          password,
          consents,
          ip: getClientIp(req),
        });

        if (!result.ok) {
          switch (result.reason) {
            case "invalid_code":
              return jsonError("Invalid or expired code", 401);
            case "taken":
              return jsonError("Email already registered", 409);
            case "bad_nickname":
              return jsonError(
                nicknameRefusalMessage(result.nicknameReason ?? "empty"),
                400
              );
            case "nickname_taken":
              return jsonError(nicknameRefusalMessage("taken"), 409);
            case "consent_required":
              return jsonError("Consent to the required documents is mandatory", 400);
            case "weak_password":
              return jsonError(
                "Password must be at least 8 characters and contain a letter and a digit",
                400
              );
            default:
              return jsonError("Registration failed", 500);
          }
        }

        return Response.json({
          token: result.token,
          player: {
            id: result.playerId,
            login: null,
            email,
            nickname: result.nickname,
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
          login: user.login,
          email: user.email,
          nickname: player.nickname,
        });
      },
    },
  };
}
