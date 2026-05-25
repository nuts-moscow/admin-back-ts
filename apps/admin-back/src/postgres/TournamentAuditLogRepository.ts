import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface AppendTournamentAuditEventInput {
  tournamentId: number;
  eventType: string;
  /** Serializable JSON object (stored as JSONB). */
  payload: Record<string, unknown>;
}

export interface TournamentAuditLogRepository {
  /** Inserts one audit row. No updates/deletes. */
  append(input: AppendTournamentAuditEventInput): Promise<boolean>;
}

class TournamentAuditLogRepositoryImpl implements TournamentAuditLogRepository {
  async append(input: AppendTournamentAuditEventInput): Promise<boolean> {
    try {
      await PostgresClient.instance.query(
        `INSERT INTO tournament_audit_events (tournament_id, event_type, payload)
         VALUES ($1, $2, $3::jsonb)`,
        [input.tournamentId, input.eventType, JSON.stringify(input.payload)]
      );
      return true;
    } catch (err) {
      logger.info({ err, ...input }, "[Postgres] TournamentAuditLogRepository.append failed");
      return false;
    }
  }
}

export const tournamentAuditLogRepository: TournamentAuditLogRepository =
  new TournamentAuditLogRepositoryImpl();
