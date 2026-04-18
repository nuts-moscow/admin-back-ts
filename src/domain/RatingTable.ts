export type RatingTableId = number;

export interface RatingTable {
  id: RatingTableId;
  name: string;
  /** Participant count that maps to the first column (e.g. 10 or 20). */
  columnRangeStart: number;
  /** Participant step per column (always 2). */
  columnRangeStep: number;
  /**
   * rows[place-1][colIndex] = base points (null = no points for that combo).
   * All rows have the same length (number of columns).
   */
  matrix: (number | null)[][];
}
