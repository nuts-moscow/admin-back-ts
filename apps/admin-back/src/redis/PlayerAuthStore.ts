import { logger } from "../logger";
import { RedisClient } from "./RedisClient";

const JWT_TTL_SEC = 86400; // 24 hours — must match player JWT exp

// Two budgets, aimed at different things. The club plays offline: a live
// tournament is twenty people behind one NAT, so the per-client bound is set
// well above what one person generates in an evening and exists to stop a
// spread of failures across many accounts. The per-identity bound is the one
// that actually slows a guesser — and it deliberately slows rather than locks,
// because an identity can be aimed at: knowing someone's address must not let
// you shut them out before a tournament.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutes
const CLIENT_RATE_LIMIT_MAX = 50;

function blocklistKey(jti: string): string {
  return `player_jwt_blocklist:${jti}`;
}

function userTokenVerKey(playerUserId: number): string {
  return `player_token_ver:${playerUserId}`;
}

function clientRateLimitKey(ip: string): string {
  return `player_auth_attempts:ip:${ip}`;
}

/** The account or address being attempted, lowercased — mailboxes ignore case. */
function identityRateLimitKey(identity: string): string {
  return `player_auth_attempts:id:${identity.trim().toLowerCase()}`;
}

export interface PlayerAuthStore {
  addToBlocklist(jti: string, ttlSec: number): Promise<void>;
  isBlocked(jti: string): Promise<boolean>;
  incrementUserTokenVersion(playerUserId: number): Promise<number>;
  getUserTokenVersion(playerUserId: number): Promise<number>;

  incrementLoginAttempts(ip: string): Promise<number>;
  getLoginAttempts(ip: string): Promise<number>;
  clearLoginAttempts(ip: string): Promise<void>;

  incrementIdentityAttempts(identity: string): Promise<number>;
  getIdentityAttempts(identity: string): Promise<number>;
  clearIdentityAttempts(identity: string): Promise<void>;

  /**
   * True when either attempt budget is spent. `identity` is the account or
   * address being attempted; omit it where the caller has none yet.
   */
  isRateLimited(ip: string, identity?: string | null): Promise<boolean>;

  readonly maxAttempts: number;
  readonly maxClientAttempts: number;
  readonly windowSec: number;
}

class PlayerAuthStoreImpl implements PlayerAuthStore {
  readonly maxAttempts = RATE_LIMIT_MAX;
  readonly maxClientAttempts = CLIENT_RATE_LIMIT_MAX;
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

  private async bump(key: string): Promise<number> {
    try {
      const redis = RedisClient.instance;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
      }
      return count;
    } catch (err) {
      logger.error({ err, key }, "[PlayerAuthStore] increment failed");
      return 0;
    }
  }

  private async read(key: string): Promise<number> {
    try {
      const val = await RedisClient.instance.get(key);
      if (!val) return 0;
      return parseInt(val, 10) || 0;
    } catch (err) {
      logger.error({ err, key }, "[PlayerAuthStore] read failed");
      return 0;
    }
  }

  incrementLoginAttempts(ip: string): Promise<number> {
    return this.bump(clientRateLimitKey(ip));
  }

  getLoginAttempts(ip: string): Promise<number> {
    return this.read(clientRateLimitKey(ip));
  }

  incrementIdentityAttempts(identity: string): Promise<number> {
    return this.bump(identityRateLimitKey(identity));
  }

  getIdentityAttempts(identity: string): Promise<number> {
    return this.read(identityRateLimitKey(identity));
  }

  async clearIdentityAttempts(identity: string): Promise<void> {
    try {
      await RedisClient.instance.del(identityRateLimitKey(identity));
    } catch (err) {
      logger.error({ err }, "[PlayerAuthStore] clearIdentityAttempts failed");
    }
  }

  async isRateLimited(ip: string, identity?: string | null): Promise<boolean> {
    if ((await this.getLoginAttempts(ip)) >= CLIENT_RATE_LIMIT_MAX) return true;
    if (identity && (await this.getIdentityAttempts(identity)) >= RATE_LIMIT_MAX) {
      return true;
    }
    return false;
  }

  async clearLoginAttempts(ip: string): Promise<void> {
    try {
      await RedisClient.instance.del(clientRateLimitKey(ip));
    } catch (err) {
      logger.error({ err, ip }, "[PlayerAuthStore] clearLoginAttempts failed");
    }
  }
}

export const playerAuthStore: PlayerAuthStore = new PlayerAuthStoreImpl();

/** Player JWT access token TTL in seconds. */
export const PLAYER_JWT_ACCESS_TTL_SEC = JWT_TTL_SEC;
