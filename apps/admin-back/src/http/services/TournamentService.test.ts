import { describe, expect, test } from "bun:test";
import { planMonthFinalFlip } from "./TournamentService";

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
