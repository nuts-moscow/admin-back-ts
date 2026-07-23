import { describe, expect, test } from "bun:test";
import { pickNearestFutureMonthFinal } from "./TournamentRepository";

const NOW = 1_785_000_000_000; // ms, ~2026-07 (13-digit, above the seconds/ms threshold)
const DAY = 86_400_000;

describe("pickNearestFutureMonthFinal", () => {
  test("returns the soonest future flagged tournament", () => {
    const rows = [
      { id: 1, date: NOW + 3 * DAY },
      { id: 2, date: NOW + 1 * DAY },
      { id: 3, date: NOW + 2 * DAY },
    ];
    expect(pickNearestFutureMonthFinal(rows, NOW)).toEqual({ id: 2, date: NOW + DAY });
  });

  test("ignores past-dated (played) flagged tournaments", () => {
    const rows = [
      { id: 1, date: NOW - DAY },
      { id: 2, date: NOW + DAY },
    ];
    expect(pickNearestFutureMonthFinal(rows, NOW)).toEqual({ id: 2, date: NOW + DAY });
  });

  test("returns null when only past flagged tournaments exist", () => {
    const rows = [
      { id: 1, date: NOW - DAY },
      { id: 2, date: NOW - 2 * DAY },
    ];
    expect(pickNearestFutureMonthFinal(rows, NOW)).toBeNull();
  });

  test("returns null when nothing is flagged", () => {
    expect(pickNearestFutureMonthFinal([], NOW)).toBeNull();
  });

  test("breaks same-date ties by lower id, stable across input order", () => {
    const rows = [
      { id: 9, date: NOW + DAY },
      { id: 4, date: NOW + DAY },
      { id: 7, date: NOW + DAY },
    ];
    expect(pickNearestFutureMonthFinal(rows, NOW)).toEqual({ id: 4, date: NOW + DAY });
    expect(pickNearestFutureMonthFinal([...rows].reverse(), NOW)).toEqual({
      id: 4,
      date: NOW + DAY,
    });
  });

  test("a tournament dated exactly at now is not future", () => {
    expect(pickNearestFutureMonthFinal([{ id: 1, date: NOW }], NOW)).toBeNull();
  });

  test("normalizes seconds-epoch stored dates to ms before comparing/returning", () => {
    // Tournaments store `date` in seconds (10-digit); nowMs is Date.now() (ms).
    const nowMs = 1_785_000_000_000; // ~2026-07 in ms
    const futureSec = 1_785_675_600; // ~2026-08, ahead of nowMs
    const pastSec = 1_784_000_000; // ~2026-06, behind nowMs
    // Future seconds date is picked and returned in MS (so the client formats it right).
    expect(
      pickNearestFutureMonthFinal([{ id: 153, date: futureSec }], nowMs)
    ).toEqual({ id: 153, date: futureSec * 1000 });
    // Past seconds date is filtered out — not a false negative from the unit mismatch.
    expect(pickNearestFutureMonthFinal([{ id: 1, date: pastSec }], nowMs)).toBeNull();
  });
});
