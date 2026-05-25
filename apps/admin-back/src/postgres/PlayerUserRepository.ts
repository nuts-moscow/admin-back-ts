import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface PlayerUser {
  id: number;
  email: string;
  passwordHash: string;
  playerId: number;
  createdAt: Date;
}

export interface PlayerUserRepository {
  findByEmail(email: string): Promise<PlayerUser | null>;
  findById(id: number): Promise<PlayerUser | null>;
  findByPlayerId(playerId: number): Promise<PlayerUser | null>;
  create(input: { email: string; passwordHash: string; playerId: number }): Promise<PlayerUser | null>;
  updatePassword(id: number, passwordHash: string): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}

function rowToPlayerUser(row: Record<string, unknown>): PlayerUser {
  return {
    id: Number(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    playerId: Number(row.player_id),
    createdAt:
      row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  };
}

class PlayerUserRepositoryImpl implements PlayerUserRepository {
  async findByEmail(email: string): Promise<PlayerUser | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT id, email, password_hash, player_id, created_at FROM player_users WHERE email = $1",
        [email]
      );
      if (result.rows.length === 0) return null;
      return rowToPlayerUser(result.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err }, "[PlayerUserRepository] findByEmail failed");
      return null;
    }
  }

  async findById(id: number): Promise<PlayerUser | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT id, email, password_hash, player_id, created_at FROM player_users WHERE id = $1",
        [id]
      );
      if (result.rows.length === 0) return null;
      return rowToPlayerUser(result.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err }, "[PlayerUserRepository] findById failed");
      return null;
    }
  }

  async findByPlayerId(playerId: number): Promise<PlayerUser | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT id, email, password_hash, player_id, created_at FROM player_users WHERE player_id = $1",
        [playerId]
      );
      if (result.rows.length === 0) return null;
      return rowToPlayerUser(result.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err }, "[PlayerUserRepository] findByPlayerId failed");
      return null;
    }
  }

  async create(input: {
    email: string;
    passwordHash: string;
    playerId: number;
  }): Promise<PlayerUser | null> {
    try {
      const result = await PostgresClient.instance.query(
        "INSERT INTO player_users (email, password_hash, player_id) VALUES ($1, $2, $3) RETURNING id, email, password_hash, player_id, created_at",
        [input.email, input.passwordHash, input.playerId]
      );
      if (result.rows.length === 0) return null;
      return rowToPlayerUser(result.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err }, "[PlayerUserRepository] create failed");
      return null;
    }
  }

  async updatePassword(id: number, passwordHash: string): Promise<boolean> {
    try {
      const result = await PostgresClient.instance.query(
        "UPDATE player_users SET password_hash = $1 WHERE id = $2",
        [passwordHash, id]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error({ err }, "[PlayerUserRepository] updatePassword failed");
      return false;
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const result = await PostgresClient.instance.query(
        "DELETE FROM player_users WHERE id = $1",
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error({ err }, "[PlayerUserRepository] delete failed");
      return false;
    }
  }
}

export const playerUserRepository: PlayerUserRepository = new PlayerUserRepositoryImpl();
