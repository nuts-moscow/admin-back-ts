import type { BunRequest } from "bun";
import { consentsSatisfyRequirements } from "../../domain/legalDocuments";
import { nicknameRefusalMessage } from "../../domain/nicknameRule";
import type { TelegramPayload } from "../../domain/telegramPayload";
import { playerRepository } from "../../postgres/PlayerRepository";
import type { PlayerAuthContext } from "../middleware/playerAuth";
import { telegramAuthService, type Consent } from "../services/TelegramAuthService";

type PlayerAuthRequest = Request & { playerAuthCtx?: PlayerAuthContext };

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return null;
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The widget hands over a flat object of strings. Every field is part of what
 * was signed, so nothing is picked out here — the whole thing travels to the
 * check, which is the only place entitled to an opinion about it.
 */
function readPayload(raw: unknown): TelegramPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const out: TelegramPayload = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number") out[key] = String(value);
    else return null;
  }
  return out.hash ? out : null;
}

function parseConsents(raw: unknown): Consent[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Consent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { slug, version } = item as Record<string, unknown>;
    if (typeof slug !== "string" || typeof version !== "string") return null;
    out.push({ slug, version });
  }
  return consentsSatisfyRequirements(out) ? out : null;
}

function grant(result: { token: string; user: { id: number; playerId: number } }, nickname: string) {
  return Response.json({
    token: result.token,
    player: {
      id: result.user.playerId,
      login: null,
      email: null,
      nickname,
    },
  });
}

/**
 * The second door's three acts, and they are three routes for the same reason
 * they are three methods: signing in never creates, creating is never a side
 * effect, and binding is only reachable from inside a session.
 */
export function telegramAuthRoutes() {
  return {
    "/api/player-auth/telegram": {
      POST: async (req: BunRequest) => {
        const body = await readJson(req);
        const payload = readPayload(body?.payload ?? body);
        if (!payload) return jsonError("Invalid payload", 400);

        const result = await telegramAuthService.signIn(payload);
        if (result.ok) {
          const player = await playerRepository.findById(String(result.user.playerId));
          return grant(result, player?.nickname ?? "");
        }
        // 404 rather than 401: with no bot token this door is not configured,
        // and pretending it merely refused would send the club chasing a
        // signature problem that does not exist.
        if (result.reason === "disabled") return jsonError("Not found", 404);
        // The one answer this endpoint gives that the mail door has no analogue
        // for: proved, but nothing here is bound to it. It is not an error, and
        // the screen it drives is the whole reason it exists.
        if (result.reason === "unbound") {
          return new Response(JSON.stringify({ status: "unbound" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
        return jsonError("Invalid credentials", 401);
      },
    },

    "/api/player-auth/telegram/open": {
      POST: async (req: BunRequest) => {
        const body = await readJson(req);
        if (!body) return jsonError("Invalid body", 400);

        const payload = readPayload(body.payload);
        if (!payload) return jsonError("Invalid payload", 400);

        const nickname = body.nickname;
        if (typeof nickname !== "string" || nickname.trim() === "") {
          return jsonError(nicknameRefusalMessage("empty"), 400);
        }

        const consents = parseConsents(body.consents);
        if (!consents) return jsonError("Consent to the required documents is mandatory", 400);

        const result = await telegramAuthService.openAccount(payload, nickname, consents);
        if (result.ok) {
          const player = await playerRepository.findById(String(result.user.playerId));
          return grant(result, player?.nickname ?? nickname);
        }
        if (result.reason === "disabled") return jsonError("Not found", 404);
        if (result.reason === "not_proved") return jsonError("Invalid credentials", 401);
        // Covers both a Telegram already bound elsewhere and a nickname already
        // held: the index refused, and which index it was is not the caller's
        // business.
        if (result.reason === "taken") return jsonError("Already registered", 409);
        return jsonError("Registration failed", 500);
      },
    },

    "/api/player-auth/telegram/bind": {
      POST: async (req: BunRequest) => {
        const ctx = (req as PlayerAuthRequest).playerAuthCtx ?? null;
        if (!ctx) return jsonError("Unauthorized", 401);

        const body = await readJson(req);
        const payload = readPayload(body?.payload ?? body);
        if (!payload) return jsonError("Invalid payload", 400);

        // The account comes from the grant, never from the body: this is the
        // whole meaning of "installed from inside".
        const result = await telegramAuthService.bind(ctx.playerUserId, payload);
        if (result.ok) return new Response(null, { status: 204 });
        if (result.reason === "disabled") return jsonError("Not found", 404);
        if (result.reason === "not_proved") return jsonError("Invalid credentials", 401);
        if (result.reason === "taken") return jsonError("Already bound", 409);
        return jsonError("Could not bind", 500);
      },
      DELETE: async (req: BunRequest) => {
        const ctx = (req as PlayerAuthRequest).playerAuthCtx ?? null;
        if (!ctx) return jsonError("Unauthorized", 401);
        await telegramAuthService.unbind(ctx.playerUserId);
        return new Response(null, { status: 204 });
      },
    },
  };
}
