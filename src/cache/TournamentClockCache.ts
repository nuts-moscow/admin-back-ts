import type { TournamentClockRedisState } from "../domain/TournamentClockState";
import { logger } from "../logger";
import { RedisClient } from "../redis";

const KEY_PREFIX = "nuts.api.data.tournament.clock";
const LOG_PREFIX = "[TournamentClockCache]";

function key(tournamentId: string): string {
  return `${KEY_PREFIX}.${tournamentId}`;
}

function pauseToField(v: number | null): string {
  return v === null ? "" : String(v);
}

function pauseFromField(s: string | undefined): number | null {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseHash(hash: Record<string, string>): TournamentClockRedisState | null {
  try {
    const currentStepIndex = Number(hash.currentStepIndex);
    const currentStepId = Number(hash.currentStepId);
    const segmentStartedAtMs = Number(hash.segmentStartedAtMs);
    const segmentEndAtMs = Number(hash.segmentEndAtMs);
    const finished = hash.finished === "1" || hash.finished === "true";
    if (
      !Number.isFinite(currentStepIndex) ||
      !Number.isFinite(currentStepId) ||
      !Number.isFinite(segmentStartedAtMs) ||
      !Number.isFinite(segmentEndAtMs)
    ) {
      return null;
    }
    return {
      currentStepIndex,
      currentStepId,
      segmentStartedAtMs,
      segmentEndAtMs,
      pauseBeganAtMs: pauseFromField(hash.pauseBeganAtMs),
      finished,
    };
  } catch {
    return null;
  }
}

function stateToFlatRecord(
  state: TournamentClockRedisState
): Record<string, string> {
  return {
    currentStepIndex: String(state.currentStepIndex),
    currentStepId: String(state.currentStepId),
    segmentStartedAtMs: String(state.segmentStartedAtMs),
    segmentEndAtMs: String(state.segmentEndAtMs),
    pauseBeganAtMs: pauseToField(state.pauseBeganAtMs),
    finished: state.finished ? "1" : "0",
  };
}

/** Redis persistence for per-tournament blind clock segment state */
export interface TournamentClockCache {
  /**
   * Loads clock state for a tournament.
   * @param tournamentId - Tournament ID string
   * @returns Parsed state or null if missing/invalid
   */
  get(tournamentId: string): Promise<TournamentClockRedisState | null>;

  /**
   * Persists clock state.
   * @param tournamentId - Tournament ID string
   * @param state - Segment state to store
   * @returns true if stored
   */
  set(
    tournamentId: string,
    state: TournamentClockRedisState
  ): Promise<boolean>;

  /**
   * Removes clock state (e.g. tournament completed).
   * @param tournamentId - Tournament ID string
   */
  delete(tournamentId: string): Promise<void>;
}

class TournamentClockCacheImpl implements TournamentClockCache {
  async get(tournamentId: string): Promise<TournamentClockRedisState | null> {
    logger.info({ tournamentId }, `${LOG_PREFIX} get entry`);
    try {
      const hash = await RedisClient.instance.hgetall(key(tournamentId));
      if (!hash || Object.keys(hash).length === 0) {
        logger.info({ tournamentId }, `${LOG_PREFIX} get result: miss`);
        return null;
      }
      const parsed = parseHash(hash as Record<string, string>);
      logger.info(
        { tournamentId, hit: !!parsed },
        `${LOG_PREFIX} get result`
      );
      return parsed;
    } catch (err) {
      logger.info({ err, tournamentId }, `${LOG_PREFIX} get failed`);
      return null;
    }
  }

  async set(
    tournamentId: string,
    state: TournamentClockRedisState
  ): Promise<boolean> {
    logger.info(
      {
        tournamentId,
        currentStepIndex: state.currentStepIndex,
        finished: state.finished,
      },
      `${LOG_PREFIX} set entry`
    );
    try {
      const k = key(tournamentId);
      const flat = stateToFlatRecord(state);
      await RedisClient.instance.del(k);
      await RedisClient.instance.hset(k, flat);
      logger.info(`${LOG_PREFIX} set result: stored`);
      return true;
    } catch (err) {
      logger.info({ err, tournamentId }, `${LOG_PREFIX} set failed`);
      return false;
    }
  }

  async delete(tournamentId: string): Promise<void> {
    logger.info({ tournamentId }, `${LOG_PREFIX} delete entry`);
    try {
      await RedisClient.instance.del(key(tournamentId));
      logger.info(`${LOG_PREFIX} delete result: ok`);
    } catch (err) {
      logger.info({ err, tournamentId }, `${LOG_PREFIX} delete failed`);
    }
  }
}

export const tournamentClockCache: TournamentClockCache =
  new TournamentClockCacheImpl();
