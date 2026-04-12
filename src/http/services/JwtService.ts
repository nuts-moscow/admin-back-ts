import { SignJWT, jwtVerify } from "jose";
import { ApplicationConfigs } from "../../configs";

export interface SignedToken {
  token: string;
  jti: string;
  expiresIn: number;
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(ApplicationConfigs.instance.server.jwtSecret);
}

/**
 * Issues a JWT with sub (userId), jti, ver (token version for password-change invalidation).
 */
export async function signToken(
  userId: number,
  tokenVersion: number,
  expiresInSec: number
): Promise<SignedToken> {
  const jti = crypto.randomUUID();
  const secret = getSecretKey();

  const token = await new SignJWT({ ver: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(secret);

  return { token, jti, expiresIn: expiresInSec };
}

export interface VerifiedTokenPayload {
  userId: number;
  jti: string;
  ver: number;
}

/**
 * Verifies signature and expiry. Does not check Redis blocklist or user version.
 */
export async function verifyTokenSignature(token: string): Promise<VerifiedTokenPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    const userId = parseInt(sub, 10);
    if (Number.isNaN(userId)) return null;
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) return null;
    const verRaw = payload.ver;
    const ver = typeof verRaw === "number" ? verRaw : typeof verRaw === "string" ? parseInt(verRaw, 10) : NaN;
    if (Number.isNaN(ver)) return null;
    return { userId, jti, ver };
  } catch {
    return null;
  }
}
