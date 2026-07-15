import type { BlindType } from "../../domain/BlindType";
import type {
  TournamentClockRedisState,
  TournamentClockTick,
  TournamentClockTournamentStatus,
} from "../../domain/TournamentClockState";
import { tournamentClockCache, tournamentStructureCache } from "../../cache";
import { tournamentRepository } from "../../postgres";
import { TournamentAuditEventType } from "../../domain/TournamentAuditEventType";
import { logger } from "../../logger";
import {
  advanceClockWhileElapsed,
  getSecondsRemaining,
  getSecondsUntilNextBreak,
  initialStateFromFirstStep,
  reconcileAfterStructureChange,
} from "./tournamentClockCompute";
import { writeTournamentAuditLog } from "./tournamentAuditLog";

/** Index of the first Break flagged to end late registration, or -1 if none. */
function lateRegEndBreakIndex(blinds: BlindType[]): number {
  return blinds.findIndex(
    (b) => b.type === "Break" && b.endsLateRegistration === true
  );
}

/**
 * Late registration ends when the flagged break is OVER: the clock stands past
 * it, or the schedule finished while standing on it. Standing on the break
 * itself keeps registration open — the break is the last entry window.
 */
export function isPastLateRegBreak(
  blinds: BlindType[],
  currentStepIndex: number,
  finished: boolean
): boolean {
  const lateRegBreakIdx = lateRegEndBreakIndex(blinds);
  if (lateRegBreakIdx < 0) return false;
  if (currentStepIndex > lateRegBreakIdx) return true;
  return finished && currentStepIndex >= lateRegBreakIdx;
}

function stepTypeAt(
  blinds: BlindType[],
  index: number
): "Blind" | "Break" | null {
  const s = blinds[index];
  if (!s) return null;
  return s.type === "Break" ? "Break" : "Blind";
}

export type ClockMutationResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_found"
        | "no_clock"
        | "not_in_progress"
        | "bad_request"
        | "failed";
    };

export class TournamentClockService {
  /**
   * Creates clock state on first transition to in_progress if missing.
   */
  async ensureStarted(tournamentId: number): Promise<{ ok: boolean }> {
    const idStr = String(tournamentId);
    const existing = await tournamentClockCache.get(idStr);
    if (existing) return { ok: true };

    const structure = await tournamentStructureCache.get(idStr);
    if (!structure?.blindsStructure?.length) return { ok: false };

    const now = Date.now();
    const init = initialStateFromFirstStep(structure.blindsStructure, now);
    if (!init) return { ok: false };

    const stored = await tournamentClockCache.set(idStr, init);
    return { ok: stored };
  }

  async clearClock(tournamentId: number): Promise<void> {
    await tournamentClockCache.delete(String(tournamentId));
  }

  async reconcileAfterStructureChange(
    tournamentId: number
  ): Promise<{ ok: boolean }> {
    const idStr = String(tournamentId);
    const state = await tournamentClockCache.get(idStr);
    if (!state) return { ok: true };

    const structure = await tournamentStructureCache.get(idStr);
    if (!structure) return { ok: false };

    const now = Date.now();
    const next = reconcileAfterStructureChange(
      state,
      structure.blindsStructure,
      now
    );
    const advanced = advanceClockWhileElapsed(
      next,
      structure.blindsStructure,
      now
    );
    const saved = await tournamentClockCache.set(idStr, advanced);
    return { ok: saved };
  }

  async pause(tournamentId: number): Promise<ClockMutationResult> {
    const row = await tournamentRepository.findById(tournamentId);
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "in_progress") {
      return { ok: false, error: "not_in_progress" };
    }

    const idStr = String(tournamentId);
    const state = await tournamentClockCache.get(idStr);
    if (!state) return { ok: false, error: "no_clock" };
    if (state.finished) return { ok: false, error: "bad_request" };
    if (state.pauseBeganAtMs !== null) return { ok: true };

