import type { BunRequest } from "bun";
import {
  REQUIRED_LEGAL_DOCS,
  consentsSatisfyRequirements,
} from "../../domain/legalDocuments";
import { playerConsentRepository } from "../../postgres/PlayerConsentRepository";
import { playerRepository } from "../../postgres/PlayerRepository";
import { playerUserRepository } from "../../postgres/PlayerUserRepository";
import type { PlayerAuthContext } from "../middleware/playerAuth";
import { getClientIp } from "../services/AuthService";
import { playerLogin, playerLogout, playerRegister } from "../services/PlayerAuthService";

/** Parses the client-submitted list of accepted (slug, version) document pairs. */
function parseConsents(
  raw: unknown
): Array<{ slug: string; version: string }> | null {
  if (!Array.isArray(raw)) return null;
  const out: Array<{ slug: string; version: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { slug, version } = item as Record<string, unknown>;
    if (typeof slug !== "string" || typeof version !== "string") return null;
    out.push({ slug, version });
  }
  return out;
}

/** 3–32 chars: letters, digits, underscore or dot. */
const LOGIN_RE = /^[a-zA-Z0-9_.]{3,32}$/;

/** Password policy: "complex but not too much" — ≥8 chars with a letter and a digit. */
function passwordPolicyIssue(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return "Password must contain at least one letter and one digit";
  }
  return null;
}

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

    "/api/player-auth/register": {
      POST: async (req: BunRequest) => {
        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;

        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return jsonError("Invalid JSON", 400);
        }
        if (!body || typeof body !== "object") {
          return jsonError("Invalid body", 400);
        }

        const { login, password } = body as Record<string, unknown>;
        if (typeof login !== "string" || typeof password !== "string") {
          return jsonError("login and password are required", 400);
        }
        const normalizedLogin = login.trim();
        if (!LOGIN_RE.test(normalizedLogin)) {
          return jsonError(
            "Login must be 3-32 characters: letters, digits, underscore or dot",
            400
          );
        }
        const pwIssue = passwordPolicyIssue(password);
        if (pwIssue) return jsonError(pwIssue, 400);

        // Registration is gated on consent to the required legal documents.
        const consents = parseConsents((body as Record<string, unknown>).consents);
        if (!consents || !consentsSatisfyRequirements(consents)) {
          return jsonError(
            "Consent to the required documents is mandatory",
            400
          );
        }

        const ip = getClientIp(req);
        const result = await playerRegister(normalizedLogin, password, ip);

        if (!result.ok) {
          if (result.reason === "rate_limited") {
            return jsonError("Too many attempts. Please try again later.", 429, {
              "Retry-After": "900",
            });
          }
          if (result.reason === "login_taken") {
            return jsonError("Login already taken", 409);
          }
          return jsonError("Registration failed", 500);
        }

        // Record consent at the current required versions. Best-effort: the
        // account is already created, so a write failure is logged, not fatal.
        await playerConsentRepository.record(
          result.user.playerId,
          REQUIRED_LEGAL_DOCS,
          ip
        );

        return Response.json({
          token: result.token,
          player: {
            id: result.user.playerId,
            login: result.user.login,
            email: result.user.email,
            nickname: normalizedLogin,
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
