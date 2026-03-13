import type { CreatePlayerInput, Player } from "../domain/Player";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface PlayerRepository {
  /** Returns nickname for player by id, or null if not found or on error */
  getNicknameById(playerId: string): Promise<string | null>;
  /** Returns player by nickname (case-insensitive), or null if not found */
  findByNickname(nickname: string): Promise<Player | null>;
  /** Creates a new player and returns it, or null on error */
  create(input: CreatePlayerInput): Promise<Player | null>;
}

function rowToPlayer(row: Record<string, unknown>): Player {
  return {
    id: Number(row.id),
    nickname: String(row.nickname ?? ""),
    name: row.name != null ? String(row.name) : null,
    phone: row.phone != null ? String(row.phone) : null,
    tg: row.tg != null ? String(row.tg) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  };
}

class PlayerRepositoryImpl implements PlayerRepository {
  async getNicknameById(playerId: string): Promise<string | null> {
    try {
      const id = parseInt(playerId, 10);
      if (Number.isNaN(id)) {
        return null;
      }
      const result = await PostgresClient.instance.query(
        "SELECT nickname FROM players WHERE id = $1",
        [id]
      );
      const row = result.rows[0] as { nickname: string } | undefined;
      return row?.nickname ?? null;
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.getNicknameById failed");
      return null;
    }
  }

  async findByNickname(nickname: string): Promise<Player | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT id, nickname, name, phone, tg, notes, created_at FROM players WHERE LOWER(nickname) = LOWER($1)",
        [nickname]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToPlayer(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.findByNickname failed");
      return null;
    }
  }

  async create(input: CreatePlayerInput): Promise<Player | null> {
    try {
      const result = await PostgresClient.instance.query(
        `INSERT INTO players (nickname, name, phone, tg, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, nickname, name, phone, tg, notes, created_at`,
        [
          input.nickname,
          input.name ?? null,
          input.phone ?? null,
          input.tg ?? null,
          input.notes ?? null,
        ]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToPlayer(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.create failed");
      return null;
    }
  }
}

export const playerRepository: PlayerRepository = new PlayerRepositoryImpl();
