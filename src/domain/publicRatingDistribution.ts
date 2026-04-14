import { getBaseRatingPoints } from "./tournamentRatingMatrix";

const MAX_PLACE = 35;

/** Deepest finishing place (1..35) that still receives base points from the matrix for this field size. */
export function maxPrizePlace(participantCount: number): number {
  const n = Math.floor(participantCount);
  if (!Number.isFinite(n) || n < 1) return 0;
  let max = 0;
  for (let p = 1; p <= MAX_PLACE; p++) {
    if (getBaseRatingPoints(n, p) > 0) max = p;
  }
  return max;
}

/**
 * Places to show: top 1..min(10, M) plus last three ranks in 1..M when M > 10.
 * M = min(players, prizeDepth).
 *
 * When M is 11 or 12, the last-three block overlaps the top-10 range (e.g. M=11 → 9,10,11).
 * A Set merges overlaps so each place appears once (place 10 is never listed twice).
 */
export function selectPlacesForDisplay(playersInTournament: number, prizeDepth: number): number[] {
  const R = Math.max(0, Math.floor(playersInTournament));
  const P = Math.max(0, Math.floor(prizeDepth));
  const M = R === 0 || P === 0 ? 0 : Math.min(R, P);

  if (M === 0) return [];

  const set = new Set<number>();
  const topEnd = Math.min(10, M);
  for (let p = 1; p <= topEnd; p++) set.add(p);

  if (M > 10) {
    set.add(M - 2);
    set.add(M - 1);
    set.add(M);
  }

  return [...set].sort((a, b) => a - b);
}
