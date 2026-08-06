import { describe, expect, test } from "bun:test";
import { FINAL_TABLE_SIZE, isFinalTable } from "./PlayerTournamentRatingFactsRepository";

describe("final table is top ten", () => {
  test("the club's final table seats ten", () => {
    expect(FINAL_TABLE_SIZE).toBe(10);
  });

  test("tenth place in a field of thirty is a final table, eleventh is not", () => {
    // Placement is stored high-is-better: first place equals the field size.
    const field = 30;
    const tenth = field - 9;
    const eleventh = field - 10;
    expect(isFinalTable(tenth, field)).toBe(true);
    expect(isFinalTable(eleventh, field)).toBe(false);
  });

  test("winning is always a final table", () => {
    expect(isFinalTable(30, 30)).toBe(true);
    expect(isFinalTable(6, 6)).toBe(true);
  });

  test("a field of ten or fewer makes every finisher a final-tablist", () => {
    for (let place = 1; place <= 8; place += 1) {
      expect(isFinalTable(place, 8)).toBe(true);
    }
  });

  test("a player with no placement did not reach it", () => {
    expect(isFinalTable(null, 30)).toBe(false);
  });
});
