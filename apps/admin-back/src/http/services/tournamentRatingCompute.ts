import type { TournamentRatingBreakdown } from "../../domain/TournamentRatingBreakdown";
export { ratingWithManualAdjustment } from "../../domain/TournamentRatingBreakdown";
import { InGamePlayerStatus, type InGameUserState } from "../../domain/cache/InGameUserState";
import { getTableBaseRatingPoints } from "../../domain/tournamentRatingMatrix";
import type { RatingTable } from "../../domain/RatingTable";
import type { TournamentRow } from "../../postgres/TournamentRepository";

/**
 * Field size for the rating matrix: players who joined the game (any status except Registered).
 */
export function ratingParticipantCount(states: Pick<InGameUserState, "status">[]): number {
  let n = 0;
  for (const s of states) {
    if (s.status !== InGamePlayerStatus.Registered) n += 1;
  }
  return n;
}

/**
 * Matrix row index (1 = best). eliminationPlacement is Redis-style: 1 = first out, nPlayed = winner in field.
 */
export function matrixFinishPlaceFromEliminationSlot(
  nPlayed: number,
  eliminationPlacement: number | null
): number | null {
  if (nPlayed < 1 || eliminationPlacement == null) return null;
  return nPlayed - eliminationPlacement + 1;
}

export interface PublicRatingPlaceRow {
  place: number;
  basePoints: number;
  guaranteeBonus: number;
  pointsCoefficient: number;
  fromTableAfterCoefficient: number;
}

export function buildPublicRatingPlaceRows(
  places: number[],
  participantCount: number,
  tournament: Pick<
    TournamentRow,
    | "ratingGuaranteeEnabled"
    | "ratingGuaranteeBonusPoints"
    | "ratingPointsCoefficient"
    | "ratingBountyCoefficient"
  >,
  ratingTable: RatingTable
): PublicRatingPlaceRow[] {
  return places.map((place) => {
    const breakdown = computeTournamentPlayerRating(
      participantCount,
      place,
      0,
      0,
      tournament,
      ratingTable
    );
    return {
      place,
      basePoints: breakdown.basePoints,
      guaranteeBonus: breakdown.guaranteeBonus,
      pointsCoefficient: breakdown.pointsCoefficient,
      fromTableAfterCoefficient: breakdown.fromTableAfterCoefficient,
    };
  });
}

export const TOURNAMENT_BOUNTY_RATING_BASE = 0.5;

export type { TournamentRatingBreakdown };

export function computeTournamentPlayerRating(
  participantCount: number,
  finishPlace: number | null,
  bountyCount: number,
  manualAdjustment: number,
  tournament: Pick<
    TournamentRow,
    | "ratingGuaranteeEnabled"
    | "ratingGuaranteeBonusPoints"
    | "ratingPointsCoefficient"
    | "ratingBountyCoefficient"
  >,
  ratingTable: RatingTable
): TournamentRatingBreakdown {
  const place = finishPlace != null && Number.isFinite(finishPlace) ? Math.floor(finishPlace) : null;
  const base =
    place != null && place >= 1 ? getTableBaseRatingPoints(ratingTable, participantCount, place) : 0;

  const bonusPts = tournament.ratingGuaranteeBonusPoints ?? 10;
  const guaranteeBonus =
    tournament.ratingGuaranteeEnabled && place != null && place >= 1 && place <= 10
      ? bonusPts
      : 0;

  // The coefficient scales only the matrix base; the guarantee bonus rides on
  // top unscaled: base × coef + guarantee (user decision, 2026-07-16).
  const coef = tournament.ratingPointsCoefficient;
  const fromTableAfterCoefficient = base * coef + guaranteeBonus;

  const bountyCoef = tournament.ratingBountyCoefficient;
  const bountyPoints = bountyCount * TOURNAMENT_BOUNTY_RATING_BASE * bountyCoef;

  const nonPlacementAccrued = 0;
  const totalPoints =
    fromTableAfterCoefficient + bountyPoints + nonPlacementAccrued + manualAdjustment;

  return {
    basePoints: base,
    guaranteeBonus,
    pointsCoefficient: coef,
    fromTableAfterCoefficient,
    bountyCount,
    bountyPoints,
    bountyCoefficient: bountyCoef,
    nonPlacementAccrued,
    manualAdjustment,
    totalPoints,
  };
}

/** Merge Redis accrual into breakdown and fix totalPoints. */
export function applyNonPlacementAccrued(
  breakdown: TournamentRatingBreakdown,
  accrued: number
): TournamentRatingBreakdown {
  const manual = breakdown.manualAdjustment;
  return {
    ...breakdown,
    nonPlacementAccrued: accrued,
    totalPoints:
      breakdown.fromTableAfterCoefficient + breakdown.bountyPoints + accrued + manual,
  };
}

