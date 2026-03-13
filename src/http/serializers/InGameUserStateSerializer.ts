import {
  EntryPaymentMethod,
  type BonusesByType,
  type InGameUserState,
  type ReentryByPaymentMethod,
} from "../../domain/cache/InGameUserState";

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

function paidReentryCount(pairs: ReentryByPaymentMethod | null): number {
  if (!pairs || pairs.length === 0) return 0;
  let sum = 0;
  for (const [method, count] of pairs) {
    if (method === EntryPaymentMethod.Cache || method === EntryPaymentMethod.CreditCard) {
      sum += count;
    }
  }
  return sum;
}

/**
 * Converts InGameUserState to API response format.
 * reentryByPaymentMethod: [["Cache", 2], ["CreditCard", 1]] -> ["Cache", "Cache", "CreditCard"]
 * bonuses: [["EarlyBird", 2], ["Diller", 1]] -> ["EarlyBird", "EarlyBird", "Diller"]
 * playerName: from Postgres players table (pass from caller)
 * unpaidReentryCount: totalReentryCount - paid (Cache + CreditCard)
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
  const paid = paidReentryCount(pairs);
  const unpaidReentryCount = Math.max(0, state.totalReentryCount - paid);
  return {
    ...state,
    reentryByPaymentMethod: flattenPairs(pairs),
    bonuses: flattenPairs(state.bonuses as BonusesByType | null),
    playerName,
    totalReentryCount: state.totalReentryCount,
    unpaidReentryCount,
  };
}
