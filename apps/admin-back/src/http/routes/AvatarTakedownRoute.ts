import type { BunRequest } from "bun";
import { avatarTakedownService } from "../services/AvatarTakedownService";
import type { AuthContext } from "../middleware/auth";

type AdminRequest = Request & { authCtx?: AuthContext };

/**
 * Admin removal of any player's published avatar. Separate from the queue on
 * purpose: the queue decides about what is waiting, this decides about what is
 * already being shown.
 */
export function avatarTakedownRoutes() {
  return {
    "/api/players/:id/avatar": {
      DELETE: async (
        req: BunRequest<"/api/players/:id/avatar"> & { params: { id: string } }
      ) => {
        const admin = (req as AdminRequest).authCtx ?? null;
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const playerId = parseInt(req.params.id, 10);
        if (Number.isNaN(playerId) || playerId < 1) {
          return Response.json({ error: "Bad request" }, { status: 400 });
        }

        const removed = await avatarTakedownService.remove(admin.userId, playerId);
        return Response.json({ ok: true, removed });
      },
    },
  };
}
