import { describe, expect, test } from "bun:test";
import { pickNearestFutureMonthFinal } from "./TournamentRepository";

const NOW = 1_000_000_000_000;
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
});
