import {
  InGameBonus,
  type BonusesByType,
} from "./InGameUserState";

const VALID_BONUSES = new Set<string>(Object.values(InGameBonus));

/** Chips awarded per single bonus instance (tournament chip pool). Custom uses customBonusChips array, not this map. */
export const IN_GAME_BONUS_CHIP_VALUE: Record<InGameBonus, number> = {
  [InGameBonus.EarlyBird]: 3000,
  [InGameBonus.First20]: 5000,
  [InGameBonus.Hookah]: 7500,
  [InGameBonus.Diller]: 15000,
  [InGameBonus.BonusOfTheDay]: 6000,
  [InGameBonus.Custom]: 0,
};

export interface BonusChipBreakdownLine {
  bonus: InGameBonus;
  count: number;
  chipsPerUnit: number;
  totalChips: number;
}

/** Adds one player's bonus pairs into a running count map (excludes Custom — use customBonusChips). */
export function mergeBonusesIntoCounts(
  counts: Map<InGameBonus, number>,
  bonuses: BonusesByType | null
): void {
  if (!bonuses) return;
  for (const [b, c] of bonuses) {
    if (b === InGameBonus.Custom) continue;
    counts.set(b, (counts.get(b) ?? 0) + c);
  }
}

/** Builds breakdown lines and total chips from merged counts (no Custom). */
export function breakdownFromMergedCounts(
  counts: Map<InGameBonus, number>
): { lines: BonusChipBreakdownLine[]; bonusChipsTotal: number } {
  const lines: BonusChipBreakdownLine[] = [];
  let bonusChipsTotal = 0;
  const sorted = [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [bonus, count] of sorted) {
    if (count <= 0 || bonus === InGameBonus.Custom) continue;
    const chipsPerUnit = IN_GAME_BONUS_CHIP_VALUE[bonus];
    const totalChips = count * chipsPerUnit;
    bonusChipsTotal += totalChips;
    lines.push({ bonus, count, chipsPerUnit, totalChips });
  }
  return { lines, bonusChipsTotal };
}

/**
 * Aggregates custom bonus chip grants across players into one breakdown line.
 * @param perPlayerArrays — customBonusChips for each eligible player
 */
export function aggregateCustomBonusChipsForBreakdown(
  perPlayerArrays: number[][]
): { line: BonusChipBreakdownLine | null; totalChips: number } {
  let totalChips = 0;
  let grantCount = 0;
  for (const arr of perPlayerArrays) {
    for (const n of arr) {
      if (typeof n === "number" && !Number.isNaN(n) && n > 0) {
        totalChips += n;
        grantCount += 1;
      }
    }
  }
  if (grantCount === 0) {
    return { line: null, totalChips: 0 };
  }
  const chipsPerUnit = totalChips / grantCount;
  return {
    line: {
      bonus: InGameBonus.Custom,
      count: grantCount,
      chipsPerUnit,
      totalChips,
    },
    totalChips,
  };
}

/**
 * Parses bonuses JSON (array of [bonus, count]). Custom must not appear in pairs.
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
    if (bonus === InGameBonus.Custom) return null;
    const num = typeof count === "number" ? count : parseInt(String(count), 10);
    if (Number.isNaN(num) || num < 0) return null;
    result.push([bonus as InGameBonus, num]);
  }
  return result.length === 0 ? null : result;
}

/** Parses custom bonus chips JSON from Redis / DB. Invalid JSON → []. */
export function parseStoredCustomBonusChipsJson(json: string | null): number[] {
  if (json == null || json === "") return [];
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: number[] = [];
  for (const x of arr) {
    const n = typeof x === "number" ? x : parseInt(String(x), 10);
    if (!Number.isNaN(n) && n > 0) out.push(n);
  }
  return out;
}
