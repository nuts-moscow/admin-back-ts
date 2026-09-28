import { describe, expect, test } from "bun:test";
import type { RatingTable } from "../../domain/RatingTable";
import { computeTournamentPlayerRating, ratedBountyCount } from "./tournamentRatingCompute";

const TOURNAMENT = {
  ratingGuaranteeEnabled: true,
  ratingGuaranteeBonusPoints: 15,
  ratingPointsCoefficient: 1.3,
  ratingBountyCoefficient: 1,
};

// Single-column table: every field size lands in column 0.
// Base points by place: 1st = 52.25, 2nd = 30, 11th = 5.
const TABLE: RatingTable = {
  id: 1,
  name: "test",
  columnRangeStart: 38,
  columnRangeStep: 2,
  matrix: [[52.25], [30], [20], [15], [12], [10], [8], [7], [6], [5.5], [5]],
};

describe("computeTournamentPlayerRating (base × coef + guarantee + bounty)", () => {
  test("field report case: 1st of 39 with 4 bounties = 52.25 × 1.3 + 15 + 2", () => {
    const b = computeTournamentPlayerRating(39, 1, 4, 0, TOURNAMENT, TABLE);
    expect(b.basePoints).toBe(52.25);
    expect(b.guaranteeBonus).toBe(15);
    // coefficient scales ONLY the base; the guarantee rides on top unscaled
    expect(b.fromTableAfterCoefficient).toBeCloseTo(52.25 * 1.3 + 15, 6);
    // bounty: 4 × 0.5 × 1, not scaled by the points coefficient
    expect(b.bountyPoints).toBe(2);
    expect(b.totalPoints).toBeCloseTo(84.925, 6);
  });

  test("outside top-10: no guarantee, base still scaled", () => {
    const b = computeTournamentPlayerRating(39, 11, 0, 0, TOURNAMENT, TABLE);
    expect(b.basePoints).toBe(5);
    expect(b.guaranteeBonus).toBe(0);
    expect(b.fromTableAfterCoefficient).toBeCloseTo(5 * 1.3, 6);
  });

  test("guarantee disabled pays base × coef only", () => {
    const b = computeTournamentPlayerRating(
      39,
      1,
      0,
      0,
      { ...TOURNAMENT, ratingGuaranteeEnabled: false },
      TABLE
    );
    expect(b.guaranteeBonus).toBe(0);
    expect(b.totalPoints).toBeCloseTo(52.25 * 1.3, 6);
  });

  test("manual adjustment adds linearly", () => {
    const b = computeTournamentPlayerRating(39, 2, 2, -3, TOURNAMENT, TABLE);
    // 30 × 1.3 + 15 + (2 × 0.5 × 1) − 3
    expect(b.totalPoints).toBeCloseTo(30 * 1.3 + 15 + 1 - 3, 6);
  });
});

describe("Mystery format: bounty points only for Rebuy knockouts", () => {
  const MYSTERY = { ratingBountyRebuyOnly: true };
  const REGULAR = { ratingBountyRebuyOnly: false };
  const ev = (type: "Rebuy" | "Out", killers: string[], recordedBounty = true) => ({
    type,
    killerPlayerIds: killers,
    recordedBounty,
    bountyShare: recordedBounty ? 1 / killers.length : 0,
  });
  const EVENTS = [
    ev("Rebuy", ["a"]), // a: +1 rated
    ev("Out", ["a"]), // a: knockout, but not rated in Mystery
    ev("Rebuy", ["a", "b"]), // a, b: +0.5 rated each
    ev("Rebuy", ["b"], false), // burned stack: no bounty at all
    ev("Out", ["b"]),
  ];

  test("regular tournament: every knockout is rated", () => {
    expect(ratedBountyCount("a", 2.5, REGULAR, EVENTS)).toBe(2.5);
  });

  test("Mystery: only Rebuy shares count, Out knockouts pay nothing", () => {
    expect(ratedBountyCount("a", 2.5, MYSTERY, EVENTS)).toBe(1.5);
    expect(ratedBountyCount("b", 1.5, MYSTERY, EVENTS)).toBe(0.5);
    expect(ratedBountyCount("c", 0, MYSTERY, EVENTS)).toBe(0);
  });

  test("breakdown keeps the full knockout count, pays only rated ones", () => {
    const b = computeTournamentPlayerRating(39, 11, 2.5, 0, TOURNAMENT, TABLE, 1.5);
    expect(b.bountyCount).toBe(2.5);
    expect(b.bountyPoints).toBe(0.75);
    expect(b.totalPoints).toBeCloseTo(5 * 1.3 + 0.75, 6);
  });
});
