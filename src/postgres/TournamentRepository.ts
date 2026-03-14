import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface MakeTournamentInput {
  name: string;
  date: number;
}

export interface TournamentRow {
  id: number;
  name: string;
  status: string;
  date: number;
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
}

export interface TournamentRepository {
  create(input: MakeTournamentInput): Promise<TournamentRow | null>;
  findById(id: number): Promise<TournamentRow | null>;
  list(options?: ListTournamentsOptions): Promise<TournamentRow[]>;
  update(id: number, input: UpdateTournamentInput): Promise<TournamentRow | null>;
}

class TournamentRepositoryImpl implements TournamentRepository {
  async create(input: MakeTournamentInput): Promise<TournamentRow | null> {
    try {
      const result = await PostgresClient.instance.query(
        `INSERT INTO tournaments (name, status, date, entry_price, reentry_price)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, status, date, entry_price, reentry_price`,
        [
          input.name,
          DEFAULT_STATUS,
          input.date,
          DEFAULT_ENTRY_PRICE,
          DEFAULT_REENTRY_PRICE,
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
        "SELECT id, name, status, date, entry_price, reentry_price FROM tournaments WHERE id = $1",
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
        `SELECT id, name, status, date, entry_price, reentry_price
         FROM tournaments ORDER BY id ASC OFFSET $1 LIMIT $2`,
        [offset, limit]
      );
      return result.rows.map((row) => rowToTournament(row as Record<string, unknown>));
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.list failed");
      return [];
    }
  }

  async update(id: number, input: UpdateTournamentInput): Promise<TournamentRow | null> {
    try {
      const result = await PostgresClient.instance.query(
        `UPDATE tournaments SET name = $1, date = $2, status = $3 WHERE id = $4
         RETURNING id, name, status, date, entry_price, reentry_price`,
        [input.name, input.date, input.status, id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToTournament(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentRepository.update failed");
      return null;
    }
  }
}

export const tournamentRepository: TournamentRepository =
  new TournamentRepositoryImpl();
