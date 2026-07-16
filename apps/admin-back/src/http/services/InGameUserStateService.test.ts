import { describe, expect, test } from "bun:test";
import type { BountyEliminationEventRecord } from "../../cache/BountyEliminationEventsCache";
import {
  InGamePlayerStatus,
  type InGameUserState,
  initInGameUserState,
} from "../../domain/cache/InGameUserState";
import {
  computeChipPoolSummaryFromStates,
  eliminationEventsForPlayer,
} from "./InGameUserStateService";

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

describe("computeChipPoolSummaryFromStates (averageStack accounting)", () => {
  const STACK = 30_000;

  function state(overrides: Partial<InGameUserState>): InGameUserState {
    return { ...initInGameUserState("p", 1, 0, 0), ...overrides };
  }

  test("counts base entries + rebuys + bonuses and subtracts burned stacks", () => {
    const states: InGameUserState[] = [
      // active, one custom bonus chip grant
      state({
        playerId: "1",
        status: InGamePlayerStatus.InGamePaid,
        customBonusChips: [10_000],
      }),
      // active, rebought twice
      state({
        playerId: "2",
        status: InGamePlayerStatus.InGamePaid,
        totalReentryCount: 2,
      }),
      // busted (Out), had rebought once, burned 5k off the pool
      state({
        playerId: "3",
        status: InGamePlayerStatus.Out,
        totalReentryCount: 1,
        burnedStackEvents: [{ chips: 5_000, source: "Out" }],
      }),
    ];

    const s = computeChipPoolSummaryFromStates(states, STACK);

    expect(s.entryUnits).toBe(3); // 3 players arrived
    expect(s.rebuyCount).toBe(3); // 2 + 1 rebuys counted
    expect(s.baseChips).toBe(6 * STACK); // (3 entries + 3 rebuys) * stack
    expect(s.bonusChipsTotal).toBe(10_000);
    expect(s.burnedStackChipsTotal).toBe(5_000);
    expect(s.totalChips).toBe(6 * STACK + 10_000 - 5_000); // 185_000
    expect(s.playersActive).toBe(2); // Out excluded from the denominator
    // Rebuys are in the pool: 185_000 / 2 active = 92_500 (not 47_500 if rebuys were dropped)
    expect(s.averageStack).toBe(92_500);
  });

  test("a pure add-on rebuy raises the average (rebuy chips reach the pool)", () => {
    const s = computeChipPoolSummaryFromStates(
      [
        state({
          playerId: "1",
          status: InGamePlayerStatus.InGamePaid,
          totalReentryCount: 3,
        }),
        state({ playerId: "2", status: InGamePlayerStatus.InGamePaid }),
      ],
      STACK
    );
    // (2 entries + 3 rebuys) * stack / 2 active = 150_000 / 2
    expect(s.averageStack).toBe(75_000);
  });

  test("a pool not divisible by the active count rounds to a whole chip", () => {
    const s = computeChipPoolSummaryFromStates(
      [
        state({ playerId: "1", status: InGamePlayerStatus.InGamePaid }),
        state({ playerId: "2", status: InGamePlayerStatus.InGamePaid }),
        state({ playerId: "3", status: InGamePlayerStatus.InGamePaid }),
        state({
          playerId: "4",
          status: InGamePlayerStatus.InGamePaid,
          customBonusChips: [10_000],
        }),
        state({
          playerId: "5",
          status: InGamePlayerStatus.InGamePaid,
          totalReentryCount: 1,
        }),
        state({
          playerId: "6",
          status: InGamePlayerStatus.InGamePaid,
          burnedStackEvents: [{ chips: 5_000, source: "Out" }],
        }),
        state({ playerId: "7", status: InGamePlayerStatus.InGamePaid }),
      ],
      STACK
    );
    // (7 entries + 1 rebuy) * 30k + 10k - 5k = 245_000; / 7 active = 35_000.714…
    expect(s.averageStack).toBe(35_000);
    expect(Number.isInteger(s.averageStack)).toBe(true);
  });

  test("no active players → null average", () => {
    const s = computeChipPoolSummaryFromStates(
      [
        state({
          playerId: "1",
          status: InGamePlayerStatus.Out,
          totalReentryCount: 1,
        }),
      ],
      STACK
    );
    expect(s.averageStack).toBeNull();
  });
});
