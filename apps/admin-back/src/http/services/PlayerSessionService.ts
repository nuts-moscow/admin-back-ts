// `logger` is initialised at app startup; unit tests construct these
// services directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import { PLAYER_JWT_ACCESS_TTL_SEC, playerAuthStore } from "../../redis/PlayerAuthStore";
import { signPlayerToken, verifyPlayerTokenSignature } from "./PlayerJwtService";

/** The slice of session state grants depend on. */
export interface SessionStateStore {
  addToBlocklist(jti: string, ttlSec: number): Promise<void>;
  isBlocked(jti: string): Promise<boolean>;
  incrementUserTokenVersion(playerUserId: number): Promise<number>;
  getUserTokenVersion(playerUserId: number): Promise<number>;
}

/** Signing is injected so the service is testable without a secret. */
export interface GrantSigner {
  sign(
    playerUserId: number,
    version: number,
    ttlSec: number
  ): Promise<{ token: string; jti: string }>;
  verify(
    token: string
  ): Promise<{ playerUserId: number; jti: string; ver: number } | null>;
}

export interface IssuedGrant {
  token: string;
  jti: string;
}

export type VerifiedGrant =
  | { ok: true; playerUserId: number; jti: string }
  | { ok: false };

/** What a player asked to end: the grant they are holding, or all of them. */
export type EndScope = "current" | "all";

/**
 * Grants: minted for an account that has already been proved, verified on
 * every request, and taken back two ways — one jti onto the blocklist, or the
 * account's whole version bumped.
 *
 * Proving the account is not this service's job. It mints for whoever the
 * caller says was proved, which is why only the credential door, the signup
 * and the password write reach it.
 */
export class PlayerSessionService {
  constructor(
    private readonly store: SessionStateStore,
    private readonly signer: GrantSigner
  ) {}

  async issue(playerUserId: number): Promise<IssuedGrant> {
    const version = await this.store.getUserTokenVersion(playerUserId);
    const { token, jti } = await this.signer.sign(
      playerUserId,
      version,
      PLAYER_JWT_ACCESS_TTL_SEC
    );
    return { token, jti };
  }

  async verify(token: string): Promise<VerifiedGrant> {
    const signature = await this.signer.verify(token);
    if (!signature) return { ok: false };
    if (await this.store.isBlocked(signature.jti)) return { ok: false };
    const current = await this.store.getUserTokenVersion(signature.playerUserId);
    if (signature.ver !== current) return { ok: false };
    return { ok: true, playerUserId: signature.playerUserId, jti: signature.jti };
  }

  /**
   * Retires every grant the account holds, including the one that asked.
   * The password write calls this; so does a player ending all sessions.
   */
  async revokeAll(playerUserId: number): Promise<void> {
    await this.store.incrementUserTokenVersion(playerUserId);
    logger?.info({ playerUserId }, "[PlayerSession] all grants retired");
  }

  /** Retires the one grant presented. */
  async endOne(jti: string, playerUserId: number): Promise<void> {
    await this.store.addToBlocklist(jti, PLAYER_JWT_ACCESS_TTL_SEC);
    logger?.info({ playerUserId, jti: jti.slice(0, 8) }, "[PlayerSession] grant retired");
  }

  async endSession(
    scope: EndScope,
    jti: string,
    playerUserId: number
  ): Promise<void> {
    if (scope === "all") {
      await this.revokeAll(playerUserId);
      return;
    }
    await this.endOne(jti, playerUserId);
  }
}

export const playerSessionService = new PlayerSessionService(playerAuthStore, {
  sign: (playerUserId, version, ttlSec) =>
    signPlayerToken(playerUserId, version, ttlSec),
  verify: (token) => verifyPlayerTokenSignature(token),
});
