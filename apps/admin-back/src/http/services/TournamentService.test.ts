import { describe, expect, test } from "bun:test";
import type { TournamentRow } from "../../postgres/TournamentRepository";
import { planMonthFinalFlip, tournamentRowToApi } from "./TournamentService";

const baseRow: TournamentRow = {
  id: 1,
  name: "t",
  status: "registration_open",
  date: 0,
  entryPrice: 1000,
  reentryPrice: 1000,
  ratingGuaranteeEnabled: false,
  ratingGuaranteeBonusPoints: 10,
  ratingPointsCoefficient: 1,
  ratingBountyCoefficient: 1,
  ratingTableId: 1,
  ratingEnabled: true,
  ratingSeasonYear: null,
  ratingSeasonMonth: null,
  lateRegistrationClosed: false,
  monthFinal: false,
};

describe("tournamentRowToApi", () => {
  test("exposes monthFinal so the admin edit form reads current state", () => {
    expect(tournamentRowToApi({ ...baseRow, monthFinal: true }).monthFinal).toBe(true);
    expect(tournamentRowToApi(baseRow).monthFinal).toBe(false);
  });
});

const reg = (playerId: string | number) => ({ playerId, status: "Registered" });
const inGame = (playerId: string | number) => ({ playerId, status: "InGamePaid" });

describe("planMonthFinalFlip", () => {
  test("removes self-registered players when the flag goes on", () => {
    expect(planMonthFinalFlip([reg("1"), reg("2")], true)).toEqual({ toRemove: ["1", "2"] });
  });

  test("leaves non-registered (in-game) entries in place", () => {
    expect(planMonthFinalFlip([reg("1"), inGame("2")], true)).toEqual({ toRemove: ["1"] });
  });

  test("is a no-op when the flag goes off", () => {
    expect(planMonthFinalFlip([reg("1"), reg("2")], false)).toEqual({ toRemove: [] });
  });

  test("is a no-op on an empty roster", () => {
    expect(planMonthFinalFlip([], true)).toEqual({ toRemove: [] });
  });

  test("normalizes numeric player ids to strings", () => {
    expect(planMonthFinalFlip([reg(7)], true)).toEqual({ toRemove: ["7"] });
  });
});
