import { TournamentAuditEventType } from "../../domain/TournamentAuditEventType";
import { logger } from "../../logger";
import { playerAvatarRepository } from "../../postgres";
import { writeClubAuditLog } from "./tournamentAuditLog";

/**
 * The second look.
 *
 * A picture reaches the club's screens only because an admin allowed it, so
 * this is not a filter — it is how that admin, or another, changes their mind
 * when a complaint arrives a week later. No reason is asked for: a wrong face,
 * a competitor's logo or a targeted insult are things a person recognises and
 * does not have to justify in a form field.
 *
 * It touches the published store only. Taking an avatar down neither creates a
 * submission nor disturbs the queue.
 */
export class AvatarTakedownService {
  async remove(adminUserId: number, playerId: number): Promise<boolean> {
    const removed = await playerAvatarRepository.erase(playerId);
    if (removed) {
      await writeClubAuditLog(TournamentAuditEventType.AvatarTakenDown, {
        adminUserId,
        playerId,
      });
      logger?.info({ adminUserId, playerId }, "[AvatarTakedown] avatar removed");
    }
    return removed;
  }
}

export const avatarTakedownService = new AvatarTakedownService();
