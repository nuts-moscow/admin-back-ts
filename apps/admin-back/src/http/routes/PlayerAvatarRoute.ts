import type { BunRequest } from "bun";
import { logger } from "../../logger";
import { avatarIntakeService } from "../services/AvatarIntakeService";
import { avatarModerationService } from "../services/AvatarModerationService";
import type { PlayerAuthContext } from "../middleware/playerAuth";

type PlayerRequest = Request & { playerAuthCtx?: PlayerAuthContext };

function ctxOf(req: Request): PlayerAuthContext | null {
  return (req as PlayerRequest).playerAuthCtx ?? null;
}

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * The player's own side of the avatar: hand a picture in, take your published
 * one down, and see where your submission stands.
 *
 * Note what is absent — there is no endpoint here that publishes anything. The
 * upload answers with a submission, never with an avatar.
 */
export function playerAvatarRoutes() {
  return {
    "/api/player/avatar": {
      POST: async (req: BunRequest<"/api/player/avatar">) => {
        const ctx = ctxOf(req);
        if (!ctx) return unauthorized();

        // The player id is the caller's, always. Anything in the body naming a
        // player is ignored rather than checked — there is no request shape that
        // could put a picture in someone else's queue.
        const form = await req.formData().catch(() => null);
        const file = form?.get("image");
        if (!(file instanceof File)) {
          return Response.json({ error: "Файл не приложен" }, { status: 400 });
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const outcome = await avatarIntakeService.upload(ctx.playerId, bytes);
        if (!outcome.ok) {
          logger.info(
            { playerId: ctx.playerId, status: outcome.status },
            "[PlayerAvatar] upload refused"
          );
          return Response.json({ error: outcome.error }, { status: outcome.status });
        }
        return Response.json({ submission: outcome.submission });
      },

      DELETE: async (req: BunRequest<"/api/player/avatar">) => {
        const ctx = ctxOf(req);
        if (!ctx) return unauthorized();
        await avatarIntakeService.removeOwn(ctx.playerId);
        return Response.json({ ok: true });
      },

      GET: async (req: BunRequest<"/api/player/avatar">) => {
        const ctx = ctxOf(req);
        if (!ctx) return unauthorized();
        return Response.json({
          submission: await avatarIntakeService.submissionState(ctx.playerId),
        });
      },
    },

    /**
     * The waiting picture, to the player who sent it. Authenticated on every
     * read and never cached: unlike a published avatar, nobody has yet agreed
     * that this image may be seen.
     */
    "/api/player/avatar/pending": {
      GET: async (req: BunRequest<"/api/player/avatar/pending">) => {
        const ctx = ctxOf(req);
        if (!ctx) return unauthorized();

        const submission = await avatarModerationService.pendingImage(ctx.playerId);
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
