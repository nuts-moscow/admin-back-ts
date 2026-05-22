import { z } from 'zod';

export const PlayerSeason = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  label: z.string(),
  isCurrent: z.boolean(),
});
export type PlayerSeason = z.infer<typeof PlayerSeason>;

export const PlayerSeasonRatingEntry = z.object({
  rank: z.number().int(),
  playerId: z.number().int(),
  nickname: z.string(),
  name: z.string().nullable(),
  points: z.number(),
  played: z.number().int(),
  itm: z.number().int(),
  isMe: z.boolean(),
});
export type PlayerSeasonRatingEntry = z.infer<typeof PlayerSeasonRatingEntry>;

export const PlayerEloLiteEntry = z.object({
  rank: z.number().int(),
  playerId: z.number().int(),
  nickname: z.string(),
  name: z.string().nullable(),
  elo: z.number(),
  peak: z.number(),
  change: z.number(),
  isMe: z.boolean(),
});
export type PlayerEloLiteEntry = z.infer<typeof PlayerEloLiteEntry>;
