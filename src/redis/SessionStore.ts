import { logger } from "../logger";
import { RedisClient } from "./RedisClient";

const SESSION_TTL_SEC = 86400; // 24 hours
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutes

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function userSessionsKey(userId: number): string {
  return `user_sessions:${userId}`;
}

function rateLimitKey(ip: string): string {
  return `auth_attempts:${ip}`;
}

export interface SessionStore {
  /**
   * Creates a new session for the given user. Stores session:{id} → userId with TTL.
   * Also registers the session in user_sessions:{userId} set for bulk invalidation.
   * Returns the generated session ID.
   */
  create(userId: number): Promise<string>;

  /**
   * Looks up a session by ID. Returns userId or null if not found / expired.
   */
  get(sessionId: string): Promise<number | null>;

  /**
   * Refreshes TTL of an existing session (sliding expiry).
   */
  refresh(sessionId: string, userId: number): Promise<void>;

  /**
   * Deletes a single session.
   */
  delete(sessionId: string, userId: number): Promise<void>;

  /**
   * Deletes all sessions belonging to a user (e.g. after password change).
   */
  deleteAllByUser(userId: number): Promise<void>;

  /**
   * Increments login attempt counter for an IP. Returns current count.
   * Sets TTL on first attempt.
   */
  incrementLoginAttempts(ip: string): Promise<number>;

  /**
   * Returns current login attempt count for an IP. Returns 0 if not set.
   */
  getLoginAttempts(ip: string): Promise<number>;

  /**
   * Clears login attempt counter for an IP (on successful login).
   */
  clearLoginAttempts(ip: string): Promise<void>;

  /** Max allowed login attempts before rate limiting kicks in. */
  readonly maxAttempts: number;

  /** Rate limit window in seconds. */
  readonly windowSec: number;
}

class SessionStoreImpl implements SessionStore {
  readonly maxAttempts = RATE_LIMIT_MAX;
  readonly windowSec = RATE_LIMIT_WINDOW_SEC;

  async create(userId: number): Promise<string> {
    const sessionId = crypto.randomUUID();
    try {
      const redis = RedisClient.instance;
      await redis.set(sessionKey(sessionId), String(userId), "EX", SESSION_TTL_SEC);
      await redis.sadd(userSessionsKey(userId), sessionId);
      await redis.expire(userSessionsKey(userId), SESSION_TTL_SEC * 2);
    } catch (err) {
      logger.error({ err }, "[SessionStore] create failed");
    }
    return sessionId;
  }

  async get(sessionId: string): Promise<number | null> {
    try {
      const val = await RedisClient.instance.get(sessionKey(sessionId));
      if (!val) return null;
      const id = parseInt(val, 10);
      return Number.isNaN(id) ? null : id;
    } catch (err) {
      logger.error({ err }, "[SessionStore] get failed");
      return null;
    }
  }

  async refresh(sessionId: string, userId: number): Promise<void> {
    try {
      await RedisClient.instance.expire(sessionKey(sessionId), SESSION_TTL_SEC);
    } catch (err) {
      logger.error({ err, sessionId: sessionId.slice(0, 8), userId }, "[SessionStore] refresh failed");
    }
  }

  async delete(sessionId: string, userId: number): Promise<void> {
    try {
      const redis = RedisClient.instance;
      await redis.del(sessionKey(sessionId));
      await redis.srem(userSessionsKey(userId), sessionId);
    } catch (err) {
      logger.error({ err }, "[SessionStore] delete failed");
    }
  }

  async deleteAllByUser(userId: number): Promise<void> {
    try {
      const redis = RedisClient.instance;
      const sessionIds = await redis.smembers(userSessionsKey(userId));
      if (sessionIds.length > 0) {
        const keys = sessionIds.map(sessionKey);
        await redis.del(...keys);
      }
      await redis.del(userSessionsKey(userId));
    } catch (err) {
      logger.error({ err, userId }, "[SessionStore] deleteAllByUser failed");
    }
  }

  async incrementLoginAttempts(ip: string): Promise<number> {
    try {
      const redis = RedisClient.instance;
      const key = rateLimitKey(ip);
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
      }
      return count;
    } catch (err) {
      logger.error({ err, ip }, "[SessionStore] incrementLoginAttempts failed");
      return 0;
    }
  }

  async getLoginAttempts(ip: string): Promise<number> {
    try {
      const val = await RedisClient.instance.get(rateLimitKey(ip));
      if (!val) return 0;
      return parseInt(val, 10) || 0;
    } catch (err) {
      logger.error({ err, ip }, "[SessionStore] getLoginAttempts failed");
      return 0;
    }
  }

  async clearLoginAttempts(ip: string): Promise<void> {
    try {
      await RedisClient.instance.del(rateLimitKey(ip));
    } catch (err) {
      logger.error({ err, ip }, "[SessionStore] clearLoginAttempts failed");
    }
  }
}

export const sessionStore: SessionStore = new SessionStoreImpl();
