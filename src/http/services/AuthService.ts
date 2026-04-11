import type { AdminUser } from "../../domain/AdminUser";
import { logger } from "../../logger";
import { adminUserRepository } from "../../postgres/AdminUserRepository";
import { sessionStore } from "../../redis/SessionStore";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Cookie name: __Host- prefix requires Secure + Path=/ — prevents subdomain injection */
export const SESSION_COOKIE_NAME = IS_PRODUCTION ? "__Host-admin_session" : "admin_session";
const SESSION_TTL_SEC = 86400;

/** Pre-computed dummy hash — used to normalize response time when user is not found (timing attack prevention) */
let DUMMY_HASH: string | null = null;
export async function initDummyHash(): Promise<void> {
  DUMMY_HASH = await Bun.password.hash("__dummy__");
}

export function buildSessionCookie(sessionId: string): string {
  const base = `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SEC}`;
  return IS_PRODUCTION ? `${base}; Secure` : base;
}

export function clearSessionCookie(): string {
  const base = `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
  return IS_PRODUCTION ? `${base}; Secure` : base;
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

export type SetupResult =
  | { ok: true; user: AdminUser }
  | { ok: false; reason: "already_exists" | "error" };

export async function setup(
  username: string,
  password: string,
  ip: string
): Promise<SetupResult> {
  const count = await adminUserRepository.count();
  if (count > 0) {
    logger.warn({ ip }, "[Auth] Setup blocked: admin user already exists");
    return { ok: false, reason: "already_exists" };
  }

  const passwordHash = await Bun.password.hash(password);
  const user = await adminUserRepository.create(username, passwordHash);
  if (!user) return { ok: false, reason: "error" };

  logger.info({ username }, "[Auth] Setup: first admin user created");
  return { ok: true, user };
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
