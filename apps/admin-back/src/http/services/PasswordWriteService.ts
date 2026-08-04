// `logger` is initialised at app startup; unit tests construct this service
// directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import { playerUserRepository } from "../../postgres/PlayerUserRepository";
import { emailVerificationService, type OtpVerdict } from "./EmailVerificationService";
import { playerSessionService } from "./PlayerSessionService";

/**
 * The proof travelling with a password write. There is no third member and
 * deliberately no "the caller holds a valid grant" case: a stolen grant reads
 * a profile, it does not take the account away from its owner.
 *
 * Note that neither variant can be constructed from a session context — that
 * is the type-level half of `password-write-needs-proof`.
 */
export type WriteProof =
  | { kind: "current_password"; accountId: number; currentPassword: string }
  | { kind: "mailbox_code"; address: string; code: string };

export type PasswordWriteResult =
  | { ok: true; accountId: number }
  | { ok: false; reason: "invalid_proof" | "weak_password" | "error" };

/** Asking for a reset code says nothing about whether the address is known. */
export type ResetRequestResult = { ok: true } | { ok: false; reason: "rate_limited" };

export interface AccountStore {
  findById(id: number): Promise<{ id: number; passwordHash: string } | null>;
  updatePassword(id: number, passwordHash: string): Promise<boolean>;
}

export interface CodeChecker {
  issue(address: string, purpose: "password_reset"): Promise<{ ok: boolean }>;
  check(
    address: string,
    purpose: "password_reset",
    code: string
  ): Promise<OtpVerdict>;
}

export interface GrantRevoker {
  revokeAll(accountId: number): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/** ≥8 characters with a letter and a digit — the policy signup already used. */
export function passwordPolicyIssue(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one digit";
  }
  return null;
}

/**
 * The only path to a new password hash, and therefore the only place the
 * proof of ownership is demanded.
 *
 * A mailbox proof names the account it proves — the account comes off the
 * verdict, never off the request — so "code from my mailbox, password change
 * for that login over there" has nowhere to land.
 */
export class PasswordWriteService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly codes: CodeChecker,
    private readonly grants: GrantRevoker,
    private readonly hasher: PasswordHasher
  ) {}

  /**
   * Asks for a reset code. The answer is the same whether or not an account
   * exists behind the address; only the caller's own budget is visible.
   */
  async requestReset(address: string): Promise<ResetRequestResult> {
    const issued = await this.codes.issue(address, "password_reset");
    return issued.ok ? { ok: true } : { ok: false, reason: "rate_limited" };
  }

  async write(proof: WriteProof, newPassword: string): Promise<PasswordWriteResult> {
    if (passwordPolicyIssue(newPassword)) {
      return { ok: false, reason: "weak_password" };
    }

    const accountId = await this.resolveProof(proof);
    if (accountId == null) return { ok: false, reason: "invalid_proof" };

    const hash = await this.hasher.hash(newPassword);
    if (!(await this.accounts.updatePassword(accountId, hash))) {
      return { ok: false, reason: "error" };
    }

    // Every grant issued before this password goes: the point of a reset is
    // that whoever else was inside is now outside.
    await this.grants.revokeAll(accountId);
    logger?.info({ accountId, via: proof.kind }, "[PasswordWrite] password written");
    return { ok: true, accountId };
  }

  /** Answers which account the proof proves, or null when it proves nothing. */
  private async resolveProof(proof: WriteProof): Promise<number | null> {
    if (proof.kind === "current_password") {
      const account = await this.accounts.findById(proof.accountId);
      if (!account) return null;
      const valid = await this.hasher.verify(proof.currentPassword, account.passwordHash);
      return valid ? account.id : null;
    }

    const verdict = await this.codes.check(proof.address, "password_reset", proof.code);
    if (verdict.status !== "accepted") return null;
    // A signup code carries no account; it cannot authorise a password write.
    return verdict.accountId;
  }
}

export const passwordWriteService = new PasswordWriteService(
  {
    async findById(id) {
      const user = await playerUserRepository.findById(id);
      return user ? { id: user.id, passwordHash: user.passwordHash } : null;
    },
    updatePassword: (id, hash) => playerUserRepository.updatePassword(id, hash),
  },
  {
    issue: (address, purpose) => emailVerificationService.issue(address, purpose),
    check: (address, purpose, code) =>
      emailVerificationService.check(address, purpose, code),
  },
  { revokeAll: (accountId) => playerSessionService.revokeAll(accountId) },
  {
    hash: (password) => Bun.password.hash(password),
    verify: (password, hash) => Bun.password.verify(password, hash),
  }
);
