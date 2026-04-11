import type { AdminUser } from "../domain/AdminUser";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface AdminUserRepository {
  /** Finds admin user by username (case-sensitive). Returns null if not found or on error. */
  findByUsername(username: string): Promise<AdminUser | null>;
  /** Returns total count of admin users. Returns 0 on error. */
  count(): Promise<number>;
  /** Creates a new admin user. Returns created user or null on error. */
  create(username: string, passwordHash: string): Promise<AdminUser | null>;
  /** Updates password hash for a user. Returns true on success. */
  updatePassword(userId: number, passwordHash: string): Promise<boolean>;
}

function rowToAdminUser(row: Record<string, unknown>): AdminUser {
  return {
    id: Number(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  };
}

class AdminUserRepositoryImpl implements AdminUserRepository {
  async findByUsername(username: string): Promise<AdminUser | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT id, username, password_hash, created_at FROM admin_users WHERE username = $1",
        [username]
      );
      if (result.rows.length === 0) return null;
      return rowToAdminUser(result.rows[0]);
    } catch (err) {
      logger.error({ err }, "[AdminUserRepository] findByUsername failed");
      return null;
    }
  }

  async count(): Promise<number> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT COUNT(*) AS cnt FROM admin_users"
      );
      return parseInt(String(result.rows[0]?.cnt ?? "0"), 10) || 0;
    } catch (err) {
      logger.error({ err }, "[AdminUserRepository] count failed");
      return 0;
    }
  }

  async create(username: string, passwordHash: string): Promise<AdminUser | null> {
    try {
      const result = await PostgresClient.instance.query(
        "INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) RETURNING id, username, password_hash, created_at",
        [username, passwordHash]
      );
      if (result.rows.length === 0) return null;
      return rowToAdminUser(result.rows[0]);
    } catch (err) {
      logger.error({ err }, "[AdminUserRepository] create failed");
      return null;
    }
  }

  async updatePassword(userId: number, passwordHash: string): Promise<boolean> {
    try {
      const result = await PostgresClient.instance.query(
        "UPDATE admin_users SET password_hash = $1 WHERE id = $2",
        [passwordHash, userId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error({ err }, "[AdminUserRepository] updatePassword failed");
      return false;
    }
  }
}

export const adminUserRepository: AdminUserRepository = new AdminUserRepositoryImpl();
