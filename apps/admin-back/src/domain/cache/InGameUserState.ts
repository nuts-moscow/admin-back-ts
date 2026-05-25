import type { TournamentRatingBreakdown } from "../TournamentRatingBreakdown";

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

/** One recorded re-entry payment (ordered; sum of paidAmounts drives cash desk when set). */
export interface ReentryPaymentLine {
  method: EntryPaymentMethod;
  paidAmount: number;
}

/** In-game bonus */
export const InGameBonus = {
  EarlyBird: "EarlyBird",
  First20: "First20",
  Hookah: "Hookah",
  Diller: "Diller",
  /** Бонус дня */
  BonusOfTheDay: "BonusOfTheDay",
  /** Произвольные фишки: хранятся в customBonusChips, не в bonuses-парах */
  Custom: "Custom",
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

/** One burned-stack record: chips removed from play; source distinguishes rebuy (undoable) vs bust-out. */
export interface BurnedStackEvent {
  chips: number;
  source: "Rebuy" | "Out";
}

/** In-game user state */
export interface InGameUserState {
  /** Player ID within tournament, starts at 1 */
  tournamentPlayerId: number;
  playerId: PlayerId;
  status: InGamePlayerStatus;
  tableId: TableId | null;
  /** Whole bounties plus fractional shares when a single elimination is split across N killers. */
  bountyCount: number;
  entryPaymentMethod: EntryPaymentMethod | null;
  /** Factually paid entry amount (same units as tournament entry_price); null = legacy / use list price in cash desk. */
  entryPaidAmount: number | null;
  reentryByPaymentMethod: ReentryByPaymentMethod | null;
  /** Ordered re-entry payments; when null, cash desk uses reentryByPaymentMethod × reentry_price. */
  reentryPaymentLines: ReentryPaymentLine[] | null;
  totalReentryCount: number;
  freeEntryCount: number;
  freeReentryCount: number;
  /** Tournament-only free entries (temporary for this tournament) */
  tournamentFreeEntryCount: number;
  /** Tournament-only free re-entries (temporary for this tournament) */
  tournamentFreeReentryCount: number;
  placement: number | null;
  /** Frozen rating when status is Out (set at elimination; cleared when returning to game). */
  ratingSnapshot: TournamentRatingBreakdown | null;
  /**
   * Accrued rating points not from placement matrix (admin +/- during tournament).
   * Not cleared on return-to-game; merged into rating snapshot and totalPoints on elimination.
   */
  ratingNonPlacementAccrued: number;
  bonuses: BonusesByType | null;
  /** Размеры выдач custom-бонуса в фишках (каждый элемент — одна выдача). */
  customBonusChips: number[];
  /** Сожжённые стеки по событиям; sum(chips) для пула; откат только у source=Rebuy (LIFO по chips). */
  burnedStackEvents: BurnedStackEvent[];
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
    entryPaidAmount: null,
    reentryByPaymentMethod: null,
    reentryPaymentLines: null,
    totalReentryCount: 0,
    freeEntryCount,
    freeReentryCount,
    tournamentFreeEntryCount: 0,
    tournamentFreeReentryCount: 0,
    placement: null,
    ratingSnapshot: null,
    ratingNonPlacementAccrued: 0,
    bonuses: null,
    customBonusChips: [],
    burnedStackEvents: [],
  };
}

/** Build aggregated pairs from ordered re-entry lines (for free-count and legacy fields). */
export function reentryPaymentLinesToPairs(
  lines: ReentryPaymentLine[]
): ReentryByPaymentMethod {
  const map = new Map<EntryPaymentMethod, number>();
  for (const { method } of lines) {
    map.set(method, (map.get(method) ?? 0) + 1);
  }
  return Array.from(map.entries());
}

/** Expand stored pairs into lines using list reentry price (legacy migration helper). */
export function expandReentryPairsToLines(
  pairs: ReentryByPaymentMethod | null,
  reentryPrice: number
): ReentryPaymentLine[] {
  if (!pairs || pairs.length === 0) return [];
  const out: ReentryPaymentLine[] = [];
  for (const [method, count] of pairs) {
    for (let i = 0; i < count; i++) {
      out.push({
        method,
        paidAmount: method === EntryPaymentMethod.Free ? 0 : reentryPrice,
      });
    }
  }
  return out;
}

/** Sum of chips from all burned-stack events (rebuy + out). */
export function sumBurnedStackChips(events: BurnedStackEvent[]): number {
  return events.reduce((s, e) => s + e.chips, 0);
}

/** Parses JSON from Redis/DB; invalid or missing → []. */
export function parseBurnedStackEventsFromJson(
  raw: string | null | undefined
): BurnedStackEvent[] {
  if (raw == null || raw === "") return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: BurnedStackEvent[] = [];
  for (const item of arr) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const c = o.chips;
    const n =
      typeof c === "number" ? c : typeof c === "string" ? parseInt(c, 10) : NaN;
    if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) continue;
    const src = o.source;
    if (src !== "Rebuy" && src !== "Out") continue;
    out.push({ chips: n, source: src });
  }
  return out;
}
