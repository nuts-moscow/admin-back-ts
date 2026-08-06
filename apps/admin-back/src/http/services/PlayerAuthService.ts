// `logger` is initialised at app startup; unit tests construct this service
// directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import { playerUserRepository, type PlayerUser } from "../../postgres/PlayerUserRepository";
import { playerAuthStore } from "../../redis/PlayerAuthStore";
import { playerSessionService } from "./PlayerSessionService";

let DUMMY_HASH: string | null = null;
export async function initPlayerDummyHash(): Promise<void> {
  DUMMY_HASH = await Bun.password.hash("__dummy_player__");
}

export type PlayerLoginResult =
  | { ok: true; user: PlayerUser; token: string; jti: string }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" };

export interface CredentialStore {
  findByLogin(login: string): Promise<PlayerUser | null>;
  findByEmail(email: string): Promise<PlayerUser | null>;
}

export interface AttemptBudget {
  isRateLimited(ip: string, identity?: string | null): Promise<boolean>;
  incrementLoginAttempts(ip: string): Promise<number>;
  incrementIdentityAttempts(identity: string): Promise<number>;
  clearLoginAttempts(ip: string): Promise<void>;
  clearIdentityAttempts(identity: string): Promise<void>;
}

export interface GrantIssuer {
  issue(accountId: number): Promise<{ token: string; jti: string }>;
}

export interface PasswordChecker {
  verify(password: string, hash: string): Promise<boolean>;
}

/**
 * The credential door, and nothing else: it resolves an identifier to an
 * account and weighs the password behind it. Minting the grant belongs to
 * `PlayerSessionService` and writing a password to `PasswordWriteService`, so
 * getting past this door is not the same as taking the account.
 *
 * Resolution deliberately stays wide. Accounts that existed before the
 * mailbox became the identifier carry a login and a null address, and they
 * sign in exactly as they always did.
 */
export class PlayerAuthService {
  constructor(
    private readonly credentials: CredentialStore,
    private readonly budget: AttemptBudget,
    private readonly grants: GrantIssuer,
    private readonly passwords: PasswordChecker,
    private readonly dummyHash: () => string | null
  ) {}

  async signIn(identifier: string, password: string, ip: string): Promise<PlayerLoginResult> {
    const id = identifier.trim();
    if (await this.budget.isRateLimited(ip, id)) {
      logger?.warn({ ip }, "[PlayerAuth] sign-in blocked: attempt budget spent");
      return { ok: false, reason: "rate_limited" };
    }

    // A login first, then an address; citext makes both case-insensitive.
    const user =
      (await this.credentials.findByLogin(id)) ?? (await this.credentials.findByEmail(id));

    if (!user) {
      // Burn a comparable amount of time, so the response does not answer the
      // question its body refuses to.
      const dummy = this.dummyHash();
      if (dummy) await this.passwords.verify("__dummy_player__", dummy);
      await this.spendAttempt(ip, id);
      logger?.warn({ ip }, "[PlayerAuth] sign-in failed");
      return { ok: false, reason: "invalid_credentials" };
    }

    if (!(await this.passwords.verify(password, user.passwordHash))) {
      await this.spendAttempt(ip, id);
      logger?.warn({ ip }, "[PlayerAuth] sign-in failed");
      return { ok: false, reason: "invalid_credentials" };
    }

    await this.budget.clearLoginAttempts(ip);
    await this.budget.clearIdentityAttempts(id);
    const { token, jti } = await this.grants.issue(user.id);
    logger?.info({ ip, jti: jti.slice(0, 8) }, "[PlayerAuth] sign-in successful");
    return { ok: true, user, token, jti };
  }

  private async spendAttempt(ip: string, identity: string): Promise<void> {
    await this.budget.incrementLoginAttempts(ip);
    await this.budget.incrementIdentityAttempts(identity);
  }
}

export const playerAuthService = new PlayerAuthService(
  playerUserRepository,
  playerAuthStore,
  { issue: (accountId) => playerSessionService.issue(accountId) },
  { verify: (password, hash) => Bun.password.verify(password, hash) },
  () => DUMMY_HASH
);

/** The entry point the route already calls. */
export function playerLogin(
  identifier: string,
  password: string,
  ip: string
): Promise<PlayerLoginResult> {
  return playerAuthService.signIn(identifier, password, ip);
}

/** Signing out is one grant retired; the session service owns the mechanism. */
export function playerLogout(
  jti: string,
  playerUserId: number,
  _ip: string
): Promise<void> {
  return playerSessionService.endOne(jti, playerUserId);
}
