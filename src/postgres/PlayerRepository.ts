import type { CreatePlayerInput, Player, UpdatePlayerInput } from "../domain/Player";
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
  /** Returns player by id, or null if not found */
  findById(playerId: string): Promise<Player | null>;
  /** Creates a new player and returns it, or null on error */
  create(input: CreatePlayerInput): Promise<Player | null>;
  /** Updates player fields by id. Only provided fields are updated. Returns updated player or null */
  update(playerId: string, input: UpdatePlayerInput): Promise<Player | null>;
  /** Applies delta to free_entry_count (clamp to >= 0). Returns new count or null. */
  updateFreeEntryCountByDelta(playerId: string, delta: number): Promise<number | null>;
  /** Applies delta to free_reentry_count (clamp to >= 0). Returns new count or null. */
  updateFreeReentryCountByDelta(playerId: string, delta: number): Promise<number | null>;
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
    freeEntryCount: Math.max(0, Number(row.free_entry_count ?? 0)),
    freeReentryCount: Math.max(0, Number(row.free_reentry_count ?? 0)),
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
        "SELECT id, nickname, name, phone, tg, notes, sing_agreement, free_entry_count, free_reentry_count, created_at FROM players WHERE LOWER(nickname) = LOWER($1)",
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
        `SELECT id, nickname, name, phone, tg, notes, sing_agreement, free_entry_count, free_reentry_count, created_at
         FROM players ORDER BY id ASC OFFSET $1 LIMIT $2`,
        [offset, limit]
      );
      return result.rows.map((row) => rowToPlayer(row as Record<string, unknown>));
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.list failed");
      return [];
    }
  }

  async findById(playerId: string): Promise<Player | null> {
    try {
      const id = parseInt(playerId, 10);
      if (Number.isNaN(id)) return null;
      const result = await PostgresClient.instance.query(
        "SELECT id, nickname, name, phone, tg, notes, sing_agreement, free_entry_count, free_reentry_count, created_at FROM players WHERE id = $1",
        [id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToPlayer(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.findById failed");
      return null;
    }
  }

  async create(input: CreatePlayerInput): Promise<Player | null> {
    try {
      const signAgreement = input.signAgreement ?? false;
      const result = await PostgresClient.instance.query(
        `INSERT INTO players (nickname, name, phone, tg, notes, sing_agreement, free_entry_count, free_reentry_count)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0)
         RETURNING id, nickname, name, phone, tg, notes, sing_agreement, free_entry_count, free_reentry_count, created_at`,
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

  async update(playerId: string, input: UpdatePlayerInput): Promise<Player | null> {
    try {
      const id = parseInt(playerId, 10);
      if (Number.isNaN(id)) return null;

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (input.nickname !== undefined) {
        updates.push(`nickname = $${paramIndex++}`);
        values.push(input.nickname.trim());
      }
      if (input.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(input.name);
      }
      if (input.phone !== undefined) {
        updates.push(`phone = $${paramIndex++}`);
        values.push(input.phone);
      }
      if (input.tg !== undefined) {
        updates.push(`tg = $${paramIndex++}`);
        values.push(input.tg);
      }
      if (input.notes !== undefined) {
        updates.push(`notes = $${paramIndex++}`);
        values.push(input.notes);
      }
      if (input.signAgreement !== undefined) {
        updates.push(`sing_agreement = $${paramIndex++}`);
        values.push(input.signAgreement);
      }

      if (updates.length === 0) {
        return this.findById(playerId);
      }

      values.push(id);
      const result = await PostgresClient.instance.query(
        `UPDATE players SET ${updates.join(", ")} WHERE id = $${paramIndex}
         RETURNING id, nickname, name, phone, tg, notes, sing_agreement, free_entry_count, free_reentry_count, created_at`,
        values
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToPlayer(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.update failed");
      return null;
    }
  }

  async updateFreeEntryCountByDelta(playerId: string, delta: number): Promise<number | null> {
    try {
      const id = parseInt(playerId, 10);
      if (Number.isNaN(id)) return null;
      const current = await PostgresClient.instance.query(
        "SELECT free_entry_count FROM players WHERE id = $1",
        [id]
      );
      const row = current.rows[0] as { free_entry_count: number } | undefined;
      if (!row) return null;
      const newCount = Math.max(0, Number(row.free_entry_count ?? 0) + delta);
      await PostgresClient.instance.query(
        "UPDATE players SET free_entry_count = $1 WHERE id = $2",
        [newCount, id]
      );
      return newCount;
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.updateFreeEntryCountByDelta failed");
      return null;
    }
  }

  async updateFreeReentryCountByDelta(playerId: string, delta: number): Promise<number | null> {
    try {
      const id = parseInt(playerId, 10);
      if (Number.isNaN(id)) return null;
      const current = await PostgresClient.instance.query(
        "SELECT free_reentry_count FROM players WHERE id = $1",
        [id]
      );
      const row = current.rows[0] as { free_reentry_count: number } | undefined;
      if (!row) return null;
      const newCount = Math.max(0, Number(row.free_reentry_count ?? 0) + delta);
      await PostgresClient.instance.query(
        "UPDATE players SET free_reentry_count = $1 WHERE id = $2",
        [newCount, id]
      );
      return newCount;
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.updateFreeReentryCountByDelta failed");
      return null;
    }
  }
}

export const playerRepository: PlayerRepository = new PlayerRepositoryImpl();
