import { describe, expect, test } from "bun:test";
import type { BlindType } from "../../domain/BlindType";
import type { TournamentClockRedisState } from "../../domain/TournamentClockState";
import {
  getSecondsRemaining,
  reconcileAfterStructureChange,
} from "./tournamentClockCompute";

const T0 = 1_000_000_000_000;
const MIN = 60_000;

function blind(id: number, durationMin: number): BlindType {
  return {
    type: "Blind",
    level: 1,
    id,
    smallBlind: 100,
    bigBlind: 200,
    ante: false,
    duration: durationMin,
  };
}

/** Running level: 20-min level, 3 min already elapsed. */
function runningState(stepId: number): TournamentClockRedisState {
  return {
    currentStepIndex: 0,
    currentStepId: stepId,
    segmentStartedAtMs: T0,
    segmentEndAtMs: T0 + 20 * MIN,
    pauseBeganAtMs: null,
    finished: false,
  };
}

const now = T0 + 3 * MIN; // 3 minutes into the level

describe("reconcileAfterStructureChange — duration edit on the running level", () => {
  test("id preserved (main case): extend 20→22 → remaining = 22-3 = 19 min", () => {
    const state = runningState(1);
    const next = reconcileAfterStructureChange(state, [blind(1, 22)], now);
    expect(getSecondsRemaining(next, now)).toBe(19 * 60);
  });

  test("id changed but same position (fallback fix): extend 20→22 → remaining = 19 min, not capped at 17", () => {
    const state = runningState(1);
    // structure editor regenerated the id → 99 no longer matches any blind id
    const next = reconcileAfterStructureChange(state, [blind(99, 22)], now);
    expect(getSecondsRemaining(next, now)).toBe(19 * 60);
    // elapsed is preserved (segment start unchanged)
    expect(next.segmentStartedAtMs).toBe(T0);
  });

  test("id changed, shrink below elapsed (2 min): remaining clamps to 0", () => {
    const state = runningState(1);
    const next = reconcileAfterStructureChange(state, [blind(99, 2)], now);
    expect(getSecondsRemaining(next, now)).toBe(0);
  });

  test("position no longer exists (different index): segment restarts, capped at old remaining (~17 min)", () => {
    const state: TournamentClockRedisState = { ...runningState(99), currentStepIndex: 1 };
    const next = reconcileAfterStructureChange(state, [blind(1, 22)], now);
    // old remaining was 17 min; reset caps at it (not the new 22-min duration)
    expect(getSecondsRemaining(next, now)).toBe(17 * 60);
  });
});
