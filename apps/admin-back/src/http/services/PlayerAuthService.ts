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

/**
 * The failures one identity has spent, and the bound they are spent against.
 * Nothing here is keyed by the client address: twenty players at a live
 * tournament share one, so counting them together counts noise.
 */
export interface AttemptBudget {
  getIdentityAttempts(identity: string): Promise<number>;
  incrementIdentityAttempts(identity: string): Promise<number>;
  clearIdentityAttempts(identity: string): Promise<void>;
  readonly maxAttempts: number;
  readonly windowSec: number;
}

export interface GrantIssuer {
  issue(accountId: number): Promise<{ token: string; jti: string }>;
}

export interface PasswordChecker {
  verify(password: string, hash: string): Promise<boolean>;
}

/**
 * Where this door's lines go. Injected for the same reason every other
 * collaborator here is: what the log says is part of the contract now that
 * there are two doors, and a contract nothing can assert is a wish.
 */
export interface LogSink {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
}

const moduleLog: LogSink = {
  info: (fields, message) => logger?.info(fields, message),
  warn: (fields, message) => logger?.warn(fields, message),
};

/**
 * The credential door, and nothing else: it resolves an identifier to an
 * account and weighs the password behind it. Minting the grant belongs to
 * `PlayerSessionService` and writing a password to `PasswordWriteService`, so
 * getting past this door is not the same as taking the account.
 *
 * Resolution deliberately stays wide. Accounts that existed before the
 * mailbox became the identifier carry a login and a null address, and they
 * sign in exactly as they always did.
 *
 * Every line this door writes carries `door: "password"`. There are two doors
 * now, and the question "how did they get in" has to have an answer before it
 * is asked — the club spent a locked-out tournament learning that a log which
 * does not name what it did is a log that cannot be read afterwards.
 */
export class PlayerAuthService {
  constructor(
    private readonly credentials: CredentialStore,
    private readonly budget: AttemptBudget,
    private readonly grants: GrantIssuer,
    private readonly passwords: PasswordChecker,
    private readonly dummyHash: () => string | null,
    private readonly log: LogSink = moduleLog
  ) {}

  async signIn(identifier: string, password: string, ip: string): Promise<PlayerLoginResult> {
    const id = identifier.trim();
    // Read the count rather than ask a yes/no: a refusal has to be able to say
    // in the log which budget stopped it and how far past the bound it was,
    // otherwise "we blocked them" and "something upstream blocked them" look
    // identical from the outside.
    const spent = await this.budget.getIdentityAttempts(id);
    if (spent >= this.budget.maxAttempts) {
      this.log.warn(
        {
          ip,
          door: "password",
          counter: "identity",
          attempts: spent,
          max: this.budget.maxAttempts,
          windowSec: this.budget.windowSec,
        },
        "[PlayerAuth] sign-in refused: identity attempt budget spent"
      );
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
      return { ok: false, reason: "invalid_credentials" };
    }

    if (!(await this.passwords.verify(password, user.passwordHash))) {
      await this.spendAttempt(ip, id);
      return { ok: false, reason: "invalid_credentials" };
    }

    await this.budget.clearIdentityAttempts(id);
    const { token, jti } = await this.grants.issue(user.id);
    this.log.info(
      { ip, door: "password", jti: jti.slice(0, 8) },
      "[PlayerAuth] sign-in successful"
    );
    return { ok: true, user, token, jti };
  }

  /**
   * One line for both refusals — an unknown identifier and a wrong password
   * are indistinguishable to the caller, and a log that told them apart would
   * hand the answer to anyone who can read it.
   */
  private async spendAttempt(ip: string, identity: string): Promise<void> {
    const attempts = await this.budget.incrementIdentityAttempts(identity);
    this.log.warn(
      {
        ip,
        door: "password",
        counter: "identity",
        attempts,
        max: this.budget.maxAttempts,
        left: Math.max(0, this.budget.maxAttempts - attempts),
      },
      "[PlayerAuth] sign-in failed"
    );
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
