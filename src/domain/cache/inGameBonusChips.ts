import {
  InGameBonus,
  type BonusesByType,
} from "./InGameUserState";

const VALID_BONUSES = new Set<string>(Object.values(InGameBonus));

/** Chips awarded per single bonus instance (tournament chip pool). */
export const IN_GAME_BONUS_CHIP_VALUE: Record<InGameBonus, number> = {
  [InGameBonus.EarlyBird]: 3000,
  [InGameBonus.First20]: 5000,
  [InGameBonus.Hookah]: 7500,
  [InGameBonus.Diller]: 15000,
  [InGameBonus.BonusOfTheDay]: 6000,
};

export interface BonusChipBreakdownLine {
  bonus: InGameBonus;
  count: number;
  chipsPerUnit: number;
  totalChips: number;
}

/** Adds one player's bonus pairs into a running count map. */
export function mergeBonusesIntoCounts(
  counts: Map<InGameBonus, number>,
  bonuses: BonusesByType | null
): void {
  if (!bonuses) return;
  for (const [b, c] of bonuses) {
    counts.set(b, (counts.get(b) ?? 0) + c);
  }
}

/** Builds breakdown lines and total chips from merged counts. */
export function breakdownFromMergedCounts(
  counts: Map<InGameBonus, number>
): { lines: BonusChipBreakdownLine[]; bonusChipsTotal: number } {
  const lines: BonusChipBreakdownLine[] = [];
  let bonusChipsTotal = 0;
  const sorted = [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [bonus, count] of sorted) {
    if (count <= 0) continue;
    const chipsPerUnit = IN_GAME_BONUS_CHIP_VALUE[bonus];
    const totalChips = count * chipsPerUnit;
    bonusChipsTotal += totalChips;
    lines.push({ bonus, count, chipsPerUnit, totalChips });
  }
  return { lines, bonusChipsTotal };
}

/**
 * Parses bonuses JSON as stored in Redis / tournament_result_players (array of [bonus, count]).
 * Returns null if empty or missing; returns empty array only if JSON is "[]".
 */
export function parseStoredBonusesJson(json: string | null): BonusesByType | null {
  if (json == null || json === "") return null;
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const result: BonusesByType = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [bonus, count] = item;
    if (typeof bonus !== "string" || !VALID_BONUSES.has(bonus)) return null;
    const num = typeof count === "number" ? count : parseInt(String(count), 10);
    if (Number.isNaN(num) || num < 0) return null;
    result.push([bonus as InGameBonus, num]);
  }
  return result.length === 0 ? null : result;
}
