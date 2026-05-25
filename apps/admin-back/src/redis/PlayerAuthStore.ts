import { logger } from "../logger";
import { RedisClient } from "./RedisClient";

const JWT_TTL_SEC = 86400; // 24 hours — must match player JWT exp
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutes

function blocklistKey(jti: string): string {
  return `player_jwt_blocklist:${jti}`;
}

function userTokenVerKey(playerUserId: number): string {
  return `player_token_ver:${playerUserId}`;
}

function rateLimitKey(ip: string): string {
  return `player_auth_attempts:${ip}`;
}

export interface PlayerAuthStore {
  addToBlocklist(jti: string, ttlSec: number): Promise<void>;
  isBlocked(jti: string): Promise<boolean>;
  incrementUserTokenVersion(playerUserId: number): Promise<number>;
  getUserTokenVersion(playerUserId: number): Promise<number>;

  incrementLoginAttempts(ip: string): Promise<number>;
  getLoginAttempts(ip: string): Promise<number>;
  clearLoginAttempts(ip: string): Promise<void>;
  readonly maxAttempts: number;
  readonly windowSec: number;
}

class PlayerAuthStoreImpl implements PlayerAuthStore {
  readonly maxAttempts = RATE_LIMIT_MAX;
  readonly windowSec = RATE_LIMIT_WINDOW_SEC;

  async addToBlocklist(jti: string, ttlSec: number): Promise<void> {
    try {
      await RedisClient.instance.set(blocklistKey(jti), "1", "EX", ttlSec);
    } catch (err) {
      logger.error({ err, jti: jti.slice(0, 8) }, "[PlayerAuthStore] addToBlocklist failed");
    }
  }

  async isBlocked(jti: string): Promise<boolean> {
    try {
      const v = await RedisClient.instance.get(blocklistKey(jti));
      return v != null;
    } catch (err) {
      logger.error({ err, jti: jti.slice(0, 8) }, "[PlayerAuthStore] isBlocked failed");
      return false;
    }
  }

  async incrementUserTokenVersion(playerUserId: number): Promise<number> {
    try {
      return await RedisClient.instance.incr(userTokenVerKey(playerUserId));
    } catch (err) {
      logger.error({ err, playerUserId }, "[PlayerAuthStore] incrementUserTokenVersion failed");
      return 0;
    }
  }

  async getUserTokenVersion(playerUserId: number): Promise<number> {
    try {
      const v = await RedisClient.instance.get(userTokenVerKey(playerUserId));
      if (v == null) return 0;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 0 : n;
    } catch (err) {
      logger.error({ err, playerUserId }, "[PlayerAuthStore] getUserTokenVersion failed");
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
      logger.error({ err, ip }, "[PlayerAuthStore] incrementLoginAttempts failed");
      return 0;
    }
  }

  async getLoginAttempts(ip: string): Promise<number> {
    try {
      const val = await RedisClient.instance.get(rateLimitKey(ip));
      if (!val) return 0;
      return parseInt(val, 10) || 0;
    } catch (err) {
      logger.error({ err, ip }, "[PlayerAuthStore] getLoginAttempts failed");
      return 0;
    }
  }

  async clearLoginAttempts(ip: string): Promise<void> {
    try {
      await RedisClient.instance.del(rateLimitKey(ip));
    } catch (err) {
      logger.error({ err, ip }, "[PlayerAuthStore] clearLoginAttempts failed");
    }
  }
}

export const playerAuthStore: PlayerAuthStore = new PlayerAuthStoreImpl();

/** Player JWT access token TTL in seconds. */
export const PLAYER_JWT_ACCESS_TTL_SEC = JWT_TTL_SEC;
