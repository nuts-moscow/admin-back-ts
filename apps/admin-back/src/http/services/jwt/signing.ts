import { SignJWT, jwtVerify } from "jose";

export interface SignedToken {
  token: string;
  jti: string;
  expiresIn: number;
}

export interface VerifiedTokenPayload {
  userId: number;
  jti: string;
  ver: number;
  aud: string;
}

export async function signHs256Token(
  secret: string,
  audience: string,
  userId: number,
  tokenVersion: number,
  expiresInSec: number
): Promise<SignedToken> {
  const jti = crypto.randomUUID();
  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({ ver: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setAudience(audience)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(key);
  return { token, jti, expiresIn: expiresInSec };
}

export async function verifyHs256Token(
  secret: string,
  audience: string,
  token: string
): Promise<VerifiedTokenPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      audience,
    });
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    const userId = parseInt(sub, 10);
    if (Number.isNaN(userId)) return null;
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) return null;
    const verRaw = payload.ver;
    const ver =
      typeof verRaw === "number"
        ? verRaw
        : typeof verRaw === "string"
          ? parseInt(verRaw, 10)
          : NaN;
    if (Number.isNaN(ver)) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (typeof aud !== "string") return null;
    return { userId, jti, ver, aud };
  } catch {
    return null;
  }
}
