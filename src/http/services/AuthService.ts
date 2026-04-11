import type { AdminUser } from "../../domain/AdminUser";
import { logger } from "../../logger";
import { adminUserRepository } from "../../postgres/AdminUserRepository";
import { sessionStore } from "../../redis/SessionStore";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const SESSION_COOKIE_NAME = "admin_session";
const SESSION_TTL_SEC = 86400;

/** Pre-computed dummy hash — used to normalize response time when user is not found (timing attack prevention) */
let DUMMY_HASH: string | null = null;
export async function initDummyHash(): Promise<void> {
  DUMMY_HASH = await Bun.password.hash("__dummy__");
}

/**
 * Production:  SameSite=None; Secure — required for cross-site fetch (frontend on different origin).
 *              CSRF protection is handled by Origin header check in requireAuth middleware.
 * Development: SameSite=Lax — works for localhost-to-localhost without HTTPS.
 */
export function buildSessionCookie(sessionId: string): string {
  if (IS_PRODUCTION) {
    return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=${SESSION_TTL_SEC}`;
  }
  return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SEC}`;
}

export function clearSessionCookie(): string {
  if (IS_PRODUCTION) {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0`;
  }
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function getSessionIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name?.trim() === SESSION_COOKIE_NAME) {
      return rest.join("=").trim() || null;
    }
  }
  return null;
}

export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export type LoginResult =
  | { ok: true; user: AdminUser; sessionId: string }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" };

export async function login(
  username: string,
  password: string,
  ip: string
): Promise<LoginResult> {
  // Rate limit check
  const attempts = await sessionStore.getLoginAttempts(ip);
  if (attempts >= sessionStore.maxAttempts) {
    logger.warn({ ip, attempts }, "[Auth] Login blocked: rate limit exceeded");
    return { ok: false, reason: "rate_limited" };
  }

  const user = await adminUserRepository.findByUsername(username);

  if (!user) {
    // Dummy verify to normalize response time (timing attack prevention)
    if (DUMMY_HASH) {
      await Bun.password.verify("__dummy__", DUMMY_HASH);
    }
    const newAttempts = await sessionStore.incrementLoginAttempts(ip);
    logger.warn({ username, ip, attempts: newAttempts }, "[Auth] Login failed: user not found");
    return { ok: false, reason: "invalid_credentials" };
  }

  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    const newAttempts = await sessionStore.incrementLoginAttempts(ip);
    logger.warn({ username, ip, attempts: newAttempts }, "[Auth] Login failed: invalid password");
    return { ok: false, reason: "invalid_credentials" };
  }

  await sessionStore.clearLoginAttempts(ip);
  const sessionId = await sessionStore.create(user.id);
  logger.info({ username, sessionId: sessionId.slice(0, 8), ip }, "[Auth] Login successful");
  return { ok: true, user, sessionId };
}

export type LogoutResult = { ok: true } | { ok: false };

export async function logout(
  sessionId: string,
  userId: number,
  username: string,
  ip: string
): Promise<LogoutResult> {
  await sessionStore.delete(sessionId, userId);
  logger.info({ username, sessionId: sessionId.slice(0, 8), ip }, "[Auth] Logout");
  return { ok: true };
}

export type VerifySessionResult =
  | { ok: true; userId: number }
  | { ok: false };

export async function verifySession(sessionId: string): Promise<VerifySessionResult> {
  const userId = await sessionStore.get(sessionId);
  if (userId === null) return { ok: false };
  return { ok: true, userId };
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

  await sessionStore.deleteAllByUser(userId);
  logger.info({ username, ip }, "[Auth] Password changed: all sessions invalidated");
  return { ok: true };
}
