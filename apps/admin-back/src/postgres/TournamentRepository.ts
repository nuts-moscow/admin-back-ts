import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

const DEFAULT_RATING_GUARANTEE_BONUS_POINTS = 10;
const DEFAULT_RATING_TABLE_ID = 1;

export interface MakeTournamentInput {
  name: string;
  date: number;
  ratingGuaranteeEnabled?: boolean;
  ratingGuaranteeBonusPoints?: number;
  ratingPointsCoefficient?: number;
  ratingBountyCoefficient?: number;
  ratingTableId?: number;
  ratingEnabled?: boolean;
  ratingSeasonYear?: number | null;
  ratingSeasonMonth?: number | null;
  monthFinal?: boolean;
}

export interface TournamentRow {
  id: number;
  name: string;
  status: string;
  date: number;
  entryPrice: number;
  reentryPrice: number;
  ratingGuaranteeEnabled: boolean;
  ratingGuaranteeBonusPoints: number;
  ratingPointsCoefficient: number;
  ratingBountyCoefficient: number;
  ratingTableId: number;
  ratingEnabled: boolean;
  ratingSeasonYear: number | null;
  ratingSeasonMonth: number | null;
  lateRegistrationClosed: boolean;
  monthFinal: boolean;
}

/**
 * Pure selection for the season-final announcement: the nearest FUTURE
 * month-final tournament, ties broken by lower id so the result is stable
 * regardless of storage row order or how many are flagged. A tournament dated
 * exactly at `nowMs` counts as past. Returns null when none is still ahead.
 */
export function pickNearestFutureMonthFinal(
  rows: ReadonlyArray<{ id: number; date: number }>,
  nowMs: number
): { id: number; date: number } | null {
  const future = rows
    .filter((r) => r.date > nowMs)
    .sort((a, b) => a.date - b.date || a.id - b.id);
  const first = future[0];
  return first ? { id: first.id, date: first.date } : null;
}

const DEFAULT_STATUS = "registration_open";
const DEFAULT_ENTRY_PRICE = 1000;
const DEFAULT_REENTRY_PRICE = 1000;

function rowToTournament(row: Record<string, unknown>): TournamentRow {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    status: String(row.status ?? DEFAULT_STATUS),
    date: Number(row.date ?? 0),
    entryPrice: Number(row.entry_price ?? DEFAULT_ENTRY_PRICE),
    reentryPrice: Number(row.reentry_price ?? DEFAULT_REENTRY_PRICE),
    ratingGuaranteeEnabled: Boolean(row.rating_guarantee_enabled ?? false),
    ratingGuaranteeBonusPoints: Math.max(
      0,
      Number(row.rating_guarantee_bonus_points ?? DEFAULT_RATING_GUARANTEE_BONUS_POINTS)
    ),
    ratingPointsCoefficient: Number(row.rating_points_coefficient ?? 1),
    ratingBountyCoefficient: Number(row.rating_bounty_coefficient ?? 1),
    ratingTableId: Number(row.rating_table_id ?? DEFAULT_RATING_TABLE_ID),
    ratingEnabled: row.rating_enabled == null ? true : Boolean(row.rating_enabled),
    ratingSeasonYear: row.rating_season_year != null ? Number(row.rating_season_year) : null,
    ratingSeasonMonth: row.rating_season_month != null ? Number(row.rating_season_month) : null,
    lateRegistrationClosed: Boolean(row.late_registration_closed ?? false),
    monthFinal: Boolean(row.month_final ?? false),
  };
}

export interface ListTournamentsOptions {
  offset?: number;
  limit?: number;
}

export interface UpdateTournamentInput {
  name: string;
  date: number;
  status: string;
  ratingGuaranteeEnabled?: boolean | null;
  ratingGuaranteeBonusPoints?: number | null;
  ratingPointsCoefficient?: number | null;
  ratingBountyCoefficient?: number | null;
  ratingTableId?: number | null;
  ratingEnabled?: boolean | null;
}

const SELECT_COLUMNS = `
  id, name, status, date, entry_price, reentry_price,
  rating_guarantee_enabled, rating_guarantee_bonus_points,
  rating_points_coefficient, rating_bounty_coefficient,
  rating_table_id, rating_enabled, rating_season_year, rating_season_month,
  late_registration_closed, month_final
`;

