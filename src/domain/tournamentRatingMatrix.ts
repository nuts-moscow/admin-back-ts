import type { RatingTable } from "./RatingTable";

/** Column = participant count range start 20,22,...,70 (pairs 20-21 … 70-71). */
export const TOURNAMENT_RATING_COLUMN_COUNT = 26;

export const TOURNAMENT_RATING_PARTICIPANT_RANGE_LABELS: string[] = Array.from(
  { length: TOURNAMENT_RATING_COLUMN_COUNT },
  (_, i) => `${20 + i * 2}-${21 + i * 2}`
);

/**
 * Base rating points: rows = finishing place 1…35, cols = 20-21 … 70-71.
 * Source: official table (integrates with UI).
 */
const RATING_MATRIX: number[][] = [
  [
    17, 19.25, 22.75, 26.25, 29.5, 34.25, 38.75, 43.25, 47.75, 52.25, 58, 63.75, 69.5, 75,
    80.75, 86.5, 92.25, 98, 103.75, 109.5, 115.25, 121, 126.75, 132.5, 138.25, 144,
  ],
  [
    12.75, 14.5, 17, 19.5, 22, 25.5, 29, 32.25, 35.75, 39, 43.5, 47.5, 51.75, 56, 60.25,
    64.5, 68.75, 73, 77.25, 81.5, 85.75, 90, 94.25, 98.5, 102.75, 107,
  ],
  [
    10, 11.25, 13.25, 15.25, 17.25, 20, 22.5, 25.25, 27.25, 30.5, 33.75, 37, 40.5, 43.75, 47,
    50.25, 53.5, 56.75, 60, 63.25, 66.5, 69.75, 73, 76.25, 79.5, 82.75,
  ],
  [
    8, 9, 10.5, 12, 13.75, 16.75, 17.75, 20, 22, 24.25, 26.75, 29.5, 32, 34.75, 37.25, 40,
    43, 46, 49, 52, 55, 58, 61, 64, 67, 70,
  ],
  [
    6.5, 7.5, 8.75, 10, 11.5, 13.25, 15, 16.75, 18.5, 20.25, 22.25, 24.5, 26.75, 29, 31,
    33.25, 35.25, 37.25, 39.25, 41.25, 43.25, 45.25, 47.25, 49.25, 51.25, 53.25,
  ],
  [
    5.5, 6.25, 7.25, 8.25, 9.5, 11, 12.25, 13.75, 15.25, 16.75, 18.5, 20.25, 22, 24, 25.75,
    27.5, 29.25, 31, 32.75, 34.5, 36.25, 38, 39.75, 41.5, 43.25, 45,
  ],
  [
    4.5, 5, 6, 7, 7.75, 9, 10.25, 11.5, 12.5, 13.75, 15.25, 16.75, 18.25, 19.75, 21.25,
    22.75, 24.25, 25.75, 27.25, 28.75, 30.25, 31.75, 33.25, 34.75, 36.25, 37.75,
  ],
  [
    4, 4.5, 5.25, 6, 6.75, 8, 9, 10, 11, 12, 13.5, 14.75, 16, 17.25, 18.75, 20, 21.25,
    22.5, 23.75, 25, 26.25, 27.5, 28.75, 30, 31.25, 32.5,
  ],
  [
    3.75, 4, 4.75, 5.5, 6.25, 7.25, 8, 9, 10, 11, 12, 13.25, 14.5, 15.75, 16.75, 18, 18.75,
    19.75, 20.75, 21.75, 22.75, 23.75, 24.75, 25.75, 26.75, 27.75,
  ],
  [
    3.5, 3.75, 4.5, 5.25, 5.75, 6.75, 7.75, 8.5, 9.5, 10.25, 11.5, 12.5, 13.75, 14.75, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  ],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  [0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2],
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  ],
];

for (let i = 0; i < RATING_MATRIX.length; i++) {
  const row = RATING_MATRIX[i]!;
  if (row.length !== TOURNAMENT_RATING_COLUMN_COUNT) {
    throw new Error(
      `tournamentRatingMatrix: row ${i + 1} has ${row.length} cols, expected ${TOURNAMENT_RATING_COLUMN_COUNT}`
    );
  }
}

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

// ---------------------------------------------------------------------------
// Table-aware lookup — works with any RatingTable loaded from the DB
// ---------------------------------------------------------------------------

/** Column index (0-based) for a given participant count and table definition. */
export function tableColumnIndex(table: RatingTable, participantCount: number): number {
  const n = Math.floor(participantCount);
  const colCount = table.matrix[0]?.length ?? 0;
  if (!Number.isFinite(n) || colCount === 0) return 0;
  const idx = Math.floor((n - table.columnRangeStart) / table.columnRangeStep);
  return Math.max(0, Math.min(colCount - 1, idx));
}

/** Base rating points from any RatingTable for a given participant count and finish place. */
export function getTableBaseRatingPoints(
  table: RatingTable,
  participantCount: number,
  finishPlace: number
): number {
  const place = Math.floor(finishPlace);
  if (place < 1 || place > table.matrix.length) return 0;
  const col = tableColumnIndex(table, participantCount);
  return table.matrix[place - 1]?.[col] ?? 0;
}

/** Column range labels for any RatingTable (e.g. ["10-11", "12-13", ...]). */
export function tableParticipantRangeLabels(table: RatingTable): string[] {
  const colCount = table.matrix[0]?.length ?? 0;
  return Array.from(
    { length: colCount },
    (_, i) =>
      `${table.columnRangeStart + i * table.columnRangeStep}-${
        table.columnRangeStart + i * table.columnRangeStep + 1
      }`
  );
}

export interface RatingTablePayload {
  id: number;
  name: string;
  participantRangeLabels: string[];
  places: { place: number; basePoints: (number | null)[] }[];
}

/** Serialize a RatingTable for API responses. */
export function getRatingTablePayload(table: RatingTable): RatingTablePayload {
  return {
    id: table.id,
    name: table.name,
    participantRangeLabels: tableParticipantRangeLabels(table),
    places: table.matrix.map((row, i) => ({
      place: i + 1,
      basePoints: [...row],
    })),
  };
}
