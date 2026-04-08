import type { TournamentRatingBreakdown } from "../../domain/TournamentRatingBreakdown";
import { getBaseRatingPoints } from "../../domain/tournamentRatingMatrix";
import type { TournamentRow } from "../../postgres/TournamentRepository";

export const TOURNAMENT_BOUNTY_RATING_BASE = 0.5;

export type { TournamentRatingBreakdown };

export function computeTournamentPlayerRating(
  participantCount: number,
  finishPlace: number | null,
  bountyCount: number,
  manualAdjustment: number,
  tournament: Pick<
    TournamentRow,
    "ratingGuaranteeEnabled" | "ratingPointsCoefficient" | "ratingBountyCoefficient"
  >
): TournamentRatingBreakdown {
  const place = finishPlace != null && Number.isFinite(finishPlace) ? Math.floor(finishPlace) : null;
  const base =
    place != null && place >= 1 ? getBaseRatingPoints(participantCount, place) : 0;

  const guaranteeBonus =
    tournament.ratingGuaranteeEnabled && place != null && place >= 1 && place <= 10
      ? 10
      : 0;

  const coef = tournament.ratingPointsCoefficient;
  const fromTableAfterCoefficient = (base + guaranteeBonus) * coef;

  const bountyCoef = tournament.ratingBountyCoefficient;
  const bountyPoints = bountyCount * TOURNAMENT_BOUNTY_RATING_BASE * bountyCoef;

  const totalPoints = fromTableAfterCoefficient + bountyPoints + manualAdjustment;

  return {
    basePoints: base,
    guaranteeBonus,
    pointsCoefficient: coef,
    fromTableAfterCoefficient,
    bountyCount,
    bountyPoints,
    bountyCoefficient: bountyCoef,
    manualAdjustment,
    totalPoints,
  };
}

/** Apply DB manual adjustment; persisted breakdown keeps manual 0 at save time. */
export function ratingWithManualAdjustment(
  persisted: TournamentRatingBreakdown,
  manualAdjustment: number
): TournamentRatingBreakdown {
  return {
    ...persisted,
    manualAdjustment,
    totalPoints:
      persisted.fromTableAfterCoefficient + persisted.bountyPoints + manualAdjustment,
  };
}