export interface TournamentRepository {
  create(input: MakeTournamentInput): Promise<TournamentRow | null>;
  findById(id: number): Promise<TournamentRow | null>;
  list(options?: ListTournamentsOptions): Promise<TournamentRow[]>;
  /** Returns only registration_open and in_progress tournaments. */
  listActive(): Promise<
    Pick<TournamentRow, "id" | "name" | "status" | "date" | "lateRegistrationClosed">[]
  >;
  /** Numeric ids only; cheap for background clock tick. */
  listIdsByStatus(status: string): Promise<number[]>;
  update(id: number, input: UpdateTournamentInput): Promise<TournamentRow | null>;
  updateStatus(id: number, status: string): Promise<TournamentRow | null>;
  updateSeasonWithClient(
    client: import("pg").PoolClient,
    id: number,
    year: number | null,
    month: number | null
  ): Promise<TournamentRow | null>;
  updateLateRegistrationClosed(id: number, closed: boolean): Promise<TournamentRow | null>;
  /** Set the month-final flag on a tournament row. */
  updateMonthFinal(id: number, monthFinal: boolean): Promise<TournamentRow | null>;
  /**
   * The nearest future month-final tournament (date > nowMs), ties broken by
   * lower id — or null when none is still ahead. Feeds the season-final
   * announcement (AdminBack.SeasonFinal).
   */
  findFutureMonthFinal(nowMs: number): Promise<{ id: number; date: number } | null>;
  /** Persist a drop reason for a player removed from a tournament (upsert). */
  addDropNotice(tournamentId: number, playerId: string, reason: string): Promise<boolean>;
  /** Read the drop reason a player would see on next open, or null. */
  getDropNotice(tournamentId: number, playerId: string): Promise<string | null>;
}

