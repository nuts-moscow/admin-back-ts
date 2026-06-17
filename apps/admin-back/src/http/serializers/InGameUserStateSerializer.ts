import type { TournamentRatingBreakdown } from "../../domain/TournamentRatingBreakdown";
import type { BountyEliminationEventForPlayer } from "../../domain/cache/BountyEliminationEventForPlayer";
import {
  EntryPaymentMethod,
  type BonusesByType,
  type InGameBonus,
  type InGameUserState,
  type ReentryByPaymentMethod,
  type ReentryPaymentLine,
  sumBurnedStackChips,
} from "../../domain/cache/InGameUserState";

const VALID_ENTRY_PAYMENT_METHODS = new Set<string>(
  Object.values(EntryPaymentMethod)
);

function flattenPairs<T extends string>(
  pairs: [T, number][] | null
): T[] | null {
  if (!pairs || pairs.length === 0) return null;
  const result: T[] = [];
  for (const [item, count] of pairs) {
    for (let i = 0; i < count; i++) {
      result.push(item);
    }
  }
  return result.length > 0 ? result : null;
}

/** Flatten bonus type+count pairs to API list (same as bonuses in toApiResponse). */
export function flattenBonusesForApi(
  pairs: BonusesByType | null
): InGameBonus[] | null {
  return flattenPairs(pairs);
}

/**
 * Total re-entries that have a recorded payment method (Cache, CreditCard, or Free).
 */
export function recordedReentryCountFromPairs(
  pairs: ReentryByPaymentMethod | null
): number {
  if (!pairs || pairs.length === 0) return 0;
  let sum = 0;
  for (const [, count] of pairs) {
    sum += count;
  }
  return sum;
}

/** Recorded re-entry rows: prefers ordered lines when present. */
export function recordedReentryCountForState(state: {
  reentryPaymentLines: ReentryPaymentLine[] | null;
  reentryByPaymentMethod: ReentryByPaymentMethod | null;
}): number {
  if (state.reentryPaymentLines != null && state.reentryPaymentLines.length > 0) {
    return state.reentryPaymentLines.length;
  }
  return recordedReentryCountFromPairs(state.reentryByPaymentMethod);
}

/**
 * Parses stored JSON for reentryByPaymentMethod (pair format from Redis / tournament results).
 */
/** Parses reentry payment lines JSON from DB / Redis string form. */
export function parseReentryPaymentLinesStoredJson(
  json: string | null
): ReentryPaymentLine[] | null {
  if (json == null || json === "") return null;
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const out: ReentryPaymentLine[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const o = item as Record<string, unknown>;
    const methodRaw = o.method ?? o.m;
    if (typeof methodRaw !== "string" || !VALID_ENTRY_PAYMENT_METHODS.has(methodRaw)) {
      return null;
    }
    const amtRaw = o.paidAmount ?? o.amount ?? o.paid;
    const num =
      typeof amtRaw === "number" ? amtRaw : typeof amtRaw === "string" ? parseInt(amtRaw, 10) : NaN;
    if (Number.isNaN(num) || num < 0 || !Number.isInteger(num)) return null;
    out.push({ method: methodRaw as EntryPaymentMethod, paidAmount: num });
  }
  return out.length > 0 ? out : null;
}

export function parseReentryByPaymentMethodStoredJson(
  json: string | null
): ReentryByPaymentMethod | null {
  if (json == null || json === "") return null;
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const result: ReentryByPaymentMethod = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [method, count] = item;
    if (typeof method !== "string" || !VALID_ENTRY_PAYMENT_METHODS.has(method)) {
      return null;
    }
    const num = typeof count === "number" ? count : parseInt(String(count), 10);
    if (Number.isNaN(num) || num < 0) return null;
    result.push([method as EntryPaymentMethod, num]);
  }
  return result;
}

export function flattenReentryPairsForApi(
  pairs: ReentryByPaymentMethod | null
): string[] | null {
  return flattenPairs(pairs);
}

/**
 * Converts InGameUserState to API response format.
 * reentryByPaymentMethod: [["Cache", 2], ["CreditCard", 1]] -> ["Cache", "Cache", "CreditCard"]
 * bonuses: [["EarlyBird", 2], ["BonusOfTheDay", 1], ["Diller", 1]] -> ["EarlyBird", "EarlyBird", "BonusOfTheDay", "Diller"]
 * playerName: from Postgres players table (pass from caller)
 * unpaidReentryCount: totalReentryCount minus re-entries with any recorded payment (Cache, CreditCard, Free)
 * bountyEliminationEvents: pending POST /bounty/eliminate rows where this player is victim or killer (who was eliminated + killer list; undo via each item’s eventId)
 */
export function toApiResponse(
  state: InGameUserState,
  playerName: string | null = null,
  bountyEliminationEvents: BountyEliminationEventForPlayer[] = [],
  allowedReentryCount: number
): Omit<
  InGameUserState,
  | "reentryByPaymentMethod"
  | "reentryPaymentLines"
  | "bonuses"
  | "customBonusChips"
  | "ratingSnapshot"
> & {
  burnedStackChipsTotal: number;
  reentryByPaymentMethod: string[] | null;
  /** Same order as flattened reentryByPaymentMethod when lines exist; null if legacy pair-only storage. */
  reentryPaidAmounts: number[] | null;
  bonuses: string[] | null;
  customBonusChips: number[];
  playerName: string | null;
  unpaidReentryCount: number;
  allowedReentryCount: number;
  bountyEliminationEvents: BountyEliminationEventForPlayer[];
  /** Set for eliminated players: frozen rating at elimination time. */
  rating?: TournamentRatingBreakdown;
} {
  const pairs = state.reentryByPaymentMethod as ReentryByPaymentMethod | null;
  const recorded = recordedReentryCountFromPairs(pairs);
  const unpaidReentryCount = Math.max(0, state.totalReentryCount - recorded);
  const reentryPaidAmounts =
    state.reentryPaymentLines != null && state.reentryPaymentLines.length > 0
      ? state.reentryPaymentLines.map((l) => l.paidAmount)
      : null;
  const {
    reentryPaymentLines: _rpl,
    bonuses: bon,
    customBonusChips: cbc,
    reentryByPaymentMethod: _rbm,
    ratingSnapshot,
    ...core
  } = state;
  return {
    ...core,
    burnedStackEvents: state.burnedStackEvents.map((e) => ({ ...e })),
    burnedStackChipsTotal: sumBurnedStackChips(state.burnedStackEvents),
    reentryByPaymentMethod: flattenPairs(pairs),
    reentryPaidAmounts,
    bonuses: flattenPairs(bon as BonusesByType | null),
    customBonusChips: [...cbc],
    playerName,
    totalReentryCount: state.totalReentryCount,
    allowedReentryCount,
    unpaidReentryCount,
    bountyEliminationEvents: bountyEliminationEvents.map((e) => ({
      eventId: e.eventId,
      eliminatedPlayerId: e.eliminatedPlayerId,
      killerPlayerIds: [...e.killerPlayerIds],
      type: e.type,
      recordedAt: e.recordedAt,
    })),
    ...(ratingSnapshot != null ? { rating: ratingSnapshot } : {}),
  };
}
