import { z } from 'zod';

/** Login by a unique username (open-registration users) or an email (legacy). */
export const PlayerLoginRequest = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});
export type PlayerLoginRequest = z.infer<typeof PlayerLoginRequest>;

/** Open self-registration: unique login + a password (≥8 chars, letter + digit). */
export const PlayerRegisterRequest = z.object({
  login: z.string().min(3).max(32),
  password: z.string().min(8),
});
export type PlayerRegisterRequest = z.infer<typeof PlayerRegisterRequest>;

/**
 * Signup step one: an address is claimed and a code goes out. Nothing exists
 * yet — no profile, no credential, no session.
 */
export const PlayerSignupBeginRequest = z.object({
  email: z.string().email(),
});
export type PlayerSignupBeginRequest = z.infer<typeof PlayerSignupBeginRequest>;

/**
 * Signup step two: the code proves the address, and the account comes into
 * being in one act together with the consent that gated it.
 */
export const PlayerSignupCompleteRequest = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(10),
  password: z.string().min(8),
  consents: z.array(z.object({ slug: z.string(), version: z.string() })),
});
export type PlayerSignupCompleteRequest = z.infer<typeof PlayerSignupCompleteRequest>;

/** Asks for a reset code. Answers identically whether or not the address is known. */
export const PasswordResetRequest = z.object({
  email: z.string().email(),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

/**
 * Writing a new password. Exactly one proof travels with it: the current
 * password, or a code from the account's mailbox. A session grant alone is
 * never enough.
 */
export const PasswordWriteRequest = z.union([
  z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }),
  z.object({
    email: z.string().email(),
    code: z.string().min(4).max(10),
    newPassword: z.string().min(8),
  }),
]);
export type PasswordWriteRequest = z.infer<typeof PasswordWriteRequest>;

/** Ending a player's own sessions: the presented grant, or all of them. */
export const EndSessionRequest = z.object({
  scope: z.enum(['current', 'all']).optional(),
});
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;

const PlayerAuthAccount = z.object({
  id: z.number().int(),
  login: z.string().nullable(),
  email: z.string().nullable(),
  nickname: z.string(),
});

export const PlayerLoginResponse = z.object({
  token: z.string(),
  player: PlayerAuthAccount,
});
export type PlayerLoginResponse = z.infer<typeof PlayerLoginResponse>;

export const PlayerAuthMeResponse = z.object({
  playerUserId: z.number().int(),
  playerId: z.number().int(),
  login: z.string().nullable(),
  email: z.string().nullable(),
  nickname: z.string(),
});
export type PlayerAuthMeResponse = z.infer<typeof PlayerAuthMeResponse>;
