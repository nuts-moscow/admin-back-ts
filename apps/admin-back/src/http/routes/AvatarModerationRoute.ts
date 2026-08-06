import type { BunRequest } from "bun";
import { logger } from "../../logger";
import { avatarModerationService } from "../services/AvatarModerationService";
import type { AuthContext } from "../middleware/auth";

type AdminRequest = Request & { authCtx?: AuthContext };

function adminOf(req: Request): AuthContext | null {
  return (req as AdminRequest).authCtx ?? null;
}

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * The queue an admin works. Everything here sits behind the admin auth
 * middleware by virtue of its path — these are not `/public/` and not
 * `/api/player/`, so the server has already established who is calling.
 */
export function avatarModerationRoutes() {
  return {
    "/api/avatar-moderation/queue": {
      GET: async (req: BunRequest<"/api/avatar-moderation/queue">) => {
        if (!adminOf(req)) return unauthorized();
        return Response.json({ queue: await avatarModerationService.queue() });
      },
    },

    /**
     * One verdict, on one picture. The body names the submission the admin was
     * looking at; if the player has replaced it since, the answer is `stale` and
     * nothing at all has happened.
     */
    "/api/avatar-moderation/verdict": {
      POST: async (req: BunRequest<"/api/avatar-moderation/verdict">) => {
        const admin = adminOf(req);
        if (!admin) return unauthorized();

        const body = (await req.json().catch(() => null)) as {
          playerId?: unknown;
          submissionId?: unknown;
          verdict?: unknown;
        } | null;

        const playerId = Number(body?.playerId);
        const submissionId = String(body?.submissionId ?? "");
        const verdict = body?.verdict;
        if (!Number.isInteger(playerId) || playerId < 1 || !submissionId) {
          return Response.json({ error: "Bad request" }, { status: 400 });
        }
        if (verdict !== "allow" && verdict !== "refuse") {
          return Response.json({ error: "Bad request" }, { status: 400 });
        }

        const outcome = await avatarModerationService.decide(
          admin.userId,
          playerId,
          submissionId,
          verdict
        );
        if (!outcome.ok) {
          logger.info({ playerId, submissionId }, "[AvatarModeration] stale verdict");
          return Response.json({ error: "stale" }, { status: 409 });
        }
        return Response.json({ ok: true, address: outcome.address });
      },
    },

    /** The waiting picture, to an admin. Same terms as to its author: authenticated, uncached. */
    "/api/avatar-moderation/pending/:playerId/image": {
      GET: async (
        req: BunRequest<"/api/avatar-moderation/pending/:playerId/image"> & {
          params: { playerId: string };
        }
      ) => {
        if (!adminOf(req)) return unauthorized();

        const playerId = parseInt(req.params.playerId, 10);
        if (Number.isNaN(playerId)) return Response.json({ error: "Bad request" }, { status: 400 });

        const submission = await avatarModerationService.pendingImage(playerId);
        if (!submission?.image) return Response.json({ error: "Not found" }, { status: 404 });

        return new Response(new Uint8Array(submission.image), {
          headers: {
            "Content-Type": submission.contentType,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  };
}
