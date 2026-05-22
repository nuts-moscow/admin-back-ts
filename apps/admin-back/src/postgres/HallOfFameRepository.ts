import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface HallOfFameRow {
  id: number;
  year: number;
  playerId: number | null;
  nickname: string;
  name: string | null;
  title: string;
  stat: string;
  position: number;
  createdAt: Date;
}

export interface HallOfFameCreateInput {
  year: number;
  playerId: number | null;
  nickname: string;
  name: string | null;
  title: string;
  stat: string;
  position: number;
}

export interface HallOfFameUpdateInput {
  year?: number;
  playerId?: number | null;
  nickname?: string;
  name?: string | null;
  title?: string;
  stat?: string;
  position?: number;
}

export interface HallOfFameRepository {
  list(): Promise<HallOfFameRow[]>;
  findById(id: number): Promise<HallOfFameRow | null>;
  create(input: HallOfFameCreateInput): Promise<HallOfFameRow | null>;
  update(id: number, input: HallOfFameUpdateInput): Promise<HallOfFameRow | null>;
  delete(id: number): Promise<boolean>;
}

function rowToHof(row: Record<string, unknown>): HallOfFameRow {
  return {
    id: Number(row.id),
    year: Number(row.year),
    playerId: row.player_id != null ? Number(row.player_id) : null,
    nickname: String(row.nickname),
    name: row.name != null ? String(row.name) : null,
    title: String(row.title),
    stat: String(row.stat),
    position: Number(row.position),
    createdAt:
      row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  };
}

class HallOfFameRepositoryImpl implements HallOfFameRepository {
  async list(): Promise<HallOfFameRow[]> {
    try {
      const res = await PostgresClient.instance.query(
        "SELECT id, year, player_id, nickname, name, title, stat, position, created_at FROM hall_of_fame ORDER BY year DESC, position ASC"
      );
      return res.rows.map((row) => rowToHof(row as Record<string, unknown>));
    } catch (err) {
      logger.error({ err }, "[HallOfFameRepository] list failed");
      return [];
    }
  }

  async findById(id: number): Promise<HallOfFameRow | null> {
    try {
      const res = await PostgresClient.instance.query(
        "SELECT id, year, player_id, nickname, name, title, stat, position, created_at FROM hall_of_fame WHERE id = $1",
        [id]
      );
      if (res.rows.length === 0) return null;
      return rowToHof(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err }, "[HallOfFameRepository] findById failed");
      return null;
    }
  }

  async create(input: HallOfFameCreateInput): Promise<HallOfFameRow | null> {
    try {
      const res = await PostgresClient.instance.query(
        `INSERT INTO hall_of_fame (year, player_id, nickname, name, title, stat, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, year, player_id, nickname, name, title, stat, position, created_at`,
        [input.year, input.playerId, input.nickname, input.name, input.title, input.stat, input.position]
      );
      if (res.rows.length === 0) return null;
      return rowToHof(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err }, "[HallOfFameRepository] create failed");
      return null;
    }
  }

  async update(id: number, input: HallOfFameUpdateInput): Promise<HallOfFameRow | null> {
    try {
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      const fields: Array<[keyof HallOfFameUpdateInput, string]> = [
        ["year", "year"],
        ["playerId", "player_id"],
        ["nickname", "nickname"],
        ["name", "name"],
        ["title", "title"],
        ["stat", "stat"],
        ["position", "position"],
      ];
      for (const [k, col] of fields) {
        if (input[k] !== undefined) {
          updates.push(`${col} = $${idx++}`);
          values.push(input[k]);
        }
      }
      if (updates.length === 0) return this.findById(id);
      values.push(id);
      const res = await PostgresClient.instance.query(
        `UPDATE hall_of_fame SET ${updates.join(", ")} WHERE id = $${idx}
         RETURNING id, year, player_id, nickname, name, title, stat, position, created_at`,
        values
      );
      if (res.rows.length === 0) return null;
      return rowToHof(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err }, "[HallOfFameRepository] update failed");
      return null;
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const res = await PostgresClient.instance.query(
        "DELETE FROM hall_of_fame WHERE id = $1",
        [id]
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error({ err }, "[HallOfFameRepository] delete failed");
      return false;
    }
  }
}

export const hallOfFameRepository: HallOfFameRepository = new HallOfFameRepositoryImpl();
