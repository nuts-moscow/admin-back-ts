import type { BlindType } from "../../domain/BlindType";
import type { TournamentClockRedisState } from "../../domain/TournamentClockState";

/** Structure stores `duration` in minutes; clock uses whole seconds. */
export function stepDurationSec(step: BlindType): number {
  return Math.max(0, step.duration * 60);
}

export function getEffectiveNowMs(
  state: TournamentClockRedisState,
  realNowMs: number
): number {
  if (state.pauseBeganAtMs !== null) {
    return state.pauseBeganAtMs;
  }
  return realNowMs;
}

export function getSecondsRemaining(
  state: TournamentClockRedisState,
  realNowMs: number
): number {
  const nowEff = getEffectiveNowMs(state, realNowMs);
  return Math.max(0, Math.ceil((state.segmentEndAtMs - nowEff) / 1000));
}

/**
 * Seconds from effective tournament time until the start of the next `Break`
 * after `currentStepIndex`. Uses same pause semantics as `getSecondsRemaining`.
 */
export function getSecondsUntilNextBreak(
  state: TournamentClockRedisState,
  blinds: BlindType[],
  realNowMs: number
): number | null {
  if (state.finished || blinds.length === 0) return null;
  const i = state.currentStepIndex;
  if (i < 0 || i >= blinds.length) return null;

  let breakIndex = -1;
  for (let j = i + 1; j < blinds.length; j++) {
    if (blinds[j]!.type === "Break") {
      breakIndex = j;
      break;
    }
  }
  if (breakIndex < 0) return null;

  let total = getSecondsRemaining(state, realNowMs);
  for (let j = i + 1; j < breakIndex; j++) {
    total += stepDurationSec(blinds[j]!);
  }
  return Math.max(0, Math.ceil(total));
}

/**
 * Advances past completed segments while the clock is running (not paused), not finished.
 * When `pauseBeganAtMs` is set, returns `state` unchanged so level/break does not roll until resume.
 * Mutates a shallow copy semantics — returns a new state object when advancing.
 */
export function advanceClockWhileElapsed(
  state: TournamentClockRedisState,
  blinds: BlindType[],
  realNowMs: number
): TournamentClockRedisState {
  if (
    state.finished ||
    state.pauseBeganAtMs !== null ||
    blinds.length === 0
  ) {
    return state;
  }

  let cur: TournamentClockRedisState = { ...state };
  let guard = 0;
  const maxSteps = Math.max(blinds.length * 2, 8);

  while (
    guard < maxSteps &&
    !cur.finished &&
    cur.pauseBeganAtMs === null &&
    realNowMs >= cur.segmentEndAtMs
  ) {
    guard++;
    const nextIndex = cur.currentStepIndex + 1;
    if (nextIndex >= blinds.length) {
      const last = blinds[blinds.length - 1];
      return {
        ...cur,
        finished: true,
        currentStepIndex: blinds.length - 1,
        currentStepId: last ? last.id : cur.currentStepId,
        segmentEndAtMs: realNowMs,
        segmentStartedAtMs: cur.segmentStartedAtMs,
      };
    }
    const step = blinds[nextIndex]!;
    const dur = stepDurationSec(step);
    cur = {
      ...cur,
      currentStepIndex: nextIndex,
      currentStepId: step.id,
      segmentStartedAtMs: realNowMs,
      segmentEndAtMs: realNowMs + dur * 1000,
    };
  }

  return cur;
}

/**
 * Reconcile clock after blindsStructure JSON changed.
 */
export function reconcileAfterStructureChange(
  state: TournamentClockRedisState,
  blinds: BlindType[],
  realNowMs: number
): TournamentClockRedisState {
  if (blinds.length === 0) {
    return {
      ...state,
      finished: true,
      currentStepIndex: 0,
      currentStepId: state.currentStepId,
      segmentStartedAtMs: realNowMs,
      segmentEndAtMs: realNowMs,
    };
  }

  const nowEff = getEffectiveNowMs(state, realNowMs);
  const R = Math.max(
    0,
    Math.ceil((state.segmentEndAtMs - nowEff) / 1000)
  );
  const oldIndex = state.currentStepIndex;

  const foundIdx = blinds.findIndex((b) => b.id === state.currentStepId);
  if (foundIdx >= 0) {
    const step = blinds[foundIdx]!;
    const newDur = stepDurationSec(step);
    const candidateEnd = state.segmentStartedAtMs + newDur * 1000;
    let segmentEndAtMs = state.segmentEndAtMs;
    if (candidateEnd > segmentEndAtMs) {
      segmentEndAtMs = candidateEnd;
    } else if (candidateEnd < segmentEndAtMs) {
      segmentEndAtMs = Math.max(candidateEnd, nowEff);
    }
    return {
      ...state,
      currentStepIndex: foundIdx,
      currentStepId: step.id,
      segmentEndAtMs,
    };
  }

  const j = Math.min(Math.max(0, oldIndex), blinds.length - 1);
  const step = blinds[j]!;
  const stepDur = stepDurationSec(step);
  // Still on the current level — its id changed (e.g. the editor regenerated ids)
  // but the position didn't. Preserve real elapsed time and recompute the end
  // from the original segment start, so a duration edit yields
  // remaining = newDuration - elapsed (same as the id-matched main case above)
  // instead of capping at the old remaining (which looked like "no update").
  if (j === oldIndex) {
    const candidateEnd = state.segmentStartedAtMs + stepDur * 1000;
    return {
      ...state,
      currentStepIndex: j,
      currentStepId: step.id,
      segmentEndAtMs: Math.max(candidateEnd, nowEff),
    };
  }
  // Genuinely a different level now occupies this slot: restart the segment now,
  // capped at the new step duration.
  const remainingCap = Math.min(R, stepDur);
  const segmentEndAtMs = nowEff + remainingCap * 1000;
  const segmentStartedAtMs = segmentEndAtMs - stepDur * 1000;
  return {
    ...state,
    currentStepIndex: j,
    currentStepId: step.id,
    segmentStartedAtMs,
    segmentEndAtMs,
  };
}

export function initialStateFromFirstStep(
  blinds: BlindType[],
  realNowMs: number
): TournamentClockRedisState | null {
  if (blinds.length === 0) return null;
  const step = blinds[0]!;
  const dur = stepDurationSec(step);
  return {
    currentStepIndex: 0,
    currentStepId: step.id,
    segmentStartedAtMs: realNowMs,
    segmentEndAtMs: realNowMs + dur * 1000,
    pauseBeganAtMs: null,
    finished: false,
  };
}
