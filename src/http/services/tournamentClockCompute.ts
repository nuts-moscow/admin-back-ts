import type { BlindType } from "../../domain/BlindType";
import type { TournamentClockRedisState } from "../../domain/TournamentClockState";

export function stepDurationSec(step: BlindType): number {
  return step.duration;
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
 * Advances past completed segments while not paused and not finished.
 * Mutates a shallow copy semantics — returns a new state object.
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
