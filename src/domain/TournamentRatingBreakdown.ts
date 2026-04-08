/**
 * Frozen tournament rating breakdown (e.g. at elimination or persisted at completion).
 * manualAdjustment in snapshot during play is always 0; totalPoints = fromTable + bounty only.
 */
export interface TournamentRatingBreakdown {
  basePoints: number;
  guaranteeBonus: number;
  pointsCoefficient: number;
  fromTableAfterCoefficient: number;
  bountyCount: number;
  bountyPoints: number;
  bountyCoefficient: number;
  manualAdjustment: number;
  totalPoints: number;
}

export function isTournamentRatingBreakdown(x: unknown): x is TournamentRatingBreakdown {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  const nums = [
    "basePoints",
    "guaranteeBonus",
    "pointsCoefficient",
    "fromTableAfterCoefficient",
    "bountyCount",
    "bountyPoints",
    "bountyCoefficient",
    "manualAdjustment",
    "totalPoints",
  ];
  for (const k of nums) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k] as number)) return false;
  }
  return true;
}
