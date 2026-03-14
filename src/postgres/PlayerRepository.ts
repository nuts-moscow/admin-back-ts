import type { CreatePlayerInput, Player } from "../domain/Player";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface ListPlayersOptions {
  offset?: number;
  limit?: number;
}

export interface PlayerRepository {
  /** Returns nickname for player by id, or null if not found or on error */
  getNicknameById(playerId: string): Promise<string | null>;
  /** Returns player by nickname (case-insensitive), or null if not found */
  findByNickname(nickname: string): Promise<Player | null>;
  /** Lists players with optional offset/limit. Returns empty array on error */
  list(options?: ListPlayersOptions): Promise<Player[]>;
  /** Creates a new player and returns it, or null on error */
  create(input: CreatePlayerInput): Promise<Player | null>;
  /** Updates sign_agreement for player by id. Returns updated player or null */
  updateSignAgreement(playerId: string, signAgreement: boolean): Promise<Player | null>;
}

function rowToPlayer(row: Record<string, unknown>): Player {
  return {
    id: Number(row.id),
    nickname: String(row.nickname ?? ""),
    name: row.name != null ? String(row.name) : null,
    phone: row.phone != null ? String(row.phone) : null,
    tg: row.tg != null ? String(row.tg) : null,
    notes: row.notes != null ? String(row.notes) : null,
    signAgreement: row.sing_agreement === true,
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
        "SELECT id, nickname, name, phone, tg, notes, sing_agreement, created_at FROM players WHERE LOWER(nickname) = LOWER($1)",
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

  async list(options?: ListPlayersOptions): Promise<Player[]> {
    try {
      const offset = Math.max(0, options?.offset ?? 0);
      const limit = options?.limit != null ? Math.max(1, Math.min(1000, options.limit)) : 1000;
      const result = await PostgresClient.instance.query(
        `SELECT id, nickname, name, phone, tg, notes, sing_agreement, created_at
         FROM players ORDER BY id ASC OFFSET $1 LIMIT $2`,
        [offset, limit]
      );
      return result.rows.map((row) => rowToPlayer(row as Record<string, unknown>));
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.list failed");
      return [];
    }
  }

  async create(input: CreatePlayerInput): Promise<Player | null> {
    try {
      const signAgreement = input.signAgreement ?? false;
      const result = await PostgresClient.instance.query(
        `INSERT INTO players (nickname, name, phone, tg, notes, sing_agreement)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nickname, name, phone, tg, notes, sing_agreement, created_at`,
        [
          input.nickname,
          input.name ?? null,
          input.phone ?? null,
          input.tg ?? null,
          input.notes ?? null,
          signAgreement,
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

  async updateSignAgreement(
    playerId: string,
    signAgreement: boolean
  ): Promise<Player | null> {
    try {
      const id = parseInt(playerId, 10);
      if (Number.isNaN(id)) return null;
      const result = await PostgresClient.instance.query(
        `UPDATE players SET sing_agreement = $1 WHERE id = $2
         RETURNING id, nickname, name, phone, tg, notes, sing_agreement, created_at`,
        [signAgreement, id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToPlayer(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.updateSignAgreement failed");
      return null;
    }
  }
}

export const playerRepository: PlayerRepository = new PlayerRepositoryImpl();
