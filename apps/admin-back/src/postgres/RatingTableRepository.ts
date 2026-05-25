import { logger } from "../logger";
import type { RatingTable } from "../domain/RatingTable";
import { PostgresClient } from "./PostgresClient";

function rowToRatingTable(row: Record<string, unknown>): RatingTable {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    columnRangeStart: Number(row.column_range_start ?? 0),
    columnRangeStep: Number(row.column_range_step ?? 2),
    matrix: (row.matrix as (number | null)[][]) ?? [],
  };
}

export interface RatingTableRepository {
  /** Returns all rating tables ordered by id. */
  list(): Promise<RatingTable[]>;
  /** Returns a single rating table or null if not found. */
  findById(id: number): Promise<RatingTable | null>;
}

class RatingTableRepositoryImpl implements RatingTableRepository {
  async list(): Promise<RatingTable[]> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT id, name, column_range_start, column_range_step, matrix
         FROM rating_tables ORDER BY id`
      );
      return result.rows.map((row) => rowToRatingTable(row as Record<string, unknown>));
    } catch (err) {
      logger.info({ err }, "[Postgres] RatingTableRepository.list failed");
      return [];
    }
  }

  async findById(id: number): Promise<RatingTable | null> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT id, name, column_range_start, column_range_step, matrix
         FROM rating_tables WHERE id = $1`,
        [id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToRatingTable(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] RatingTableRepository.findById failed");
      return null;
    }
  }
}

export const ratingTableRepository: RatingTableRepository = new RatingTableRepositoryImpl();
