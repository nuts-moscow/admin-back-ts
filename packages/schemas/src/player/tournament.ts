import { z } from 'zod';

export const TournamentStatus = z.enum(['registration_open', 'in_progress', 'completed']);
export type TournamentStatus = z.infer<typeof TournamentStatus>;

export const TournamentPlayerStatus = z.enum(['registered', 'in_game', 'out']);
export type TournamentPlayerStatus = z.infer<typeof TournamentPlayerStatus>;

const Blind = z.object({
  level: z.number().int(),
  smallBlind: z.number().int(),
  bigBlind: z.number().int(),
  /** 0 when no ante; otherwise equals bigBlind (BB ante convention). */
  ante: z.number().int(),
  /** Level duration in minutes (0 for breaks). */
  durationMin: z.number().int(),
  isBreak: z.boolean(),
});

export const PlayerTournamentSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  status: TournamentStatus,
  date: z.number().int(),
  buyin: z.number(),
  reentryPrice: z.number(),
  guarantee: z.number().nullable(),
  startingStack: z.number().int().nullable(),
  lateRegistrationClosed: z.boolean(),
  registeredCount: z.number().int(),
  aliveCount: z.number().int(),
  eliminatedCount: z.number().int(),
  isRegistered: z.boolean(),
  averageStack: z.number().nullable(),
  currentLevelNo: z.number().int().nullable(),
  currentBlinds: Blind.nullable(),
  nextBlinds: Blind.nullable(),
  levelTimeRemainingSec: z.number().int().nullable(),
});
export type PlayerTournamentSummary = z.infer<typeof PlayerTournamentSummary>;

export const PlayerTournamentDetail = PlayerTournamentSummary.extend({
  structure: z.object({
    name: z.string(),
    playersLimit: z.number().int(),
    stackSize: z.number().int(),
    freezeOutEnabled: z.boolean(),
    maxReentries: z.number().int(),
    levelDurationSec: z.number().int().nullable(),
    blinds: z.array(Blind),
  }).nullable(),
  totalChips: z.number().nullable(),
  chipLeader: z.object({ playerId: z.number().int(), nickname: z.string(), stack: z.number() }).nullable(),
  /** The calling player's own result — set only for completed tournaments they entered. */
  myResult: z
    .object({
      place: z.number().int().nullable(),
      fieldSize: z.number().int(),
      points: z.number(),
      knockouts: z.array(z.object({ playerId: z.number().int(), nickname: z.string() })),
      eliminatedBy: z.object({ playerId: z.number().int(), nickname: z.string() }).nullable(),
    })
    .nullable(),
});
export type PlayerTournamentDetail = z.infer<typeof PlayerTournamentDetail>;

export const PlayerTournamentPlayer = z.object({
  playerId: z.number().int(),
  nickname: z.string(),
  status: TournamentPlayerStatus,
  stack: z.number().nullable(),
  table: z.number().int().nullable(),
  seat: z.number().int().nullable(),
  place: z.number().int().nullable(),
  isMe: z.boolean(),
});
export type PlayerTournamentPlayer = z.infer<typeof PlayerTournamentPlayer>;

export const PlayerTournamentTable = z.object({
  table: z.number().int(),
  playersCount: z.number().int(),
  averageStack: z.number().nullable(),
  mine: z.boolean(),
  seats: z.array(z.object({
    seat: z.number().int(),
    playerId: z.number().int(),
    nickname: z.string(),
    stack: z.number().nullable(),
    status: TournamentPlayerStatus,
    isMe: z.boolean(),
  })).optional(),
});
export type PlayerTournamentTable = z.infer<typeof PlayerTournamentTable>;

export const PlayerMyTournamentState = z.object({
  tournamentId: z.number().int(),
  status: TournamentPlayerStatus,
  stack: z.number().nullable(),
  table: z.number().int().nullable(),
  seat: z.number().int().nullable(),
  place: z.number().int().nullable(),
  bountyCount: z.number(),
  reentriesUsed: z.number().int(),
});
export type PlayerMyTournamentState = z.infer<typeof PlayerMyTournamentState>;

export const PlayerRegisterTournamentRequest = z.object({
  useFreeEntry: z.boolean().optional().default(false),
});
export type PlayerRegisterTournamentRequest = z.infer<typeof PlayerRegisterTournamentRequest>;
