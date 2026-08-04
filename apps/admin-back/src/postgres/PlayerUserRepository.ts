import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface PlayerUser {
  id: number;
  /** Unique username used for open-registration login; null for legacy email-only users. */
  login: string | null;
  /** Email login identifier; null for users who registered with a login. */
  email: string | null;
  passwordHash: string;
  playerId: number;
  createdAt: Date;
  /** When the address was proved by a code; null for rows that never were. */
  emailVerifiedAt: Date | null;
}

/**
 * The unique index on the address is the authority on who owns it, not the
 * application's pre-check — two signups racing on one address must leave one
 * account, and the loser has to know it lost rather than see a generic
 * failure.
 */
export type CreatePlayerUserResult =
  | { ok: true; user: PlayerUser }
  | { ok: false; reason: "taken" | "error" };

export interface PlayerUserRepository {
  findByLogin(login: string): Promise<PlayerUser | null>;
  findByEmail(email: string): Promise<PlayerUser | null>;
  findById(id: number): Promise<PlayerUser | null>;
  findByPlayerId(playerId: number): Promise<PlayerUser | null>;
  create(input: {
    login?: string | null;
    email?: string | null;
    passwordHash: string;
    playerId: number;
    emailVerifiedAt?: Date | null;
  }): Promise<PlayerUser | null>;
  /** Same insert, but says whether the unique index refused it. */
  tryCreate(input: {
    login?: string | null;
    email?: string | null;
    passwordHash: string;
    playerId: number;
    emailVerifiedAt?: Date | null;
  }): Promise<CreatePlayerUserResult>;
  updatePassword(id: number, passwordHash: string): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}

const COLUMNS =
  "id, login, email, password_hash, player_id, created_at, email_verified_at";

/** Postgres unique-violation; the address (or login) is already taken. */
const UNIQUE_VIOLATION = "23505";

function rowToPlayerUser(row: Record<string, unknown>): PlayerUser {
  return {
    id: Number(row.id),
    login: row.login == null ? null : String(row.login),
    email: row.email == null ? null : String(row.email),
    passwordHash: String(row.password_hash),
    playerId: Number(row.player_id),
    createdAt:
      row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    emailVerifiedAt:
      row.email_verified_at == null
        ? null
        : row.email_verified_at instanceof Date
          ? row.email_verified_at
          : new Date(String(row.email_verified_at)),
  };
}

class PlayerUserRepositoryImpl implements PlayerUserRepository {
  private async findOneBy(column: string, value: unknown): Promise<PlayerUser | null> {
    try {
      const result = await PostgresClient.instance.query(
        `SELECT ${COLUMNS} FROM player_users WHERE ${column} = $1`,
        [value]
      );
      if (result.rows.length === 0) return null;
      return rowToPlayerUser(result.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger.error({ err, column }, "[PlayerUserRepository] findOneBy failed");
      return null;
    }
  }

  findByLogin(login: string): Promise<PlayerUser | null> {
    return this.findOneBy("login", login.trim());
  }

  // citext makes the comparison case-insensitive; trimming is ours to do.
  findByEmail(email: string): Promise<PlayerUser | null> {
    return this.findOneBy("email", email.trim());
  }

  findById(id: number): Promise<PlayerUser | null> {
    return this.findOneBy("id", id);
  }

  findByPlayerId(playerId: number): Promise<PlayerUser | null> {
    return this.findOneBy("player_id", playerId);
  }

  async create(input: {
    login?: string | null;
    email?: string | null;
    passwordHash: string;
    playerId: number;
    emailVerifiedAt?: Date | null;
  }): Promise<PlayerUser | null> {
    const result = await this.tryCreate(input);
    return result.ok ? result.user : null;
  }

  async tryCreate(input: {
    login?: string | null;
    email?: string | null;
    passwordHash: string;
    playerId: number;
    emailVerifiedAt?: Date | null;
  }): Promise<CreatePlayerUserResult> {
    try {
      const result = await PostgresClient.instance.query(
        `INSERT INTO player_users (login, email, password_hash, player_id, email_verified_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [
          input.login ?? null,
          input.email?.trim() ?? null,
          input.passwordHash,
          input.playerId,
          input.emailVerifiedAt ?? null,
        ]
      );
      if (result.rows.length === 0) return { ok: false, reason: "error" };
      return { ok: true, user: rowToPlayerUser(result.rows[0] as Record<string, unknown>) };
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        return { ok: false, reason: "taken" };
      }
      logger.error({ err }, "[PlayerUserRepository] create failed");
      return { ok: false, reason: "error" };
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
