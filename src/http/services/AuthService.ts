import type { AdminUser } from "../../domain/AdminUser";
import { logger } from "../../logger";
import { adminUserRepository } from "../../postgres/AdminUserRepository";
import { authStore, JWT_ACCESS_TTL_SEC } from "../../redis/AuthStore";
import { signToken, verifyTokenSignature } from "./JwtService";

/** Pre-computed dummy hash — used to normalize response time when user is not found (timing attack prevention) */
let DUMMY_HASH: string | null = null;
export async function initDummyHash(): Promise<void> {
  DUMMY_HASH = await Bun.password.hash("__dummy__");
}

export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const BEARER_PREFIX = /^Bearer\s+/i;

export function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const trimmed = authorizationHeader.trim();
  if (!BEARER_PREFIX.test(trimmed)) return null;
  const token = trimmed.replace(BEARER_PREFIX, "").trim();
  return token || null;
}

export type LoginResult =
  | { ok: true; user: AdminUser; token: string; jti: string }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" };

export async function login(
  username: string,
  password: string,
  ip: string
): Promise<LoginResult> {
  const attempts = await authStore.getLoginAttempts(ip);
  if (attempts >= authStore.maxAttempts) {
    logger.warn({ ip, attempts }, "[Auth] Login blocked: rate limit exceeded");
    return { ok: false, reason: "rate_limited" };
  }

  const user = await adminUserRepository.findByUsername(username);

  if (!user) {
    if (DUMMY_HASH) {
      await Bun.password.verify("__dummy__", DUMMY_HASH);
    }
    const newAttempts = await authStore.incrementLoginAttempts(ip);
    logger.warn({ username, ip, attempts: newAttempts }, "[Auth] Login failed: user not found");
    return { ok: false, reason: "invalid_credentials" };
  }

  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    const newAttempts = await authStore.incrementLoginAttempts(ip);
    logger.warn({ username, ip, attempts: newAttempts }, "[Auth] Login failed: invalid password");
    return { ok: false, reason: "invalid_credentials" };
  }

  await authStore.clearLoginAttempts(ip);
  const ver = await authStore.getUserTokenVersion(user.id);
  const { token, jti } = await signToken(user.id, ver, JWT_ACCESS_TTL_SEC);
  logger.info({ username, jti: jti.slice(0, 8), ip }, "[Auth] Login successful");
  return { ok: true, user, token, jti };
}

export type LogoutResult = { ok: true } | { ok: false };

export async function logout(
  jti: string,
  userId: number,
  username: string,
  ip: string
): Promise<LogoutResult> {
  await authStore.addToBlocklist(jti, JWT_ACCESS_TTL_SEC);
  logger.info({ username, jti: jti.slice(0, 8), ip }, "[Auth] Logout");
  return { ok: true };
}

export type VerifyAccessTokenResult =
  | { ok: true; userId: number; jti: string }
  | { ok: false };

export async function verifyAccessToken(token: string): Promise<VerifyAccessTokenResult> {
  const sig = await verifyTokenSignature(token);
  if (!sig) return { ok: false };
  if (await authStore.isBlocked(sig.jti)) return { ok: false };
  const currentVer = await authStore.getUserTokenVersion(sig.userId);
  if (sig.ver !== currentVer) return { ok: false };
  return { ok: true, userId: sig.userId, jti: sig.jti };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid_current_password" | "error" };

export async function changePassword(
  userId: number,
  username: string,
  currentPassword: string,
  newPassword: string,
  ip: string
): Promise<ChangePasswordResult> {
  const user = await adminUserRepository.findByUsername(username);
  if (!user) return { ok: false, reason: "error" };

  const valid = await Bun.password.verify(currentPassword, user.passwordHash);
  if (!valid) {
    logger.warn({ username, ip }, "[Auth] Change password failed: invalid current password");
    return { ok: false, reason: "invalid_current_password" };
  }

  const newHash = await Bun.password.hash(newPassword);
  const updated = await adminUserRepository.updatePassword(userId, newHash);
  if (!updated) return { ok: false, reason: "error" };

  await authStore.incrementUserTokenVersion(userId);
  logger.info({ username, ip }, "[Auth] Password changed: all JWTs invalidated (version bump)");
  return { ok: true };
}
