import { describe, expect, test } from "bun:test";
import type { BountyEliminationEventRecord } from "../../cache/BountyEliminationEventsCache";
import { eliminationEventsForPlayer } from "./InGameUserStateService";

function ev(
  eventId: string,
  eliminatedPlayerId: string,
  killerPlayerIds: string[],
  recordedAt: number | undefined,
  type: "Rebuy" | "Out" = "Out"
): BountyEliminationEventRecord {
  return {
    eventId,
    eliminatedPlayerId,
    killerPlayerIds,
    type,
    burnedStack: false,
    burnedChips: 0,
    recordedBounty: killerPlayerIds.length > 0,
    bountyShare: killerPlayerIds.length > 0 ? 1 / killerPlayerIds.length : 0,
    recordedAt,
  };
}

describe("eliminationEventsForPlayer", () => {
  test("includes events where the player is the victim OR a killer, excludes unrelated", () => {
    const events = [
      ev("a", "5", ["9"], 100), // 5 is victim
      ev("b", "7", ["5"], 200), // 5 is a killer
      ev("c", "8", ["9"], 300), // unrelated to 5
    ];
    const out = eliminationEventsForPlayer("5", events);
    expect(out.map((e) => e.eventId)).toEqual(["a", "b"]);
  });

  test("orders chronologically by recordedAt (earliest first), not by eventId", () => {
    const events = [
      ev("zzz", "5", ["1"], 300),
      ev("aaa", "5", ["2"], 100),
      ev("mmm", "5", ["3"], 200),
    ];
    const out = eliminationEventsForPlayer("5", events);
    expect(out.map((e) => e.recordedAt)).toEqual([100, 200, 300]);
    expect(out.map((e) => e.eventId)).toEqual(["aaa", "mmm", "zzz"]);
  });

  test("legacy events without recordedAt sort first (treated as 0) and pass through as null", () => {
    const events = [
      ev("new", "5", ["1"], 500),
      ev("legacy", "5", ["2"], undefined),
    ];
    const out = eliminationEventsForPlayer("5", events);
    expect(out.map((e) => e.eventId)).toEqual(["legacy", "new"]);
    expect(out[0]!.recordedAt).toBeNull();
    expect(out[1]!.recordedAt).toBe(500);
  });

  test("ties on recordedAt are broken by eventId for a stable order", () => {
    const events = [
      ev("b", "5", ["1"], 100),
      ev("a", "5", ["2"], 100),
    ];
    const out = eliminationEventsForPlayer("5", events);
    expect(out.map((e) => e.eventId)).toEqual(["a", "b"]);
  });

  test("copies killerPlayerIds (no shared reference with the input)", () => {
    const killers = ["9"];
    const events = [ev("a", "5", killers, 100)];
    const out = eliminationEventsForPlayer("5", events);
    expect(out[0]!.killerPlayerIds).toEqual(["9"]);
    expect(out[0]!.killerPlayerIds).not.toBe(killers);
  });
});
