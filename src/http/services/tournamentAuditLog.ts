import { logger } from "../../logger";
import { tournamentAuditLogRepository } from "../../postgres";

/**
 * Persists an append-only tournament audit row (Postgres). Best-effort: logs on failure; does not throw.
 */
export async function writeTournamentAuditLog(
  tournamentId: string | number,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const id =
    typeof tournamentId === "number"
      ? tournamentId
      : parseInt(String(tournamentId), 10);
  if (Number.isNaN(id)) {
    logger.info({ tournamentId, eventType }, "[TournamentAudit] skip: invalid tournament id");
    return;
  }
  const ok = await tournamentAuditLogRepository.append({
    tournamentId: id,
    eventType,
    payload,
  });
  if (!ok) {
    logger.info({ tournamentId: id, eventType }, "[TournamentAudit] append failed (see Postgres log)");
  }
}
