import {
  EntryPaymentMethod,
  type BonusesByType,
  type InGameUserState,
  type ReentryByPaymentMethod,
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

/**
 * Parses stored JSON for reentryByPaymentMethod (pair format from Redis / tournament results).
 */
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
 */
export function toApiResponse(
  state: InGameUserState,
  playerName: string | null = null
): Omit<InGameUserState, "reentryByPaymentMethod" | "bonuses"> & {
  reentryByPaymentMethod: string[] | null;
  bonuses: string[] | null;
  playerName: string | null;
  unpaidReentryCount: number;
} {
  const pairs = state.reentryByPaymentMethod as ReentryByPaymentMethod | null;
  const recorded = recordedReentryCountFromPairs(pairs);
  const unpaidReentryCount = Math.max(0, state.totalReentryCount - recorded);
  return {
    ...state,
    reentryByPaymentMethod: flattenPairs(pairs),
    bonuses: flattenPairs(state.bonuses as BonusesByType | null),
    playerName,
    totalReentryCount: state.totalReentryCount,
    unpaidReentryCount,
  };
}
