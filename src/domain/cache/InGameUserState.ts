/** Player ID */
export type PlayerId = string;

/** Table ID */
export type TableId = string;

/** Tournament ID */
export type TournamentId = string;

/** In-game player status */
export const InGamePlayerStatus = {
  Registered: "Registered",
  InGamePaid: "InGamePaid",
  InGameNotPaid: "InGameNotPaid",
  Out: "Out",
} as const;

export type InGamePlayerStatus =
  (typeof InGamePlayerStatus)[keyof typeof InGamePlayerStatus];

/** Entry payment method */
export const EntryPaymentMethod = {
  Cache: "Cache",
  CreditCard: "CreditCard",
  Free: "Free",
} as const;

export type EntryPaymentMethod =
  (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod];

/** Re-entry count by payment method: (method, count) */
export type ReentryByPaymentMethod = [EntryPaymentMethod, number][];

/** In-game bonus */
export const InGameBonus = {
  EarlyBird: "EarlyBird",
  Hookah: "Hookah",
  Diller: "Diller",
} as const;

export type InGameBonus =
  (typeof InGameBonus)[keyof typeof InGameBonus];

/** Bonuses: (bonus, count) */
export type BonusesByType = [InGameBonus, number][];

/** Bounty elimination type: Rebuy = eliminated player gets reentry, Out = no reentry */
export const BountyEliminationType = {
  Rebuy: "Rebuy",
  Out: "Out",
} as const;

export type BountyEliminationTypeValue =
  (typeof BountyEliminationType)[keyof typeof BountyEliminationType];

/** In-game user state */
export interface InGameUserState {
  /** Player ID within tournament, starts at 1 */
  tournamentPlayerId: number;
  playerId: PlayerId;
  status: InGamePlayerStatus;
  tableId: TableId | null;
  bountyCount: number;
  entryPaymentMethod: EntryPaymentMethod | null;
  reentryByPaymentMethod: ReentryByPaymentMethod | null;
  totalReentryCount: number;
  freeEntryCount: number;
  freeReentryCount: number;
  placement: number | null;
  bonuses: BonusesByType | null;
}

/** Creates initial state: optional fields empty, bountyCount = 0 */
export function initInGameUserState(
  playerId: PlayerId,
  tournamentPlayerId: number,
  freeEntryCount: number,
  freeReentryCount: number
): InGameUserState {
  return {
    tournamentPlayerId,
    playerId,
    status: InGamePlayerStatus.Registered,
    tableId: null,
    bountyCount: 0,
    entryPaymentMethod: null,
    reentryByPaymentMethod: null,
    totalReentryCount: 0,
    freeEntryCount,
    freeReentryCount,
    placement: null,
    bonuses: null,
  };
}
