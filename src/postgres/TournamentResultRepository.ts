import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface TournamentResultPlayerRow {
  tournamentId: number;
  playerId: string;
  tournamentPlayerId: number;
  placement: number | null;
  status: string;
  entryPaymentMethod: string | null;
  reentryByPaymentMethod: string | null;
  totalReentryCount: number;
  bountyCount: number;
  bonuses: string | null;
  bountyKills: string | null;
  eliminatedBy: string | null;
}

export interface TournamentResultRepository {
  insertResults(
    tournamentId: number,
    rows: TournamentResultPlayerRow[]
  ): Promise<boolean>;
  findByTournamentId(
    tournamentId: number
  ): Promise<TournamentResultPlayerRow[]>;
}

function rowToResult(row: Record<string, unknown>): TournamentResultPlayerRow {
  return {
    tournamentId: Number(row.tournament_id),
    playerId: String(row.player_id ?? ""),
    tournamentPlayerId: Number(row.tournament_player_id ?? 0),
    placement: row.placement != null ? Number(row.placement) : null,
    status: String(row.status ?? ""),
    entryPaymentMethod:
      row.entry_payment_method != null
        ? String(row.entry_payment_method)
        : null,
    reentryByPaymentMethod:
      row.reentry_by_payment_method != null
        ? String(row.reentry_by_payment_method)
        : null,
    totalReentryCount: Number(row.total_reentry_count ?? 0),
    bountyCount: Number(row.bounty_count ?? 0),
    bonuses: row.bonuses != null ? String(row.bonuses) : null,
    bountyKills: row.bounty_kills != null ? String(row.bounty_kills) : null,
    eliminatedBy:
      row.eliminated_by != null ? String(row.eliminated_by) : null,
  };
}

class TournamentResultRepositoryImpl implements TournamentResultRepository {
  async insertResults(
    tournamentId: number,
    rows: TournamentResultPlayerRow[]
  ): Promise<boolean> {
    if (rows.length === 0) return true;
    try {
      for (const r of rows) {
        await PostgresClient.instance.query(
          `INSERT INTO tournament_result_players (
            tournament_id, player_id, tournament_player_id, placement, status,
            entry_payment_method, reentry_by_payment_method, total_reentry_count,
            bounty_count, bonuses, bounty_kills, eliminated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (tournament_id, player_id) DO UPDATE SET
            tournament_player_id = EXCLUDED.tournament_player_id,
            placement = EXCLUDED.placement,
            status = EXCLUDED.status,
            entry_payment_method = EXCLUDED.entry_payment_method,
            reentry_by_payment_method = EXCLUDED.reentry_by_payment_method,
            total_reentry_count = EXCLUDED.total_reentry_count,
            bounty_count = EXCLUDED.bounty_count,
            bonuses = EXCLUDED.bonuses,
            bounty_kills = EXCLUDED.bounty_kills,
            eliminated_by = EXCLUDED.eliminated_by`,
          [
            tournamentId,
            r.playerId,
            r.tournamentPlayerId,
            r.placement,
            r.status,
            r.entryPaymentMethod,
            r.reentryByPaymentMethod,
            r.totalReentryCount,
            r.bountyCount,
            r.bonuses,
            r.bountyKills,
            r.eliminatedBy,
          ]
        );
      }
      return true;
    } catch (err) {
      logger.info(
        { err, tournamentId, rowCount: rows.length },
        "[Postgres] TournamentResultRepository.insertResults failed"
      );
      return false;
    }
  }

  async findByTournamentId(
    tournamentId: number
  ): Promise<TournamentResultPlayerRow[]> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT tournament_id, player_id, tournament_player_id, placement, status,
                entry_payment_method, reentry_by_payment_method, total_reentry_count,
                bounty_count, bonuses, bounty_kills, eliminated_by
         FROM tournament_result_players
         WHERE tournament_id = $1
         ORDER BY placement ASC NULLS LAST, tournament_player_id ASC`,
        [tournamentId]
      );
      return result.rows.map((row) =>
        rowToResult(row as Record<string, unknown>)
      );
    } catch (err) {
      logger.info(
        { err, tournamentId },
        "[Postgres] TournamentResultRepository.findByTournamentId failed"
      );
      return [];
    }
  }
}

export const tournamentResultRepository: TournamentResultRepository =
  new TournamentResultRepositoryImpl();
