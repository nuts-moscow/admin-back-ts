import type { TournamentRatingBreakdown } from "../domain/TournamentRatingBreakdown";
import { isTournamentRatingBreakdown } from "../domain/TournamentRatingBreakdown";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

function parseRatingPersistedColumn(raw: unknown): TournamentRatingBreakdown | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    if (raw === "" || raw === "{}") return null;
    try {
      const o = JSON.parse(raw);
      return isTournamentRatingBreakdown(o) ? o : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && isTournamentRatingBreakdown(raw)) return raw;
  return null;
}

export interface TournamentResultPlayerRow {
  tournamentId: number;
  playerId: string;
  tournamentPlayerId: number;
  placement: number | null;
  status: string;
  entryPaymentMethod: string | null;
  entryPaidAmount: number | null;
  reentryByPaymentMethod: string | null;
  reentryPaymentLines: string | null;
  totalReentryCount: number;
  bountyCount: number;
  bonuses: string | null;
  customBonusChips: string | null;
  bountyKills: string | null;
  eliminatedBy: string | null;
  /** JSON array of { chips, source: "Rebuy"|"Out" } */
  burnedStackEvents: string;
  ratingManualAdjustment: number;
  /** Snapshot at tournament completion (manualAdjustment in object is always 0). */
  ratingPersisted: TournamentRatingBreakdown | null;
}

export interface TournamentResultRepository {
  insertResults(
    tournamentId: number,
    rows: TournamentResultPlayerRow[]
  ): Promise<boolean>;
  findByTournamentId(
    tournamentId: number
  ): Promise<TournamentResultPlayerRow[]>;
  updateRatingManualAdjustment(
    tournamentId: number,
    playerId: string,
    manualAdjustment: number
  ): Promise<boolean>;
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
    entryPaidAmount:
      row.entry_paid_amount != null && row.entry_paid_amount !== ""
        ? Number(row.entry_paid_amount)
        : null,
    reentryByPaymentMethod:
      row.reentry_by_payment_method != null
        ? String(row.reentry_by_payment_method)
        : null,
    reentryPaymentLines:
      row.reentry_payment_lines != null && String(row.reentry_payment_lines) !== ""
        ? String(row.reentry_payment_lines)
        : null,
    totalReentryCount: Number(row.total_reentry_count ?? 0),
    bountyCount: Number(row.bounty_count ?? 0),
    bonuses: row.bonuses != null ? String(row.bonuses) : null,
    customBonusChips:
      row.custom_bonus_chips != null ? String(row.custom_bonus_chips) : null,
    bountyKills: row.bounty_kills != null ? String(row.bounty_kills) : null,
    eliminatedBy:
      row.eliminated_by != null ? String(row.eliminated_by) : null,
    burnedStackEvents:
      row.burned_stack_events != null
        ? String(row.burned_stack_events)
        : "[]",
    ratingManualAdjustment: Number(row.rating_manual_adjustment ?? 0),
    ratingPersisted: parseRatingPersistedColumn(row.rating_persisted),
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
            entry_payment_method, entry_paid_amount, reentry_by_payment_method, reentry_payment_lines,
            total_reentry_count,
            bounty_count, bonuses, custom_bonus_chips, bounty_kills, eliminated_by,
            burned_stack_events,
            rating_manual_adjustment,
            rating_persisted
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
          ON CONFLICT (tournament_id, player_id) DO UPDATE SET
            tournament_player_id = EXCLUDED.tournament_player_id,
            placement = EXCLUDED.placement,
            status = EXCLUDED.status,
            entry_payment_method = EXCLUDED.entry_payment_method,
            entry_paid_amount = EXCLUDED.entry_paid_amount,
            reentry_by_payment_method = EXCLUDED.reentry_by_payment_method,
            reentry_payment_lines = EXCLUDED.reentry_payment_lines,
            total_reentry_count = EXCLUDED.total_reentry_count,
            bounty_count = EXCLUDED.bounty_count,
            bonuses = EXCLUDED.bonuses,
            custom_bonus_chips = EXCLUDED.custom_bonus_chips,
            bounty_kills = EXCLUDED.bounty_kills,
            eliminated_by = EXCLUDED.eliminated_by,
            burned_stack_events = EXCLUDED.burned_stack_events,
            rating_manual_adjustment = tournament_result_players.rating_manual_adjustment,
            rating_persisted = tournament_result_players.rating_persisted`,
          [
            tournamentId,
            r.playerId,
            r.tournamentPlayerId,
            r.placement,
            r.status,
            r.entryPaymentMethod,
            r.entryPaidAmount,
            r.reentryByPaymentMethod,
            r.reentryPaymentLines,
            r.totalReentryCount,
            r.bountyCount,
            r.bonuses,
            r.customBonusChips,
            r.bountyKills,
            r.eliminatedBy,
            r.burnedStackEvents,
            r.ratingManualAdjustment ?? 0,
            JSON.stringify(r.ratingPersisted ?? {}),
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
                entry_payment_method, entry_paid_amount, reentry_by_payment_method, reentry_payment_lines,
                total_reentry_count,
                bounty_count, bonuses, custom_bonus_chips, bounty_kills, eliminated_by,
                burned_stack_events,
                rating_manual_adjustment,
                rating_persisted
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

  async updateRatingManualAdjustment(
    tournamentId: number,
    playerId: string,
    manualAdjustment: number
  ): Promise<boolean> {
    try {
      const result = await PostgresClient.instance.query(
        `UPDATE tournament_result_players
         SET rating_manual_adjustment = $3
         WHERE tournament_id = $1 AND player_id = $2`,
        [tournamentId, playerId, manualAdjustment]
      );
      return result.rowCount != null && result.rowCount > 0;
    } catch (err) {
      logger.info(
        { err, tournamentId, playerId },
        "[Postgres] TournamentResultRepository.updateRatingManualAdjustment failed"
      );
      return false;
    }
  }
}

export const tournamentResultRepository: TournamentResultRepository =
  new TournamentResultRepositoryImpl();
