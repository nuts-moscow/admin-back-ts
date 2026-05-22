import { z } from 'zod';

export const PlayerLoginRequest = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
export type PlayerLoginRequest = z.infer<typeof PlayerLoginRequest>;

export const PlayerLoginResponse = z.object({
  token: z.string(),
  player: z.object({
    id: z.number().int(),
    email: z.string().email(),
    nickname: z.string(),
  }),
});
export type PlayerLoginResponse = z.infer<typeof PlayerLoginResponse>;

export const PlayerAuthMeResponse = z.object({
  playerUserId: z.number().int(),
  playerId: z.number().int(),
  email: z.string().email(),
  nickname: z.string(),
});
export type PlayerAuthMeResponse = z.infer<typeof PlayerAuthMeResponse>;
