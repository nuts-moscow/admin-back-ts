import { ApplicationConfigs } from "../../configs";
import {
  signHs256Token,
  verifyHs256Token,
  type SignedToken,
  type VerifiedTokenPayload,
} from "./jwt/signing";

const ADMIN_AUDIENCE = "admin";

export type { SignedToken };

export interface AdminVerifiedTokenPayload {
  userId: number;
  jti: string;
  ver: number;
}

/**
 * Issues an admin JWT with sub (userId), jti, ver (token version for password-change invalidation),
 * and aud="admin" so it cannot be accepted by player-auth middleware.
 */
export async function signToken(
  userId: number,
  tokenVersion: number,
  expiresInSec: number
): Promise<SignedToken> {
  return signHs256Token(
    ApplicationConfigs.instance.server.jwtSecret,
    ADMIN_AUDIENCE,
    userId,
    tokenVersion,
    expiresInSec
  );
}

/**
 * Verifies admin token signature, audience, and expiry. Does not check Redis blocklist or user version.
 */
export async function verifyTokenSignature(token: string): Promise<AdminVerifiedTokenPayload | null> {
  const payload: VerifiedTokenPayload | null = await verifyHs256Token(
    ApplicationConfigs.instance.server.jwtSecret,
    ADMIN_AUDIENCE,
    token
  );
  if (!payload) return null;
  return { userId: payload.userId, jti: payload.jti, ver: payload.ver };
}
