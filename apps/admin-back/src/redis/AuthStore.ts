import { logger } from "../logger";
import { RedisClient } from "./RedisClient";

const JWT_TTL_SEC = 86400; // 24 hours — must match JWT exp
// Counted per client address, and the club plays offline: at a live tournament
// the judges' laptops sit behind the same NAT as everyone else, so five
// failures locked the whole desk out of the panel at the moment it was needed.
// The bound is set well above what one evening of fumbled passwords generates
// across a room. It is a coarse contour, not the defence — a per-identity
// budget like the players' one is still missing here.
const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutes

function blocklistKey(jti: string): string {
  return `jwt_blocklist:${jti}`;
}

function userTokenVerKey(userId: number): string {
  return `user_token_ver:${userId}`;
}

function rateLimitKey(ip: string): string {
  return `auth_attempts:${ip}`;
}

export interface AuthStore {
  addToBlocklist(jti: string, ttlSec: number): Promise<void>;
  isBlocked(jti: string): Promise<boolean>;
  incrementUserTokenVersion(userId: number): Promise<number>;
  getUserTokenVersion(userId: number): Promise<number>;

  incrementLoginAttempts(ip: string): Promise<number>;
  getLoginAttempts(ip: string): Promise<number>;
  clearLoginAttempts(ip: string): Promise<void>;
  readonly maxAttempts: number;
  readonly windowSec: number;
}

class AuthStoreImpl implements AuthStore {
  readonly maxAttempts = RATE_LIMIT_MAX;
  readonly windowSec = RATE_LIMIT_WINDOW_SEC;

  async addToBlocklist(jti: string, ttlSec: number): Promise<void> {
    try {
      await RedisClient.instance.set(blocklistKey(jti), "1", "EX", ttlSec);
    } catch (err) {
      logger.error({ err, jti: jti.slice(0, 8) }, "[AuthStore] addToBlocklist failed");
    }
  }

  async isBlocked(jti: string): Promise<boolean> {
    try {
      const v = await RedisClient.instance.get(blocklistKey(jti));
      return v != null;
    } catch (err) {
      logger.error({ err, jti: jti.slice(0, 8) }, "[AuthStore] isBlocked failed");
      return false;
    }
  }

  async incrementUserTokenVersion(userId: number): Promise<number> {
    try {
      const n = await RedisClient.instance.incr(userTokenVerKey(userId));
      return n;
    } catch (err) {
      logger.error({ err, userId }, "[AuthStore] incrementUserTokenVersion failed");
      return 0;
    }
  }

  async getUserTokenVersion(userId: number): Promise<number> {
    try {
      const v = await RedisClient.instance.get(userTokenVerKey(userId));
      if (v == null) return 0;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 0 : n;
    } catch (err) {
      logger.error({ err, userId }, "[AuthStore] getUserTokenVersion failed");
      return 0;
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
      logger.error({ err, ip }, "[AuthStore] incrementLoginAttempts failed");
      return 0;
    }
  }

  async getLoginAttempts(ip: string): Promise<number> {
    try {
      const val = await RedisClient.instance.get(rateLimitKey(ip));
      if (!val) return 0;
      return parseInt(val, 10) || 0;
    } catch (err) {
      logger.error({ err, ip }, "[AuthStore] getLoginAttempts failed");
      return 0;
    }
  }

  async clearLoginAttempts(ip: string): Promise<void> {
    try {
      await RedisClient.instance.del(rateLimitKey(ip));
    } catch (err) {
      logger.error({ err, ip }, "[AuthStore] clearLoginAttempts failed");
    }
  }
}

export const authStore: AuthStore = new AuthStoreImpl();

/** JWT access token TTL in seconds (aligned with AuthStore blocklist max TTL). */
export const JWT_ACCESS_TTL_SEC = JWT_TTL_SEC;
