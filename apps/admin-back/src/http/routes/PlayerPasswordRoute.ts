import type { BunRequest } from "bun";
import type { PlayerAuthContext } from "../middleware/playerAuth";
import { passwordWriteService } from "../services/PasswordWriteService";

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

function weakPassword(): Response {
  return jsonError(
    "Password must be at least 8 characters and contain a letter and a digit",
    400
  );
}

/**
 * Password writes, split by which proof travels with them.
 *
 * The reset pair is public — a player who has forgotten their password has no
 * grant to present. The change endpoint is authenticated, but the session
 * only says who is asking: the current password is what authorises the write.
 */
export function playerPasswordRoutes() {
  return {
    "/api/player-auth/password/reset-request": {
      POST: async (req: BunRequest) => {
        const body = await readJson(req);
        const email = body?.email;
        if (typeof email !== "string" || email.trim().length === 0) {
          return jsonError("email is required", 400);
        }

        const result = await passwordWriteService.requestReset(email);
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: "Too many attempts. Please try again later." }),
            {
              status: 429,
              headers: { "Content-Type": "application/json", "Retry-After": "900" },
            }
          );
        }
        // Identical for a known and an unknown address: this endpoint does not
        // answer "is this person a member of the club".
        return new Response(null, { status: 204 });
      },
    },

    "/api/player-auth/password/reset": {
      POST: async (req: BunRequest) => {
        const body = await readJson(req);
        if (!body) return jsonError("Invalid body", 400);

        const { email, code, newPassword } = body;
        if (
          typeof email !== "string" ||
          typeof code !== "string" ||
          typeof newPassword !== "string"
        ) {
          return jsonError("email, code and newPassword are required", 400);
        }

        const result = await passwordWriteService.write(
          { kind: "mailbox_code", address: email, code },
          newPassword
        );
        if (result.ok) return new Response(null, { status: 204 });
        if (result.reason === "weak_password") return weakPassword();
        if (result.reason === "invalid_proof") return jsonError("Invalid credentials", 401);
        return jsonError("Could not change the password", 500);
      },
    },

    "/api/player-auth/password": {
      POST: async (req: BunRequest) => {
        const ctx = (req as PlayerAuthRequest).playerAuthCtx ?? null;
        if (!ctx) return jsonError("Unauthorized", 401);

        const body = await readJson(req);
        if (!body) return jsonError("Invalid body", 400);

        const { currentPassword, newPassword } = body;
        if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
          return jsonError("currentPassword and newPassword are required", 400);
        }

        const result = await passwordWriteService.write(
          {
            kind: "current_password",
            accountId: ctx.playerUserId,
            currentPassword,
          },
          newPassword
        );
        if (result.ok) {
          // Every grant is gone, the caller's included: sign in again.
          return new Response(null, { status: 204 });
        }
        if (result.reason === "weak_password") return weakPassword();
        if (result.reason === "invalid_proof") return jsonError("Invalid credentials", 401);
        return jsonError("Could not change the password", 500);
      },
    },
  };
}
