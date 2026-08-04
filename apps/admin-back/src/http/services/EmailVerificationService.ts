import { generateOtpCode, renderOtpLetter } from "../../domain/otp";
// `logger` is initialised at app startup; unit tests construct these
// services directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import { mailClient } from "../../mail/MailClient";
import type { DeliveryOutcome, OtpLetter } from "../../mail/MailClient";
import { playerUserRepository } from "../../postgres/PlayerUserRepository";
import {
  type DeliveryState,
  type OtpChallenge,
  type OtpPurpose,
  otpChallengeStore,
} from "../../redis/OtpChallengeStore";

/**
 * The answer about one presented code. An acceptance names the account it
 * proves — a caller must never derive the target from the request body.
 */
export type OtpVerdict =
  | { status: "accepted"; accountId: number | null }
  | { status: "wrong" }
  | { status: "expired" }
  | { status: "exhausted" };

/**
 * Whether a code was minted. Deliberately says nothing about whether an
 * account exists behind the address: the caller answers identically either
 * way, and only `rate_limited` is distinguishable, because a caller hitting
 * their own budget has a right to know.
 */
export type IssueResult = { ok: true } | { ok: false; reason: "rate_limited" };

export interface ChallengeStore {
  put(challenge: OtpChallenge): Promise<void>;
  get(address: string, purpose: OtpPurpose): Promise<OtpChallenge | null>;
  drop(address: string, purpose: OtpPurpose): Promise<void>;
  spendAttempt(address: string, purpose: OtpPurpose): Promise<number>;
  attemptsLeft(address: string, purpose: OtpPurpose): Promise<number>;
  spendMint(address: string, purpose: OtpPurpose): Promise<number>;
  mintsLeft(address: string, purpose: OtpPurpose): Promise<number>;
  recordDelivery(
    address: string,
    purpose: OtpPurpose,
    state: DeliveryState,
    detail?: string
  ): Promise<void>;
  readonly maxAttempts: number;
}

export interface Mailer {
  send(letter: OtpLetter): Promise<DeliveryOutcome>;
}

/** Resolves an address to the account that owns it, if any. */
export interface AccountLookup {
  findAccountIdByEmail(address: string): Promise<number | null>;
}

/** Hashing is injected so tests need neither Redis nor a real KDF. */
export interface CodeHasher {
  hash(code: string): Promise<string>;
  verify(code: string, hash: string): Promise<boolean>;
}

/**
 * One-time codes end to end: minting against an address and purpose, the
 * budget that makes a six-digit code worth anything, the letter, and the
 * verdict.
 *
 * Two rules shape the whole class. A code is minted for one purpose and one
 * account, and both are decided here rather than at presentation time. And
 * nothing about a code ever travels back on the request that asked for it —
 * the mailbox is the only channel.
 */
export class EmailVerificationService {
  constructor(
    private readonly store: ChallengeStore,
    private readonly mailer: Mailer,
    private readonly accounts: AccountLookup,
    private readonly hasher: CodeHasher
  ) {}

  async issue(address: string, purpose: OtpPurpose): Promise<IssueResult> {
    if ((await this.store.mintsLeft(address, purpose)) <= 0) {
      logger?.warn({ purpose }, "[EmailVerification] mint budget exhausted for address");
      return { ok: false, reason: "rate_limited" };
    }
    await this.store.spendMint(address, purpose);

    // The account is resolved now, not when the code comes back. A signup
    // code proves an address that is about to become an account and carries
    // no id; a reset code that resolves to nothing is never sent at all — and
    // the caller cannot tell the difference from the outside.
    const accountId =
      purpose === "signup" ? null : await this.accounts.findAccountIdByEmail(address);

    if (purpose === "password_reset" && accountId == null) {
      logger?.info(
        { purpose },
        "[EmailVerification] reset asked for an address with no account — answered as if sent"
      );
      return { ok: true };
    }

    const code = generateOtpCode();
    // Writing the challenge replaces whatever was live: at most one code per
    // address and purpose, so a fresh code retires the old rather than
    // widening the guessing surface.
    await this.store.put({
      purpose,
      address,
      accountId,
      codeHash: await this.hasher.hash(code),
      attemptsLeft: this.store.maxAttempts,
      delivery: "pending",
      deliveryDetail: null,
    });

    const { subject, text } = renderOtpLetter(purpose, code);
    const outcome = await this.mailer.send({ to: address, subject, text });
    await this.store.recordDelivery(
      address,
      purpose,
      outcome.taken ? "taken" : "refused",
      outcome.taken ? undefined : outcome.reason
    );

    if (!outcome.taken) {
      logger?.error({ purpose }, "[EmailVerification] letter refused by the provider");
    }
    return { ok: true };
  }

  async check(address: string, purpose: OtpPurpose, code: string): Promise<OtpVerdict> {
    // Purpose is part of the key, so a signup code presented for a reset
    // finds nothing here — refused before its digits are ever compared.
    const challenge = await this.store.get(address, purpose);
    if (!challenge) return { status: "expired" };

    if ((await this.store.attemptsLeft(address, purpose)) <= 0) {
      return { status: "exhausted" };
    }

    const valid = await this.hasher.verify(code, challenge.codeHash);
    if (!valid) {
      await this.store.spendAttempt(address, purpose);
      return { status: "wrong" };
    }

    await this.store.drop(address, purpose);
    return { status: "accepted", accountId: challenge.accountId };
  }
}

export const emailVerificationService = new EmailVerificationService(
  otpChallengeStore,
  { send: (letter) => mailClient().send(letter) },
  {
    async findAccountIdByEmail(address: string) {
      const user = await playerUserRepository.findByEmail(address);
      return user?.id ?? null;
    },
  },
  {
    hash: (code) => Bun.password.hash(code),
    verify: (code, hash) => Bun.password.verify(code, hash),
  }
);
