import { logger } from "../../logger";
import { playerUserRepository, type PlayerUser } from "../../postgres/PlayerUserRepository";
import { playerAuthStore, PLAYER_JWT_ACCESS_TTL_SEC } from "../../redis/PlayerAuthStore";
import { signPlayerToken, verifyPlayerTokenSignature } from "./PlayerJwtService";

let DUMMY_HASH: string | null = null;
export async function initPlayerDummyHash(): Promise<void> {
  DUMMY_HASH = await Bun.password.hash("__dummy_player__");
}

export type PlayerLoginResult =
  | { ok: true; user: PlayerUser; token: string; jti: string }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" };

export async function playerLogin(
  email: string,
  password: string,
  ip: string
): Promise<PlayerLoginResult> {
  const attempts = await playerAuthStore.getLoginAttempts(ip);
  if (attempts >= playerAuthStore.maxAttempts) {
    logger.warn({ ip, attempts }, "[PlayerAuth] Login blocked: rate limit exceeded");
    return { ok: false, reason: "rate_limited" };
  }

  const user = await playerUserRepository.findByEmail(email);

  if (!user) {
    if (DUMMY_HASH) {
      await Bun.password.verify("__dummy_player__", DUMMY_HASH);
    }
    const newAttempts = await playerAuthStore.incrementLoginAttempts(ip);
    logger.warn(
      { email, ip, attempts: newAttempts },
      "[PlayerAuth] Login failed: user not found"
    );
    return { ok: false, reason: "invalid_credentials" };
  }

  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    const newAttempts = await playerAuthStore.incrementLoginAttempts(ip);
    logger.warn(
      { email, ip, attempts: newAttempts },
      "[PlayerAuth] Login failed: invalid password"
    );
    return { ok: false, reason: "invalid_credentials" };
  }

  await playerAuthStore.clearLoginAttempts(ip);
  const ver = await playerAuthStore.getUserTokenVersion(user.id);
  const { token, jti } = await signPlayerToken(user.id, ver, PLAYER_JWT_ACCESS_TTL_SEC);
  logger.info({ email, jti: jti.slice(0, 8), ip }, "[PlayerAuth] Login successful");
  return { ok: true, user, token, jti };
}

export async function playerLogout(jti: string, playerUserId: number, ip: string): Promise<void> {
  await playerAuthStore.addToBlocklist(jti, PLAYER_JWT_ACCESS_TTL_SEC);
  logger.info({ playerUserId, jti: jti.slice(0, 8), ip }, "[PlayerAuth] Logout");
}

export type VerifyPlayerTokenResult =
  | { ok: true; playerUserId: number; jti: string }
  | { ok: false };

export async function verifyPlayerAccessToken(token: string): Promise<VerifyPlayerTokenResult> {
  const sig = await verifyPlayerTokenSignature(token);
  if (!sig) return { ok: false };
  if (await playerAuthStore.isBlocked(sig.jti)) return { ok: false };
  const currentVer = await playerAuthStore.getUserTokenVersion(sig.playerUserId);
  if (sig.ver !== currentVer) return { ok: false };
  return { ok: true, playerUserId: sig.playerUserId, jti: sig.jti };
}
