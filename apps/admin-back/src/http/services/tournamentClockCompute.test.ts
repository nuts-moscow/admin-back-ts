import { describe, expect, test } from "bun:test";
import type { BlindType } from "../../domain/BlindType";
import type { TournamentClockRedisState } from "../../domain/TournamentClockState";
import {
  advanceClockWhileElapsed,
  getSecondsRemaining,
  getSecondsUntilNextBreak,
  initialStateFromFirstStep,
  reconcileAfterStructureChange,
} from "./tournamentClockCompute";

function breakStep(id: number, durationMin: number): BlindType {
  return { type: "Break", id, duration: durationMin };
}

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

describe("getSecondsRemaining", () => {
  test("running clock counts down from segmentEndAtMs", () => {
    const state = runningState(1);
    expect(getSecondsRemaining(state, now)).toBe(17 * 60);
  });

  test("paused clock is frozen at pauseBeganAtMs, ignoring real now", () => {
    const state: TournamentClockRedisState = {
      ...runningState(1),
      pauseBeganAtMs: T0 + 2 * MIN, // paused 2 min in
    };
    // real now is far in the future, but remaining stays 20-2 = 18 min
    expect(getSecondsRemaining(state, T0 + 5_000_000)).toBe(18 * 60);
  });

  test("never negative once the segment has ended", () => {
    const state = runningState(1);
    expect(getSecondsRemaining(state, T0 + 99 * MIN)).toBe(0);
  });
});

describe("initialStateFromFirstStep", () => {
  test("builds a running segment from the first step", () => {
    const s = initialStateFromFirstStep([blind(7, 15), blind(8, 15)], T0);
    expect(s).not.toBeNull();
    expect(s!.currentStepIndex).toBe(0);
    expect(s!.currentStepId).toBe(7);
    expect(s!.segmentStartedAtMs).toBe(T0);
    expect(s!.segmentEndAtMs).toBe(T0 + 15 * MIN);
    expect(s!.pauseBeganAtMs).toBeNull();
    expect(s!.finished).toBe(false);
  });

  test("returns null for an empty structure", () => {
    expect(initialStateFromFirstStep([], T0)).toBeNull();
  });
});

describe("advanceClockWhileElapsed", () => {
  const blinds: BlindType[] = [blind(1, 10), blind(2, 10), breakStep(3, 5)];

  test("does not advance while the current segment is still running", () => {
    const state = initialStateFromFirstStep(blinds, T0)!;
    const next = advanceClockWhileElapsed(state, blinds, T0 + 5 * MIN);
    expect(next).toEqual(state); // unchanged value
    expect(next.currentStepIndex).toBe(0);
  });

  test("advances to the next step once the current one elapsed", () => {
    const state = initialStateFromFirstStep(blinds, T0)!;
    const at = T0 + 11 * MIN; // past level 1 (10 min)
    const next = advanceClockWhileElapsed(state, blinds, at);
    expect(next.currentStepIndex).toBe(1);
    expect(next.currentStepId).toBe(2);
    expect(next.segmentStartedAtMs).toBe(at);
    expect(next.segmentEndAtMs).toBe(at + 10 * MIN);
    expect(next.finished).toBe(false);
  });

  test("finishes when the last step has elapsed", () => {
    const state: TournamentClockRedisState = {
      currentStepIndex: 2,
      currentStepId: 3,
      segmentStartedAtMs: T0,
      segmentEndAtMs: T0, // already ended
      pauseBeganAtMs: null,
      finished: false,
    };
    const at = T0 + 1 * MIN;
    const next = advanceClockWhileElapsed(state, blinds, at);
    expect(next.finished).toBe(true);
    expect(next.currentStepIndex).toBe(2);
  });

  test("does nothing while paused", () => {
    const state: TournamentClockRedisState = {
      ...initialStateFromFirstStep(blinds, T0)!,
      pauseBeganAtMs: T0 + 1 * MIN,
    };
    const next = advanceClockWhileElapsed(state, blinds, T0 + 99 * MIN);
    expect(next).toBe(state);
    expect(next.currentStepIndex).toBe(0);
  });
});

describe("getSecondsUntilNextBreak", () => {
  const blinds: BlindType[] = [blind(1, 10), blind(2, 10), breakStep(3, 5)];

  test("sums remaining of current level plus full intermediate levels until the break", () => {
    const state = initialStateFromFirstStep(blinds, T0)!; // index 0, 10 min remaining
    // remaining of level 1 (600s) + full level 2 (600s) = 1200s until the break
    expect(getSecondsUntilNextBreak(state, blinds, T0)).toBe(1200);
  });

  test("null when there is no later break", () => {
    const state: TournamentClockRedisState = {
      ...initialStateFromFirstStep(blinds, T0)!,
      currentStepIndex: 2,
      currentStepId: 3,
    };
    expect(getSecondsUntilNextBreak(state, blinds, T0)).toBeNull();
  });
});
