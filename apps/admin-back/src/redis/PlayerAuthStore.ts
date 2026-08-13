import { logger } from "../logger";
import { RedisClient } from "./RedisClient";

const JWT_TTL_SEC = 86400; // 24 hours — must match player JWT exp

// One budget, aimed at the identity being attempted. The club plays offline:
// a live tournament is twenty people behind one NAT, so a budget counted per
// client address is counted on a random variable — the room shared the old
// per-client bound of fifty and spent it at two and a half fumbles a head,
// which is the same outage the per-identity counter was added to prevent, only
// later and harder to see in a log. What is left deliberately slows rather
// than locks, because an identity can be aimed at: knowing someone's address
// must not let you shut them out before a tournament.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutes

function blocklistKey(jti: string): string {
  return `player_jwt_blocklist:${jti}`;
}

function userTokenVerKey(playerUserId: number): string {
  return `player_token_ver:${playerUserId}`;
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

  /** Spends one attempt against this identity; answers how many are now spent. */
  incrementIdentityAttempts(identity: string): Promise<number>;
  /** How many failures this identity has already spent inside the window. */
  getIdentityAttempts(identity: string): Promise<number>;
  clearIdentityAttempts(identity: string): Promise<void>;

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

  // Redis keys carry the identity being attempted — a mailbox — so they never
  // reach a log line. A failure to count is reported by what it was counting.
  private async bump(key: string): Promise<number> {
    try {
      const redis = RedisClient.instance;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
      }
      return count;
    } catch (err) {
      logger.error({ err, counter: "identity" }, "[PlayerAuthStore] increment failed");
      return 0;
    }
  }

  private async read(key: string): Promise<number> {
    try {
      const val = await RedisClient.instance.get(key);
      if (!val) return 0;
      return parseInt(val, 10) || 0;
    } catch (err) {
      logger.error({ err, counter: "identity" }, "[PlayerAuthStore] read failed");
      return 0;
    }
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
      logger.error({ err, counter: "identity" }, "[PlayerAuthStore] clear failed");
    }
  }
}

export const playerAuthStore: PlayerAuthStore = new PlayerAuthStoreImpl();

/** Player JWT access token TTL in seconds. */
export const PLAYER_JWT_ACCESS_TTL_SEC = JWT_TTL_SEC;
