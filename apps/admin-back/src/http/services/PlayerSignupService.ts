// `logger` is initialised at app startup; unit tests construct this service
// directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import {
  REQUIRED_LEGAL_DOCS,
  consentsSatisfyRequirements,
} from "../../domain/legalDocuments";
import { playerUserRepository } from "../../postgres/PlayerUserRepository";
import { withTransaction } from "../../postgres/withTransaction";
import { emailVerificationService, type OtpVerdict } from "./EmailVerificationService";
import { passwordPolicyIssue } from "./PasswordWriteService";
import { playerSessionService } from "./PlayerSessionService";

export type BeginResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "rate_limited" | "weak_password" };

export type CompleteResult =
  | { ok: true; accountId: number; playerId: number; token: string; nickname: string }
  | {
      ok: false;
      reason: "invalid_code" | "taken" | "consent_required" | "weak_password" | "error";
    };

export interface Consent {
  slug: string;
  version: string;
}

export interface SignupCodes {
  issue(address: string, purpose: "signup"): Promise<{ ok: boolean }>;
  check(address: string, purpose: "signup", code: string): Promise<OtpVerdict>;
}

/**
 * The whole account, written or not written at all. The implementation runs
 * this inside one database transaction; the interface exists so the service
 * can be tested without Postgres.
 */
export interface AccountCreator {
  /** Creates profile, credential and consent together, or nothing. */
  createAccount(input: {
    email: string;
    passwordHash: string;
    nickname: string;
    consents: ReadonlyArray<Consent>;
    ip: string | null;
  }): Promise<
    | { ok: true; accountId: number; playerId: number }
    | { ok: false; reason: "taken" | "error" }
  >;
  /** Whether the address is already bound. A fast path, never the authority. */
  isAddressTaken(address: string): Promise<boolean>;
}

export interface SignupGrants {
  issue(accountId: number): Promise<{ token: string }>;
}

export interface SignupHasher {
  hash(password: string): Promise<string>;
}

/** The nickname a newcomer starts with: the local part of their address. */
export function nicknameFromAddress(address: string): string {
  const local = address.trim().split("@")[0] ?? "";
  return local.slice(0, 32) || "player";
}

/**
 * Self-registration by mailbox, in two steps.
 *
 * Step one claims an address: it refuses a taken one before any letter goes
 * out, and otherwise asks for a code. Nothing is created — an offered address
 * is a claim, not an account.
 *
 * Step two is one act. The code is spent only after the account has actually
 * landed, so the state "burned my proof and got nothing" does not exist; and
 * profile, credential and consent share a transaction, so an account without
 * the consent that gated it does not exist either.
 */
export class PlayerSignupService {
  constructor(
    private readonly accounts: AccountCreator,
    private readonly codes: SignupCodes,
    private readonly grants: SignupGrants,
    private readonly hasher: SignupHasher
  ) {}

  async begin(address: string, password: string): Promise<BeginResult> {
    if (passwordPolicyIssue(password)) {
      return { ok: false, reason: "weak_password" };
    }
    // The club answers plainly here rather than hiding membership behind a
    // uniform "code sent" — a recorded trade, see `signup-answers-plainly`.
    if (await this.accounts.isAddressTaken(address)) {
      return { ok: false, reason: "taken" };
    }
    const issued = await this.codes.issue(address, "signup");
    return issued.ok ? { ok: true } : { ok: false, reason: "rate_limited" };
  }

  async complete(input: {
    address: string;
    code: string;
    password: string;
    consents: ReadonlyArray<Consent>;
    ip: string | null;
  }): Promise<CompleteResult> {
    if (passwordPolicyIssue(input.password)) {
      return { ok: false, reason: "weak_password" };
    }
    if (!consentsSatisfyRequirements([...input.consents])) {
      return { ok: false, reason: "consent_required" };
    }

    // Weighed, not spent: a code stays usable until an account exists.
    const verdict = await this.codes.check(input.address, "signup", input.code);
    if (verdict.status !== "accepted") {
      return { ok: false, reason: "invalid_code" };
    }

    const created = await this.accounts.createAccount({
      email: input.address,
      passwordHash: await this.hasher.hash(input.password),
      nickname: nicknameFromAddress(input.address),
      consents: REQUIRED_LEGAL_DOCS,
      ip: input.ip,
    });
    if (!created.ok) {
      // The transaction rolled back and the code was never spent — the player
      // can finish with the code already in their mailbox.
      return { ok: false, reason: created.reason };
    }

    logger?.info(
      { accountId: created.accountId, playerId: created.playerId },
      "[PlayerSignup] account created"
    );

    const { token } = await this.grants.issue(created.accountId);
    return {
      ok: true,
      accountId: created.accountId,
      playerId: created.playerId,
      token,
      nickname: nicknameFromAddress(input.address),
    };
  }
}

export const playerSignupService = new PlayerSignupService(
  {
    async isAddressTaken(address) {
      return (await playerUserRepository.findByEmail(address)) != null;
    },
    createAccount: (input) => createAccountAtomically(input),
  },
  {
    issue: (address, purpose) => emailVerificationService.issue(address, purpose),
    check: (address, purpose, code) =>
      emailVerificationService.check(address, purpose, code),
  },
  {
    async issue(accountId) {
      return playerSessionService.issue(accountId);
    },
  },
  { hash: (password) => Bun.password.hash(password) }
);

/**
 * Profile, credential and consent in one transaction. The repositories talk to
 * the pool rather than to a client, so the transaction is expressed here, on
 * the one path where atomicity is load-bearing.
 */
async function createAccountAtomically(input: {
  email: string;
  passwordHash: string;
  nickname: string;
  consents: ReadonlyArray<Consent>;
  ip: string | null;
}): Promise<
  { ok: true; accountId: number; playerId: number } | { ok: false; reason: "taken" | "error" }
> {
  try {
    return await withTransaction(async (client) => {
      const player = await client.query(
        "INSERT INTO players (nickname) VALUES ($1) RETURNING id",
        [input.nickname]
      );
      const playerId = Number(player.rows[0]?.id);
      if (!playerId) throw new Error("player insert returned no id");

      const user = await client.query(
        `INSERT INTO player_users (login, email, password_hash, player_id, email_verified_at)
         VALUES (NULL, $1, $2, $3, now()) RETURNING id`,
        [input.email.trim(), input.passwordHash, playerId]
      );
      const accountId = Number(user.rows[0]?.id);
      if (!accountId) throw new Error("player_user insert returned no id");

      for (const doc of input.consents) {
        await client.query(
          `INSERT INTO player_document_consents
             (player_id, document_slug, document_version, ip)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (player_id, document_slug, document_version) DO NOTHING`,
          [playerId, doc.slug, doc.version, input.ip]
        );
      }

      return { ok: true as const, accountId, playerId };
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      // The unique index, not the pre-check, is the authority on the address.
      return { ok: false, reason: "taken" };
    }
    logger?.error({ err }, "[PlayerSignup] account transaction rolled back");
    return { ok: false, reason: "error" };
  }
}
