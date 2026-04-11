import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface MakeTournamentInput {
  name: string;
  date: number;
  ratingGuaranteeEnabled?: boolean;
  ratingPointsCoefficient?: number;
  ratingBountyCoefficient?: number;
}

export interface TournamentRow {
  id: number;
  name: string;
  status: string;
  date: number;
  entryPrice: number;
  reentryPrice: number;
  ratingGuaranteeEnabled: boolean;
  ratingPointsCoefficient: number;
  ratingBountyCoefficient: number;
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
    ratingPointsCoefficient: Number(row.rating_points_coefficient ?? 1),
    ratingBountyCoefficient: Number(row.rating_bounty_coefficient ?? 1),
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
  ratingPointsCoefficient?: number | null;
  ratingBountyCoefficient?: number | null;
}

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
      const ratingPointsCoefficient = input.ratingPointsCoefficient ?? 1;
      const ratingBountyCoefficient = input.ratingBountyCoefficient ?? 1;
      const result = await PostgresClient.instance.query(
        `INSERT INTO tournaments (
           name, status, date, entry_price, reentry_price,
           rating_guarantee_enabled, rating_points_coefficient, rating_bounty_coefficient
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, status, date, entry_price, reentry_price,
           rating_guarantee_enabled, rating_points_coefficient, rating_bounty_coefficient`,
        [
          input.name,
          DEFAULT_STATUS,
          input.date,
          DEFAULT_ENTRY_PRICE,
          DEFAULT_REENTRY_PRICE,
          ratingGuaranteeEnabled,
          ratingPointsCoefficient,
          ratingBountyCoefficient,
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
        `SELECT id, name, status, date, entry_price, reentry_price,
                rating_guarantee_enabled, rating_points_coefficient, rating_bounty_coefficient
         FROM tournaments WHERE id = $1`,
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
        `SELECT id, name, status, date, entry_price, reentry_price,
                rating_guarantee_enabled, rating_points_coefficient, rating_bounty_coefficient
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
           rating_points_coefficient = COALESCE($6, rating_points_coefficient),
           rating_bounty_coefficient = COALESCE($7, rating_bounty_coefficient)
         WHERE id = $4
         RETURNING id, name, status, date, entry_price, reentry_price,
           rating_guarantee_enabled, rating_points_coefficient, rating_bounty_coefficient`,
        [
          input.name,
          input.date,
          input.status,
          id,
          input.ratingGuaranteeEnabled ?? null,
          input.ratingPointsCoefficient ?? null,
          input.ratingBountyCoefficient ?? null,
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
         RETURNING id, name, status, date, entry_price, reentry_price,
           rating_guarantee_enabled, rating_points_coefficient, rating_bounty_coefficient`,
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
