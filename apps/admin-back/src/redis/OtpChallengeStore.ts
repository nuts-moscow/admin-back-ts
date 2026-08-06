import { logger } from "../logger";
import { RedisClient } from "./RedisClient";

/**
 * What a code was minted for. A code proves one purpose and no other: a
 * signup code presented for a password reset is refused before its digits
 * are compared.
 */
export type OtpPurpose = "signup" | "password_reset";

/** How a letter carrying a code ended up. */
export type DeliveryState = "pending" | "taken" | "refused" | "bounced";

/**
 * One live challenge. `accountId` is resolved when the code is minted, not
 * when it is presented — the proof names the account it proves. A signup
 * challenge has no account yet and carries null.
 */
export interface OtpChallenge {
  purpose: OtpPurpose;
  address: string;
  accountId: number | null;
  codeHash: string;
  attemptsLeft: number;
  delivery: DeliveryState;
  deliveryDetail: string | null;
}

/** A code lives ten minutes; long enough to switch apps, short enough to matter. */
export const OTP_TTL_SEC = 600;

/** Wrong guesses allowed against one address and purpose within the window. */
export const OTP_MAX_ATTEMPTS = 5;

/** Codes a single address may be sent within the window. */
export const OTP_MAX_MINTS = 5;

/**
 * Attempts and mints are counted per address for a whole window, not per
 * challenge — asking for a fresh code must not buy a fresh budget.
 */
export const OTP_BUDGET_WINDOW_SEC = 3600;

/** Addresses are compared case-insensitively, as mailboxes are. */
function normalize(address: string): string {
  return address.trim().toLowerCase();
}

function challengeKey(address: string, purpose: OtpPurpose): string {
  return `otp_challenge:${purpose}:${normalize(address)}`;
}

function attemptsKey(address: string, purpose: OtpPurpose): string {
  return `otp_attempts:${purpose}:${normalize(address)}`;
}

function mintsKey(address: string, purpose: OtpPurpose): string {
  return `otp_mints:${purpose}:${normalize(address)}`;
}

export interface OtpChallengeStore {
  /**
   * Writes the challenge, replacing whatever was live for this address and
   * purpose — at most one code is alive at a time, and the newest retires
   * the rest.
   */
  put(challenge: OtpChallenge): Promise<void>;
  get(address: string, purpose: OtpPurpose): Promise<OtpChallenge | null>;
  drop(address: string, purpose: OtpPurpose): Promise<void>;

  /** Spends one attempt from the address's budget; answers what is left. */
  spendAttempt(address: string, purpose: OtpPurpose): Promise<number>;
  attemptsLeft(address: string, purpose: OtpPurpose): Promise<number>;

  /** Spends one mint from the address's budget; answers what is left. */
  spendMint(address: string, purpose: OtpPurpose): Promise<number>;
  /**
   * Gives one back. The budget exists to stop a mailbox being flooded, so a
   * mint that produced no letter must not count against it.
   */
  refundMint(address: string, purpose: OtpPurpose): Promise<void>;
  mintsLeft(address: string, purpose: OtpPurpose): Promise<number>;

  /** Records what became of the letter carrying this address's live code. */
  recordDelivery(
    address: string,
    purpose: OtpPurpose,
    state: DeliveryState,
    detail?: string
  ): Promise<void>;

  readonly maxAttempts: number;
  readonly maxMints: number;
}

class OtpChallengeStoreImpl implements OtpChallengeStore {
  readonly maxAttempts = OTP_MAX_ATTEMPTS;
  readonly maxMints = OTP_MAX_MINTS;

  async put(challenge: OtpChallenge): Promise<void> {
    const key = challengeKey(challenge.address, challenge.purpose);
    try {
      await RedisClient.instance.set(
        key,
        JSON.stringify({ ...challenge, address: normalize(challenge.address) }),
        "EX",
        OTP_TTL_SEC
      );
    } catch (err) {
      logger.error({ err, key }, "[OtpChallengeStore] put failed");
      throw err;
    }
  }

  async get(address: string, purpose: OtpPurpose): Promise<OtpChallenge | null> {
    try {
      const raw = await RedisClient.instance.get(challengeKey(address, purpose));
      if (raw == null) return null;
      return JSON.parse(raw) as OtpChallenge;
    } catch (err) {
      logger.error({ err, purpose }, "[OtpChallengeStore] get failed");
      return null;
    }
  }

  async drop(address: string, purpose: OtpPurpose): Promise<void> {
    try {
      await RedisClient.instance.del(challengeKey(address, purpose));
    } catch (err) {
      logger.error({ err, purpose }, "[OtpChallengeStore] drop failed");
    }
  }

  private async spend(key: string): Promise<number> {
    const redis = RedisClient.instance;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, OTP_BUDGET_WINDOW_SEC);
    }
    return count;
  }

  private async read(key: string): Promise<number> {
    const raw = await RedisClient.instance.get(key);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  async spendAttempt(address: string, purpose: OtpPurpose): Promise<number> {
    const used = await this.spend(attemptsKey(address, purpose));
    return Math.max(0, OTP_MAX_ATTEMPTS - used);
  }

  async attemptsLeft(address: string, purpose: OtpPurpose): Promise<number> {
    const used = await this.read(attemptsKey(address, purpose));
    return Math.max(0, OTP_MAX_ATTEMPTS - used);
  }

  async spendMint(address: string, purpose: OtpPurpose): Promise<number> {
    const used = await this.spend(mintsKey(address, purpose));
    return Math.max(0, OTP_MAX_MINTS - used);
  }

  async refundMint(address: string, purpose: OtpPurpose): Promise<void> {
    try {
      const key = mintsKey(address, purpose);
      // Never below zero: a refund for a mint that expired out of the window
      // would otherwise hand out free budget.
      const left = await RedisClient.instance.decr(key);
      if (left < 0) await RedisClient.instance.set(key, "0", "KEEPTTL");
    } catch (err) {
      logger.error({ err, purpose }, "[OtpChallengeStore] refundMint failed");
    }
  }

  async mintsLeft(address: string, purpose: OtpPurpose): Promise<number> {
    const used = await this.read(mintsKey(address, purpose));
    return Math.max(0, OTP_MAX_MINTS - used);
  }

  async recordDelivery(
    address: string,
    purpose: OtpPurpose,
    state: DeliveryState,
    detail?: string
  ): Promise<void> {
    const existing = await this.get(address, purpose);
    if (!existing) {
      // The challenge is gone — spent, expired, or replaced. The outcome is
      // still worth a log line: this is how a silent provider is noticed.
      logger.warn(
        { purpose, state, detail },
        "[OtpChallengeStore] delivery outcome for a challenge that no longer exists"
      );
      return;
    }
    await this.put({ ...existing, delivery: state, deliveryDetail: detail ?? null });
  }
}

export const otpChallengeStore: OtpChallengeStore = new OtpChallengeStoreImpl();