    const now = Date.now();
    const next: TournamentClockRedisState = {
      ...state,
      pauseBeganAtMs: now,
    };
    const ok = await tournamentClockCache.set(idStr, next);
    return ok ? { ok: true } : { ok: false, error: "failed" };
  }

  async resume(tournamentId: number): Promise<ClockMutationResult> {
    const row = await tournamentRepository.findById(tournamentId);
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "in_progress") {
      return { ok: false, error: "not_in_progress" };
    }

    const idStr = String(tournamentId);
    const state = await tournamentClockCache.get(idStr);
    if (!state) return { ok: false, error: "no_clock" };
    if (state.pauseBeganAtMs === null) return { ok: true };

    const now = Date.now();
    const pauseDelta = now - state.pauseBeganAtMs;
    const next: TournamentClockRedisState = {
      ...state,
      segmentEndAtMs: state.segmentEndAtMs + pauseDelta,
      pauseBeganAtMs: null,
    };
    const ok = await tournamentClockCache.set(idStr, next);
    return ok ? { ok: true } : { ok: false, error: "failed" };
  }

  async extendCurrentLevel(
    tournamentId: number,
    extendSec: number
  ): Promise<ClockMutationResult> {
    if (!Number.isFinite(extendSec) || extendSec <= 0) {
      return { ok: false, error: "bad_request" };
    }

    const row = await tournamentRepository.findById(tournamentId);
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "in_progress") {
      return { ok: false, error: "not_in_progress" };
    }

    const idStr = String(tournamentId);
    const state = await tournamentClockCache.get(idStr);
    if (!state) return { ok: false, error: "no_clock" };
    if (state.finished) return { ok: false, error: "bad_request" };

    const next: TournamentClockRedisState = {
      ...state,
      segmentEndAtMs: state.segmentEndAtMs + Math.floor(extendSec) * 1000,
    };
    const ok = await tournamentClockCache.set(idStr, next);
    return ok ? { ok: true } : { ok: false, error: "failed" };
  }

  /**
   * Advances elapsed segments for `in_progress` only, persists if needed, returns wire tick.
   * While paused (`pauseBeganAtMs`), segments do not advance; `secondsRemaining` stays frozen.
   */
  async getTick(tournamentId: number): Promise<TournamentClockTick | null> {
    const idStr = String(tournamentId);
    const row = await tournamentRepository.findById(tournamentId);
    if (!row) return null;

    const status = row.status as TournamentClockTournamentStatus;
    const now = Date.now();
    const structure = await tournamentStructureCache.get(idStr);
    const blinds = structure?.blindsStructure ?? [];

    if (status !== "in_progress") {
      return this.inactiveTick(
        tournamentId,
        status,
        now,
        row.lateRegistrationClosed
      );
    }

    let state = await tournamentClockCache.get(idStr);
    if (!state) {
      return {
        type: "tournament_clock_tick",
        tournamentId,
        serverTimeMs: now,
        tournamentStatus: status,
        clockActive: false,
        paused: false,
        currentStepIndex: null,
        stepType: null,
        levelId: null,
        secondsRemaining: null,
        secondsUntilNextBreak: null,
        structureFinished: false,
        lateRegistrationClosed: row.lateRegistrationClosed,
        showRatingPoints: false,
      };
    }

    const beforeJson = JSON.stringify(state);
    state = advanceClockWhileElapsed(state, blinds, now);
    if (JSON.stringify(state) !== beforeJson) {
      await tournamentClockCache.set(idStr, state);
    }

    const paused = state.pauseBeganAtMs !== null;
    const secRem = getSecondsRemaining(state, now);
    const idx = state.currentStepIndex;
    const stepType = stepTypeAt(blinds, idx);
    const secondsUntilNextBreak = getSecondsUntilNextBreak(state, blinds, now);

    // Auto-close late registration once the flagged Break has ENDED — the
    // break itself is the last entry window, so standing on it stays open.
    // Idempotent: guarded by the current flag.
    const reachedLateRegEnd = isPastLateRegBreak(blinds, idx, state.finished);
    let lateRegistrationClosed = row.lateRegistrationClosed;
    if (reachedLateRegEnd && !lateRegistrationClosed) {
      const updated = await tournamentRepository.updateLateRegistrationClosed(
        tournamentId,
        true
      );
      if (updated) {
        lateRegistrationClosed = true;
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.TournamentLateRegistrationClosed,
          { lateRegistrationClosed: true, reason: "auto", stepIndex: idx }
        );
        logger.info(
          { tournamentId, stepIndex: idx },
          "[TournamentClockService] auto-closed late registration after flagged break ended"
        );
      }
    }

    return {
      type: "tournament_clock_tick",
      tournamentId,
      serverTimeMs: now,
      tournamentStatus: status,
      clockActive: true,
      paused,
      currentStepIndex: idx,
      stepType,
      levelId: state.currentStepId,
      secondsRemaining: secRem,
      secondsUntilNextBreak,
      structureFinished: state.finished,
      lateRegistrationClosed,
      showRatingPoints: reachedLateRegEnd,
    };
  }

  private inactiveTick(
    tournamentId: number,
    status: TournamentClockTournamentStatus,
    now: number,
    lateRegistrationClosed: boolean
  ): TournamentClockTick {
    return {
      type: "tournament_clock_tick",
      tournamentId,
      serverTimeMs: now,
      tournamentStatus: status,
      clockActive: false,
      paused: false,
      currentStepIndex: null,
      stepType: null,
      levelId: null,
      secondsRemaining: null,
      secondsUntilNextBreak: null,
      structureFinished: false,
      lateRegistrationClosed,
      showRatingPoints: false,
    };
  }
}

export const tournamentClockService = new TournamentClockService();
