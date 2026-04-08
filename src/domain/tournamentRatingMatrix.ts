/** Column = participant count range start 20,22,...,70 (pairs 20-21 … 70-71). */
export const TOURNAMENT_RATING_COLUMN_COUNT = 26;

export const TOURNAMENT_RATING_PARTICIPANT_RANGE_LABELS: string[] = Array.from(
  { length: TOURNAMENT_RATING_COLUMN_COUNT },
  (_, i) => `${20 + i * 2}-${21 + i * 2}`
);

const ANCHOR_COLS = [0, 5, 10, 15, 20, 25] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate values given at cols 0,5,10,15,20,25 across col 0..25 */
function interpFromSixAnchors(valuesAtAnchors: readonly number[], col: number): number {
  const c = Math.max(0, Math.min(25, col));
  for (let i = 0; i < ANCHOR_COLS.length - 1; i++) {
    const c0 = ANCHOR_COLS[i]!;
    const c1 = ANCHOR_COLS[i + 1]!;
    if (c <= c1) {
      const t = c1 === c0 ? 0 : (c - c0) / (c1 - c0);
      return lerp(valuesAtAnchors[i]!, valuesAtAnchors[i + 1]!, t);
    }
  }
  return valuesAtAnchors[valuesAtAnchors.length - 1]!;
}

function piecewiseLinear(knots: readonly (readonly [number, number])[], col: number): number {
  if (knots.length === 0) return 0;
  if (col <= knots[0]![0]) return knots[0]![1];
  const last = knots[knots.length - 1]!;
  if (col >= last[0]) return last[1];
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0] = knots[i]!;
    const [x1, y1] = knots[i + 1]!;
    if (col <= x1) {
      const t = x1 === x0 ? 0 : (col - x0) / (x1 - x0);
      return lerp(y0, y1, t);
    }
  }
  return last[1];
}

/** First column index (0-based) where place `p` (11..35) receives points */
function firstColForPlace(p: number): number {
  return p - 10;
}

function simpleRamp(p: number, col: number): number {
  const c0 = firstColForPlace(p);
  if (col < c0) return 0;
  const vEnd = 36 - p;
  if (c0 >= 25) return col === 25 ? vEnd : 0;
  return 1 + ((vEnd - 1) * (col - c0)) / (25 - c0);
}

function cellValue(place: number, col: number): number {
  if (place < 1 || place > 35) return 0;
  if (col < 0 || col > 25) return 0;

  const maxPayingPlace = 10 + col;
  if (place > maxPayingPlace) return 0;

  if (place <= 10) {
    const top: readonly (readonly number[])[] = [
      [17, 34.25, 58, 86.5, 121, 144],
      [12.75, 25.5, 43.5, 64.5, 90, 107],
      [10, 20, 33.75, 50.25, 69.75, 82.75],
      [8, 16.75, 26.75, 40, 55, 70],
      [6.5, 13.25, 22.25, 31, 43.25, 53.25],
    ];
    if (place <= 5) {
      return interpFromSixAnchors(top[place - 1]!, col);
    }
    const p5 = top[4]!;
    const p10 = [3.5, 6.75, 11.5, 17, 23, 27.75] as const;
    const t = (place - 5) / 5;
    const anchorsAtPlace = p5.map((v, j) => lerp(v, p10[j]!, t));
    return interpFromSixAnchors(anchorsAtPlace, col);
  }

  if (place === 15) {
    return piecewiseLinear(
      [
        [5, 1],
        [10, 6],
        [15, 11],
        [20, 17],
        [25, 21],
      ],
      col
    );
  }
  if (place === 20) {
    return piecewiseLinear(
      [
        [10, 1],
        [15, 6],
        [20, 12],
        [25, 16],
      ],
      col
    );
  }
  if (place === 25) {
    return piecewiseLinear(
      [
        [15, 1],
        [20, 7],
        [25, 11],
      ],
      col
    );
  }
  if (place === 30) {
    return piecewiseLinear(
      [
        [20, 2],
        [25, 6],
      ],
      col
    );
  }
  if (place === 35) {
    return col === 25 ? 1 : 0;
  }

  return simpleRamp(place, col);
}

/** 35 × 26 base points: row index = place − 1, column = participant-range column */
function buildMatrix(): number[][] {
  const m: number[][] = [];
  for (let place = 1; place <= 35; place++) {
    const row: number[] = [];
    for (let col = 0; col < 26; col++) {
      row.push(cellValue(place, col));
    }
    m.push(row);
  }
  return m;
}

const RATING_MATRIX = buildMatrix();

/** Column index 0..25 from participant count (clamped to table range). */
export function tournamentRatingColumnIndex(participantCount: number): number {
  const n = Math.floor(participantCount);
  if (!Number.isFinite(n) || n < 20) return 0;
  if (n > 71) return 25;
  return Math.min(25, Math.max(0, Math.floor((n - 20) / 2)));
}

export function getBaseRatingPoints(participantCount: number, finishPlace: number): number {
  const place = Math.floor(finishPlace);
  if (place < 1 || place > 35) return 0;
  const col = tournamentRatingColumnIndex(participantCount);
  return RATING_MATRIX[place - 1]![col]!;
}

export interface TournamentRatingMatrixPlaceRow {
  place: number;
  basePoints: number[];
}

export interface TournamentRatingMatrixResponse {
  participantRangeLabels: string[];
  places: TournamentRatingMatrixPlaceRow[];
}

export function getTournamentRatingMatrixPayload(): TournamentRatingMatrixResponse {
  return {
    participantRangeLabels: [...TOURNAMENT_RATING_PARTICIPANT_RANGE_LABELS],
    places: RATING_MATRIX.map((basePoints, i) => ({
      place: i + 1,
      basePoints: [...basePoints],
    })),
  };
}
