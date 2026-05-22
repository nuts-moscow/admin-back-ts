import { z } from 'zod';

export const PlayerMedalKind = z.enum(['gold', 'silver', 'bronze', 'none']);
export type PlayerMedalKind = z.infer<typeof PlayerMedalKind>;

export const PlayerMeProfile = z.object({
  id: z.number().int(),
  nickname: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  joinedAt: z.string(),
  rank: z.number().int().nullable(),
  points: z.number(),
  playedTournaments: z.number().int(),
  wins: z.number().int(),
  finalTables: z.number().int(),
  itm: z.number().int(),
  freeEntryCount: z.number().int().nonnegative(),
  freeReentryCount: z.number().int().nonnegative(),
  bountyCount: z.number(),
  medal: PlayerMedalKind,
  eloLite: z.object({
    value: z.number(),
    peak: z.number(),
    change30d: z.number(),
  }),
});
export type PlayerMeProfile = z.infer<typeof PlayerMeProfile>;

export const PlayerTournamentHistoryEntry = z.object({
  tournamentId: z.number().int(),
  date: z.string(),
  name: z.string(),
  buyin: z.number(),
  place: z.number().int().nullable(),
  fieldSize: z.number().int(),
  prize: z.number().nullable(),
  eloDelta: z.number(),
  pointsDelta: z.number(),
});
export type PlayerTournamentHistoryEntry = z.infer<typeof PlayerTournamentHistoryEntry>;

export const PlayerUpdateProfileRequest = z.object({
  nickname: z.string().min(1).max(64).optional(),
});
export type PlayerUpdateProfileRequest = z.infer<typeof PlayerUpdateProfileRequest>;
