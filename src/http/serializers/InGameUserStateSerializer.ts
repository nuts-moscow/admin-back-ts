import type {
  BonusesByType,
  InGameUserState,
  ReentryByPaymentMethod,
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

/**
 * Converts InGameUserState to API response format.
 * reentryByPaymentMethod: [["Cache", 2], ["CreditCard", 1]] -> ["Cache", "Cache", "CreditCard"]
 * bonuses: [["EarlyBird", 2], ["Diller", 1]] -> ["EarlyBird", "EarlyBird", "Diller"]
 * nickname: from Postgres players table (pass from caller)
 */
export function toApiResponse(
  state: InGameUserState,
  nickname: string | null = null
): Omit<InGameUserState, "reentryByPaymentMethod" | "bonuses"> & {
  reentryByPaymentMethod: string[] | null;
  bonuses: string[] | null;
  nickname: string | null;
} {
  return {
    ...state,
    reentryByPaymentMethod: flattenPairs(
      state.reentryByPaymentMethod as ReentryByPaymentMethod | null
    ),
    bonuses: flattenPairs(state.bonuses as BonusesByType | null),
    nickname,
  };
}
