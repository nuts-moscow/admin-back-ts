/**
 * Frozen tournament rating breakdown (e.g. at elimination or persisted at completion).
 * During play manualAdjustment in snapshot is 0; nonPlacementAccrued comes from Redis accrual.
 * totalPoints = fromTableAfterCoefficient + bountyPoints + nonPlacementAccrued + manualAdjustment.
 */
export interface TournamentRatingBreakdown {
  basePoints: number;
  guaranteeBonus: number;
  pointsCoefficient: number;
  fromTableAfterCoefficient: number;
  bountyCount: number;
  bountyPoints: number;
  bountyCoefficient: number;
  /** Points accrued outside placement matrix (live tournament); 0 in old persisted rows. */
  nonPlacementAccrued: number;
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
  if (
    o.nonPlacementAccrued !== undefined &&
    (typeof o.nonPlacementAccrued !== "number" || !Number.isFinite(o.nonPlacementAccrued as number))
  ) {
    return false;
  }
  return true;
}

/** Fills missing nonPlacementAccrued (legacy JSON) and recomputes totalPoints. */
export function normalizeTournamentRatingBreakdown(b: TournamentRatingBreakdown): TournamentRatingBreakdown {
  const np = b.nonPlacementAccrued ?? 0;
  const manual = b.manualAdjustment ?? 0;
  return {
    ...b,
    nonPlacementAccrued: np,
    totalPoints: b.fromTableAfterCoefficient + b.bountyPoints + np + manual,
  };
}