class TournamentRepositoryImpl implements TournamentRepository {
  async create(input: MakeTournamentInput): Promise<TournamentRow | null> {
    try {
      const ratingGuaranteeEnabled = input.ratingGuaranteeEnabled ?? false;
      const ratingGuaranteeBonusPoints =
        input.ratingGuaranteeBonusPoints ?? DEFAULT_RATING_GUARANTEE_BONUS_POINTS;
      const ratingPointsCoefficient = input.ratingPointsCoefficient ?? 1;
      const ratingBountyCoefficient = input.ratingBountyCoefficient ?? 1;
      const ratingTableId = input.ratingTableId ?? DEFAULT_RATING_TABLE_ID;
      const ratingEnabled = input.ratingEnabled ?? true;
      const ratingSeasonYear = ratingEnabled ? (input.ratingSeasonYear ?? null) : null;
      const ratingSeasonMonth = ratingEnabled ? (input.ratingSeasonMonth ?? null) : null;
      const monthFinal = input.monthFinal ?? false;
      const result = await PostgresClient.instance.query(
        `INSERT INTO tournaments (
           name, status, date, entry_price, reentry_price,
           rating_guarantee_enabled, rating_guarantee_bonus_points,
           rating_points_coefficient, rating_bounty_coefficient,
           rating_table_id, rating_enabled, rating_season_year, rating_season_month,
           month_final
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ${SELECT_COLUMNS}`,
        [
          input.name,
          DEFAULT_STATUS,
          input.date,
          DEFAULT_ENTRY_PRICE,
          DEFAULT_REENTRY_PRICE,
          ratingGuaranteeEnabled,
          ratingGuaranteeBonusPoints,
          ratingPointsCoefficient,
          ratingBountyCoefficient,
          ratingTableId,
          ratingEnabled,
          ratingSeasonYear,
          ratingSeasonMonth,
          monthFinal,
        ]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.create failed");
      return null;
    }
  }

  async findById(id: number): Promise<TournamentRow | null> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT ${SELECT_COLUMNS} FROM tournaments WHERE id = $1`,
        [id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.findById failed");
      return null;
    }
  }

  async list(options?: ListTournamentsOptions): Promise<TournamentRow[]> {
    try {
      const offset = Math.max(0, options?.offset ?? 0);
      const limit = options?.limit != null ? Math.max(1, Math.min(1000, options.limit)) : 100;
      const result = await PostgresClient.instance.query(
        `SELECT ${SELECT_COLUMNS}
         FROM tournaments ORDER BY date ASC OFFSET $1 LIMIT $2`,
        [offset, limit]
      );
      return result.rows.map((row) => rowToTournament(row as Record<string, unknown>));
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.list failed");
      return [];
    }
  }

  async listActive(): Promise<
    Pick<TournamentRow, "id" | "name" | "status" | "date" | "lateRegistrationClosed">[]
  > {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT id, name, status, date, late_registration_closed
         FROM tournaments
         WHERE status IN ('registration_open', 'in_progress')
         ORDER BY date ASC`
      );
      return result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: Number(r.id),
          name: String(r.name ?? ""),
          status: String(r.status ?? DEFAULT_STATUS),
          date: Number(r.date ?? 0),
          lateRegistrationClosed: Boolean(r.late_registration_closed ?? false),
        };
      });
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.listActive failed");
      return [];
    }
  }

  async listIdsByStatus(status: string): Promise<number[]> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT id FROM tournaments WHERE status = $1 ORDER BY id",
        [status]
      );
      return result.rows.map((row) => Number((row as Record<string, unknown>).id));
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.listIdsByStatus failed");
      return [];
    }
  }

  async update(id: number, input: UpdateTournamentInput): Promise<TournamentRow | null> {
    try {
      const result = await PostgresClient.instance.query(
        `UPDATE tournaments SET
           name = $1,
           date = $2,
           status = $3,
           rating_guarantee_enabled = COALESCE($5, rating_guarantee_enabled),
           rating_guarantee_bonus_points = COALESCE($6, rating_guarantee_bonus_points),
           rating_points_coefficient = COALESCE($7, rating_points_coefficient),
           rating_bounty_coefficient = COALESCE($8, rating_bounty_coefficient),
           rating_table_id = COALESCE($9, rating_table_id),
           rating_enabled = COALESCE($10, rating_enabled)
         WHERE id = $4
         RETURNING ${SELECT_COLUMNS}`,
        [
          input.name,
          input.date,
          input.status,
          id,
          input.ratingGuaranteeEnabled ?? null,
          input.ratingGuaranteeBonusPoints ?? null,
          input.ratingPointsCoefficient ?? null,
          input.ratingBountyCoefficient ?? null,
          input.ratingTableId ?? null,
          input.ratingEnabled ?? null,
        ]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.update failed");
      return null;
    }
  }

  async updateSeasonWithClient(
    client: import("pg").PoolClient,
    id: number,
    year: number | null,
    month: number | null
  ): Promise<TournamentRow | null> {
    try {
      const result = await client.query(
        `UPDATE tournaments SET
           rating_season_year = $2,
           rating_season_month = $3
         WHERE id = $1
         RETURNING ${SELECT_COLUMNS}`,
        [id, year, month]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err, id }, "[Postgres] TournamentRepository.updateSeasonWithClient failed");
      return null;
    }
  }

  async updateStatus(id: number, status: string): Promise<TournamentRow | null> {
    try {
      const result = await PostgresClient.instance.query(
        `UPDATE tournaments SET status = $1 WHERE id = $2
         RETURNING ${SELECT_COLUMNS}`,
        [status, id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.updateStatus failed");
      return null;
    }
  }

  async updateLateRegistrationClosed(id: number, closed: boolean): Promise<TournamentRow | null> {
    try {
      const result = await PostgresClient.instance.query(
        `UPDATE tournaments SET late_registration_closed = $1 WHERE id = $2
         RETURNING ${SELECT_COLUMNS}`,
        [closed, id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err, id }, "[Postgres] TournamentRepository.updateLateRegistrationClosed failed");
      return null;
    }
  }

  async updateMonthFinal(id: number, monthFinal: boolean): Promise<TournamentRow | null> {
    try {
      const result = await PostgresClient.instance.query(
        `UPDATE tournaments SET month_final = $1 WHERE id = $2
         RETURNING ${SELECT_COLUMNS}`,
        [monthFinal, id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err, id }, "[Postgres] TournamentRepository.updateMonthFinal failed");
      return null;
    }
  }

  async findFutureMonthFinal(nowMs: number): Promise<{ id: number; date: number } | null> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT id, date FROM tournaments WHERE month_final = true`
      );
      const rows = result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return { id: Number(r.id), date: Number(r.date ?? 0) };
      });
      return pickNearestFutureMonthFinal(rows, nowMs);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.findFutureMonthFinal failed");
      return null;
    }
  }

  async addDropNotice(tournamentId: number, playerId: string, reason: string): Promise<boolean> {
    try {
      await PostgresClient.instance.query(
        `INSERT INTO tournament_drop_notice (tournament_id, player_id, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (tournament_id, player_id)
         DO UPDATE SET reason = EXCLUDED.reason, created_at = now()`,
        [tournamentId, playerId, reason]
      );
      return true;
    } catch (err) {
      logger.info(
        { err, tournamentId, playerId },
        "[Postgres] TournamentRepository.addDropNotice failed"
      );
      return false;
    }
  }

  async getDropNotice(tournamentId: number, playerId: string): Promise<string | null> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT reason FROM tournament_drop_notice
         WHERE tournament_id = $1 AND player_id = $2`,
        [tournamentId, playerId]
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? String(row.reason ?? "") : null;
    } catch (err) {
      logger.info(
        { err, tournamentId, playerId },
        "[Postgres] TournamentRepository.getDropNotice failed"
      );
      return null;
    }
  }
}

export const tournamentRepository: TournamentRepository =
  new TournamentRepositoryImpl();
