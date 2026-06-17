/** Blind or break step type for clock ticks */
export type TournamentClockStepType = "Blind" | "Break";

/** Tournament lifecycle status for clock API (matches DB tournament.status) */
export type TournamentClockTournamentStatus =
  | "registration_open"
  | "in_progress"
  | "completed";

/**
 * Persisted tournament clock segment (Redis).
 * `pauseBeganAtMs` null means clock is running (subject to effective time for ticks).
 */
export interface TournamentClockRedisState {
  currentStepIndex: number;
  currentStepId: number;
  segmentStartedAtMs: number;
  segmentEndAtMs: number;
  pauseBeganAtMs: number | null;
  /** True when all blind/break steps have elapsed */
  finished: boolean;
}

/**
 * WebSocket payload (~1 Hz) and REST snapshot shape.
 */
export interface TournamentClockTick {
  type: "tournament_clock_tick";
  tournamentId: number;
  serverTimeMs: number;
  tournamentStatus: TournamentClockTournamentStatus;
  /** False when tournament is not in_progress or no clock state */
  clockActive: boolean;
  paused: boolean;
  /** Present when clock is active */
  currentStepIndex: number | null;
  stepType: TournamentClockStepType | null;
  levelId: number | null;
  /**
   * Seconds until end of current step; null when clock inactive.
   * Zero when segment ended or structure finished.
   */
  secondsRemaining: number | null;
  /**
   * Seconds until the start of the next `Break` step after `currentStepIndex`.
   * `null` when clock inactive, schedule finished, or no later break in the structure.
   */
  secondsUntilNextBreak: number | null;
  /** True when the blinds schedule has fully elapsed */
  structureFinished: boolean;
  /** True once late registration is closed for this tournament. */
  lateRegistrationClosed: boolean;
  /**
   * True when the live screen should display rating points — set when the clock
   * has reached a Break flagged `endsLateRegistration` (late reg just closed).
   */
  showRatingPoints: boolean;
}
