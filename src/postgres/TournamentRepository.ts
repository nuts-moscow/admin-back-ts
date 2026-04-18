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
}

const SELECT_COLUMNS = `
  id, name, status, date, entry_price, reentry_price,
  rating_guarantee_enabled, rating_guarantee_bonus_points,
  rating_points_coefficient, rating_bounty_coefficient,
  rating_table_id
`;

export interface TournamentRepository {
  create(input: MakeTournamentInput): Promise<TournamentRow | null>;
  findById(id: number): Promise<TournamentRow | null>;
  list(options?: ListTournamentsOptions): Promise<TournamentRow[]>;
  /** Returns only registration_open and in_progress tournaments. */
  listActive(): Promise<Pick<TournamentRow, "id" | "name" | "status" | "date">[]>;
  /** Numeric ids only; cheap for background clock tick. */
  listIdsByStatus(status: string): Promise<number[]>;
  update(id: number, input: UpdateTournamentInput): Promise<TournamentRow | null>;
  updateStatus(id: number, status: string): Promise<TournamentRow | null>;
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
      const result = await PostgresClient.instance.query(
        `INSERT INTO tournaments (
           name, status, date, entry_price, reentry_price,
           rating_guarantee_enabled, rating_guarantee_bonus_points,
           rating_points_coefficient, rating_bounty_coefficient,
           rating_table_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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

  async listActive(): Promise<Pick<TournamentRow, "id" | "name" | "status" | "date">[]> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT id, name, status, date
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
           rating_table_id = COALESCE($9, rating_table_id)
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
}

export const tournamentRepository: TournamentRepository =
  new TournamentRepositoryImpl();
