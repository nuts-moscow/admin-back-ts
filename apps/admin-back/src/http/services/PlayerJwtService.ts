import { ApplicationConfigs } from "../../configs";
import {
  signHs256Token,
  verifyHs256Token,
  type SignedToken,
  type VerifiedTokenPayload,
} from "./jwt/signing";

const PLAYER_AUDIENCE = "player";

export interface PlayerVerifiedTokenPayload {
  playerUserId: number;
  jti: string;
  ver: number;
}

/**
 * Issues a player JWT with sub (playerUserId), jti, ver, and aud="player".
 * Signed with PLAYER_JWT_SECRET — distinct from admin secret.
 */
export async function signPlayerToken(
  playerUserId: number,
  tokenVersion: number,
  expiresInSec: number
): Promise<SignedToken> {
  return signHs256Token(
    ApplicationConfigs.instance.server.playerJwtSecret,
    PLAYER_AUDIENCE,
    playerUserId,
    tokenVersion,
    expiresInSec
  );
}

/**
 * Verifies player token signature, audience ("player"), and expiry.
 * Does not check Redis blocklist or user version.
 */
export async function verifyPlayerTokenSignature(
  token: string
): Promise<PlayerVerifiedTokenPayload | null> {
  const payload: VerifiedTokenPayload | null = await verifyHs256Token(
    ApplicationConfigs.instance.server.playerJwtSecret,
    PLAYER_AUDIENCE,
    token
  );
  if (!payload) return null;
  return { playerUserId: payload.userId, jti: payload.jti, ver: payload.ver };
}
