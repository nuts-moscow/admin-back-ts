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
