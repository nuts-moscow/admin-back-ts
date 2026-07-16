import { describe, expect, test } from "bun:test";
import type { BlindType } from "../../domain/BlindType";
import { isPastLateRegBreak } from "./TournamentClockService";
import {
  advanceClockWhileElapsed,
  initialStateFromFirstStep,
} from "./tournamentClockCompute";

function blind(id: number, level: number): BlindType {
  return {
    type: "Blind",
    id,
    level,
    smallBlind: 100 * level,
    bigBlind: 200 * level,
    ante: false,
    duration: 20,
  };
}

function brk(id: number, endsLateRegistration?: boolean): BlindType {
  return { type: "Break", id, duration: 15, endsLateRegistration };
}

// L1, L2, flagged break, L3, plain break, L4
const BLINDS: BlindType[] = [
  blind(1, 1),
  blind(2, 2),
  brk(3, true),
  blind(4, 3),
  brk(5),
  blind(6, 4),
];

describe("isPastLateRegBreak (late reg closes at the flagged break's END)", () => {
  test("before the flagged break → open", () => {
    expect(isPastLateRegBreak(BLINDS, 0, false)).toBe(false);
    expect(isPastLateRegBreak(BLINDS, 1, false)).toBe(false);
  });

  test("standing ON the flagged break → still open (the last entry window)", () => {
    expect(isPastLateRegBreak(BLINDS, 2, false)).toBe(false);
  });

  test("first step past the flagged break → closed", () => {
    expect(isPastLateRegBreak(BLINDS, 3, false)).toBe(true);
    expect(isPastLateRegBreak(BLINDS, 5, false)).toBe(true);
  });

  test("schedule finished while standing on the flagged break → closed", () => {
    const ending: BlindType[] = [blind(1, 1), brk(2, true)];
    expect(isPastLateRegBreak(ending, 1, false)).toBe(false);
    expect(isPastLateRegBreak(ending, 1, true)).toBe(true);
  });

  test("no flagged break in the structure → never auto-closes", () => {
    const noFlag: BlindType[] = [blind(1, 1), brk(2), blind(3, 2)];
    expect(isPastLateRegBreak(noFlag, 2, false)).toBe(false);
    expect(isPastLateRegBreak(noFlag, 2, true)).toBe(false);
  });

  // A segment rolls on the first tick at/after its end, and the new segment
  // starts at that tick — so the clock is driven by per-segment ticks here,
  // as the ~1 Hz production loop does.
  function tickTo(
    state: ReturnType<typeof initialStateFromFirstStep>,
    now: number
  ) {
    return advanceClockWhileElapsed(state!, BLINDS, now);
  }

  test("a pause on the flagged break freezes the clock and keeps reg open", () => {
    const t0 = 1_000_000;
    let state = initialStateFromFirstStep(BLINDS, t0)!;
    let now = t0 + 20 * 60_000;
    state = tickTo(state, now); // → L2
    now += 20 * 60_000;
    state = tickTo(state, now); // → flagged break
    expect(state.currentStepIndex).toBe(2);
    expect(isPastLateRegBreak(BLINDS, state.currentStepIndex, state.finished)).toBe(false);

    // paused mid-break: even hours later the step must not roll over
    const paused = { ...state, pauseBeganAtMs: now + 60_000 };
    const muchLater = now + 6 * 60 * 60_000;
    const after = advanceClockWhileElapsed(paused, BLINDS, muchLater);
    expect(after.currentStepIndex).toBe(2);
    expect(isPastLateRegBreak(BLINDS, after.currentStepIndex, after.finished)).toBe(false);
  });

  test("clock rolling off the flagged break flips the predicate exactly then", () => {
    const t0 = 1_000_000;
    let state = initialStateFromFirstStep(BLINDS, t0)!;
    let now = t0 + 20 * 60_000;
    state = tickTo(state, now); // → L2
    now += 20 * 60_000;
    state = tickTo(state, now); // → flagged break
    expect(state.currentStepIndex).toBe(2);

    // one second before the break ends: still open
    state = tickTo(state, now + 15 * 60_000 - 1_000);
    expect(state.currentStepIndex).toBe(2);
    expect(isPastLateRegBreak(BLINDS, state.currentStepIndex, state.finished)).toBe(false);

    // the tick at the break's end rolls to L3: now closed
    state = tickTo(state, now + 15 * 60_000);
    expect(state.currentStepIndex).toBe(3);
    expect(isPastLateRegBreak(BLINDS, state.currentStepIndex, state.finished)).toBe(true);
  });
});
