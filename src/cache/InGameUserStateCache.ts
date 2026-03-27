import { logger } from "../logger";
import { RedisClient } from "../redis";
import {
  EntryPaymentMethod,
  InGameBonus,
  initInGameUserState,
  InGamePlayerStatus,
  type BurnedStackEvent,
  type InGameUserState,
  type PlayerId,
  type ReentryByPaymentMethod,
  type BonusesByType,
  type TableId,
  type TournamentId,
} from "../domain/cache/InGameUserState";

const VALID_STATUSES = new Set<string>(
  Object.values(InGamePlayerStatus)
);
const VALID_ENTRY_PAYMENT_METHODS = new Set<string>(
  Object.values(EntryPaymentMethod)
);
const VALID_BONUSES = new Set<string>(Object.values(InGameBonus));

const TOURNAMENT_PLAYERS_BASE = "nuts.api.data.tournament.players.state";
const PLAYER_TOURNAMENTS_BASE = "nuts.api.data.player.tournaments";
const LOG_PREFIX = "[InGameUserStateCache]";

function key(tournamentId: TournamentId, playerId: PlayerId): string {
  return `${TOURNAMENT_PLAYERS_BASE}.${tournamentId}.${playerId}`;
}

function playerTournamentsKey(playerId: PlayerId): string {
  return `${PLAYER_TOURNAMENTS_BASE}.${playerId}`;
}

function keyPattern(tournamentId: TournamentId): string {
  return `${TOURNAMENT_PLAYERS_BASE}.${tournamentId}.*`;
}

function hasEarlyBirdInBonuses(bonuses: BonusesByType | null): boolean {
  if (!bonuses) return false;
  for (const [b, c] of bonuses) {
    if (b === InGameBonus.EarlyBird && c > 0) return true;
  }
  return false;
}

function bonusesToMap(pairs: BonusesByType | null): Map<InGameBonus, number> {
  const map = new Map<InGameBonus, number>();
  if (!pairs) return map;
  for (const [b, c] of pairs) {
    map.set(b, (map.get(b) ?? 0) + c);
  }
  return map;
}

function mapToBonuses(map: Map<InGameBonus, number>): BonusesByType | null {
  const entries = [...map.entries()].filter(([, c]) => c > 0);
  return entries.length === 0 ? null : entries;
}


function countFreeInReentryPairs(pairs: ReentryByPaymentMethod | null): number {
  if (!pairs) return 0;
  let n = 0;
  for (const [method, count] of pairs) {
    if (method === EntryPaymentMethod.Free) n += count;
  }
  return n;
}

/** Decrement freeReentryCount first, then tournamentFreeReentryCount; clamp to 0. */
function applyFreeReentryDelta(
  state: InGameUserState,
  delta: number
): { freeReentryCount: number; tournamentFreeReentryCount: number } {
  let free = Math.max(0, state.freeReentryCount);
  let tournament = Math.max(0, state.tournamentFreeReentryCount ?? 0);
  if (delta > 0) {
    while (delta > 0 && free > 0) {
      free--;
      delta--;
    }
    while (delta > 0 && tournament > 0) {
      tournament--;
      delta--;
    }
  } else if (delta < 0) {
    free += -delta;
  }
  return { freeReentryCount: free, tournamentFreeReentryCount: tournament };
}

/** Tournament-only free entry/reentry grants for fixed core player ids (see db/migrations/002_seed_core_players.sql). */
function applyCorePlayerTournamentGrants(playerId: PlayerId, state: InGameUserState): InGameUserState {
  const id = parseInt(playerId, 10);
  if (Number.isNaN(id)) return state;
  if (id >= 1 && id <= 3) {
    return {
      ...state,
      tournamentFreeEntryCount: 1,
      tournamentFreeReentryCount: 2,
    };
  }
  if (id === 4) {
    return {
      ...state,
      tournamentFreeEntryCount: 1,
      tournamentFreeReentryCount: 3,
    };
  }
  return state;
}

/** Cache for in-game user state by tournament and player */
export interface InGameUserStateCache {
  /**
   * Gets cached in-game user state by player and tournament.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @returns Cached state or null if miss/expired
   */
  get(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null>;

  /**
   * Atomically adds incoming bounty count to current state.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param bountyCountToAdd - Amount to add to current bountyCount
   * @returns Updated state or null if state does not exist or on error
   */
  updateBountyCount(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bountyCountToAdd: number
  ): Promise<InGameUserState | null>;

  /**
   * Gets all in-game user states for a tournament.
   * @param tournamentId - Tournament ID
   * @returns Array of states (empty array on miss/error)
   */
  getAllByTournament(tournamentId: TournamentId): Promise<InGameUserState[]>;

  /**
   * Adds player to tournament with init state (First20 when applicable). EarlyBird is not set here — use game-start with EarlyBirdFlag.
   * @param freeEntryCount - Free entry count from profile (default 0)
   * @param freeReentryCount - Free reentry count from profile (default 0)
   * @returns true if stored, false on error
   */
  addPlayerToTournament(
    playerId: PlayerId,
    tournamentId: TournamentId,
    freeEntryCount?: number,
    freeReentryCount?: number
  ): Promise<boolean>;

  /** Adds EarlyBird once if missing (e.g. game-start with EarlyBirdFlag). */
  ensureEarlyBirdBonusIfMissing(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null>;

  /**
   * Removes player from tournament (deletes state from cache).
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @returns true if removed, false if key did not exist or on error
   */
  removePlayerFromTournament(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<boolean>;

  /**
   * Adds count to totalReentryCount.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param count - Amount to add
   * @returns Updated state or null if state does not exist or on error
   */
  addReentryCount(
    playerId: PlayerId,
    tournamentId: TournamentId,
    count: number
  ): Promise<InGameUserState | null>;

  /**
   * Appends one burned-stack event (rebuy or bust-out).
   * @param chips - Non-negative integer; count burned this elimination
   * @param source - Rebuy vs Out (undo API only removes Rebuy entries)
   */
  appendBurnedStackEvent(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number,
    source: "Rebuy" | "Out"
  ): Promise<InGameUserState | null>;

  /**
   * Removes the last Rebuy-source event with matching chips (LIFO). Does not remove Out events.
   * @returns Updated state or null if no match or state missing
   */
  removeLastRebuyBurnedStackEventMatching(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null>;

  /**
   * Updates player status in tournament.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param status - New status
   * @returns Updated state or null if state does not exist or on error
   */
  updateStatus(
    playerId: PlayerId,
    tournamentId: TournamentId,
    status: InGamePlayerStatus
  ): Promise<InGameUserState | null>;

  /**
   * Updates player status and placement (e.g. when setting status to Out).
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param status - New status
   * @param placement - Placement (elimination order, 1 = first out)
   * @returns Updated state or null if state does not exist or on error
   */
  updateStatusAndPlacement(
    playerId: PlayerId,
    tournamentId: TournamentId,
    status: InGamePlayerStatus,
    placement: number | null
  ): Promise<InGameUserState | null>;

  /**
   * Updates entry payment method in tournament.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param entryPaymentMethod - New entry payment method, or null to clear
   * @returns Updated state or null if state does not exist or on error
   */
  updateEntryPaymentMethod(
    playerId: PlayerId,
    tournamentId: TournamentId,
    entryPaymentMethod: EntryPaymentMethod | null
  ): Promise<InGameUserState | null>;

  /**
   * Records reentry payment methods for existing reentries. Does NOT add to totalReentryCount
   * (reentries are added via addReentryCount / bounty eliminate). Only updates reentryByPaymentMethod.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param payments - List of payment methods (each adds 1 to that method's count)
   * @returns Updated state or null if state does not exist or on error
   */
  addReentryPayment(
    playerId: PlayerId,
    tournamentId: TournamentId,
    payments: EntryPaymentMethod[]
  ): Promise<InGameUserState | null>;

  /**
   * Replaces reentry payment methods with the full list. Length must equal totalReentryCount.
   */
  setReentryPaymentMethods(
    playerId: PlayerId,
    tournamentId: TournamentId,
    payments: EntryPaymentMethod[]
  ): Promise<InGameUserState | null>;

  /**
   * Updates player table ID in tournament.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param tableId - New table ID (empty string or null to clear)
   * @returns Updated state or null if state does not exist or on error
   */
  updateTableId(
    playerId: PlayerId,
    tournamentId: TournamentId,
    tableId: TableId | null
  ): Promise<InGameUserState | null>;

  /** Adds one instance of a game bonus to the player's tournament state (same type can repeat). */
  addBonusOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bonus: InGameBonus
  ): Promise<InGameUserState | null>;

  /** Removes one instance of a bonus type (count decremented by 1). Returns null if none to remove or no state. */
  removeBonusOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bonus: InGameBonus
  ): Promise<InGameUserState | null>;

  /** Appends one custom bonus grant (chips > 0). */
  addCustomBonusChips(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null>;

  /** Removes one grant equal to chips (last matching entry from the end). Returns null if not found or no state. */
  removeCustomBonusChipsOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null>;

  /**
   * Applies delta to tournament-only free entry count (clamp to >= 0). Only modifies state in Redis.
   */
  addTournamentFreeEntries(
    playerId: PlayerId,
    tournamentId: TournamentId,
    delta: number
  ): Promise<InGameUserState | null>;

  /**
   * Applies delta to tournament-only free reentry count (clamp to >= 0). Only modifies state in Redis.
   */
  addTournamentFreeReentries(
    playerId: PlayerId,
    tournamentId: TournamentId,
    delta: number
  ): Promise<InGameUserState | null>;

  /**
   * Syncs freeEntryCount from profile to all tournament states for this player.
   * Call after updating player's free_entry_count in DB.
   */
  syncPlayerFreeEntryCount(playerId: PlayerId, newCount: number): Promise<void>;

  /**
   * Syncs freeReentryCount from profile to all tournament states for this player.
   * Call after updating player's free_reentry_count in DB.
   */
  syncPlayerFreeReentryCount(playerId: PlayerId, newCount: number): Promise<void>;

  /**
   * Decrements one free entry (freeEntryCount first, then tournamentFreeEntryCount). Use when player pays entry with Free.
   */
  deductOneFreeEntry(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null>;

  /**
   * Increments freeEntryCount by 1. Use when player switches entry payment from Free to paid.
   */
  addBackOneFreeEntry(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null>;

  /**
   * Deletes all player state keys for the tournament and removes tournamentId from each player's tournaments set.
   */
  deleteAllForTournament(tournamentId: TournamentId): Promise<void>;
}

class InGameUserStateCacheImpl implements InGameUserStateCache {
  async get(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId }, `${LOG_PREFIX} InGameUserStateCache.get entry`);

    try {
      const k = key(tournamentId, playerId);
      const hash = await RedisClient.instance.hgetall(k);
      if (!hash || Object.keys(hash).length === 0) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.get result: miss (no data)`);
        return null;
      }
      const state = parseHashToState(hash, playerId);
      logger.info(
        { hit: !!state, playerId: state?.playerId, bountyCount: state?.bountyCount },
        `${LOG_PREFIX} InGameUserStateCache.get result`
      );
      return state;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.get failed`);
      return null;
    }
  }

  async updateBountyCount(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bountyCountToAdd: number
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId, bountyCountToAdd }, `${LOG_PREFIX} InGameUserStateCache.updateBountyCount entry`);

    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateBountyCount result: miss (key not found)`);
        return null;
      }
      const newBountyCount = await RedisClient.instance.hincrby(
        k,
        "bountyCount",
        bountyCountToAdd
      );
      const hash = await RedisClient.instance.hgetall(k);
      if (!hash || Object.keys(hash).length === 0) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateBountyCount result: miss (no data after incr)`);
        return null;
      }
      const state = parseHashToState(
        { ...hash, bountyCount: String(newBountyCount) },
        playerId
      );
      logger.info(
        { state: !!state, playerId: state?.playerId, bountyCount: state?.bountyCount },
        `${LOG_PREFIX} InGameUserStateCache.updateBountyCount result`
      );
      return state;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.updateBountyCount failed`);
      return null;
    }
  }

  private async set(
    playerId: PlayerId,
    tournamentId: TournamentId,
    state: InGameUserState
  ): Promise<boolean> {
    logger.info(
      { playerId, tournamentId, status: state.status, bountyCount: state.bountyCount },
      `${LOG_PREFIX} InGameUserStateCache.set entry`
    );

    try {
      const k = key(tournamentId, playerId);
      await RedisClient.instance.hset(k, {
        tournamentPlayerId: String(state.tournamentPlayerId),
        playerId: state.playerId,
        status: state.status,
        tableId: state.tableId ?? "",
        bountyCount: String(state.bountyCount),
        entryPaymentMethod: state.entryPaymentMethod ?? "",
        reentryByPaymentMethod: state.reentryByPaymentMethod === null ? "" : JSON.stringify(state.reentryByPaymentMethod),
        totalReentryCount: String(state.totalReentryCount),
        freeEntryCount: String(state.freeEntryCount),
        freeReentryCount: String(state.freeReentryCount),
        tournamentFreeEntryCount: String(state.tournamentFreeEntryCount ?? 0),
        tournamentFreeReentryCount: String(state.tournamentFreeReentryCount ?? 0),
        placement: state.placement === null ? "" : String(state.placement),
        bonuses: state.bonuses === null ? "" : JSON.stringify(state.bonuses),
        customBonusChips:
          state.customBonusChips.length === 0
            ? ""
            : JSON.stringify(state.customBonusChips),
        burnedStackEvents:
          state.burnedStackEvents.length === 0
            ? ""
            : JSON.stringify(state.burnedStackEvents),
      });
      logger.info(`${LOG_PREFIX} InGameUserStateCache.set result: stored`);
      return true;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.set failed`);
      return false;
    }
  }

  async getAllByTournament(tournamentId: TournamentId): Promise<InGameUserState[]> {
    logger.info({ tournamentId }, `${LOG_PREFIX} InGameUserStateCache.getAllByTournament entry`);

    try {
      const pattern = keyPattern(tournamentId);
      const keys = await RedisClient.instance.keys(pattern);
      const states: InGameUserState[] = [];

      for (const k of keys) {
        const playerId = k.split(".").pop() as PlayerId;
        const hash = await RedisClient.instance.hgetall(k);
        if (hash && Object.keys(hash).length > 0) {
          const state = parseHashToState(hash, playerId);
          if (state) states.push(state);
        }
      }

      states.sort((a, b) => a.tournamentPlayerId - b.tournamentPlayerId);

      logger.info(
        {
          count: states.length,
          players: states.map((s) => `${s.playerId}:${s.status}:totalReentry=${s.totalReentryCount}`),
        },
        `${LOG_PREFIX} InGameUserStateCache.getAllByTournament result`
      );
      return states;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.getAllByTournament failed`);
      return [];
    }
  }

  async addPlayerToTournament(
    playerId: PlayerId,
    tournamentId: TournamentId,
    freeEntryCount: number = 0,
    freeReentryCount: number = 0
  ): Promise<boolean> {
    logger.info(
      { playerId, tournamentId, freeEntryCount, freeReentryCount },
      `${LOG_PREFIX} InGameUserStateCache.addPlayerToTournament entry`
    );
    const existing = await this.getAllByTournament(tournamentId);
    const nextId =
      existing.length === 0
        ? 1
        : Math.max(...existing.map((s) => s.tournamentPlayerId)) + 1;
    let state = initInGameUserState(playerId, nextId, freeEntryCount, freeReentryCount);
    state = applyCorePlayerTournamentGrants(playerId, state);
    const bonuses: BonusesByType = [];
    if (nextId <= 20) {
      bonuses.push([InGameBonus.First20, 1]);
    }
    if (bonuses.length > 0) {
      state.bonuses = bonuses;
    }
    const result = await this.set(playerId, tournamentId, state);
    if (result) {
      try {
        await RedisClient.instance.sadd(playerTournamentsKey(playerId), tournamentId);
      } catch (err) {
        logger.info({ err }, `${LOG_PREFIX} addPlayerToTournament: failed to add player to tournaments set`);
      }
    }
    logger.info({ stored: result }, `${LOG_PREFIX} InGameUserStateCache.addPlayerToTournament result`);
    return result;
  }

  async ensureEarlyBirdBonusIfMissing(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null> {
    try {
      const state = await this.get(playerId, tournamentId);
      if (!state) return null;
      if (hasEarlyBirdInBonuses(state.bonuses)) {
        return state;
      }
      const newBonuses: BonusesByType = state.bonuses ? [...state.bonuses] : [];
      newBonuses.push([InGameBonus.EarlyBird, 1]);
      const newState: InGameUserState = { ...state, bonuses: newBonuses };
      const ok = await this.set(playerId, tournamentId, newState);
      return ok ? newState : null;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} ensureEarlyBirdBonusIfMissing failed`);
      return null;
    }
  }

  async removePlayerFromTournament(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<boolean> {
    logger.info({ playerId, tournamentId }, `${LOG_PREFIX} InGameUserStateCache.removePlayerFromTournament entry`);
    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info({ key: k }, `${LOG_PREFIX} InGameUserStateCache.removePlayerFromTournament result: key not found`);
        return false;
      }
      const deleted = await RedisClient.instance.del(k);
      const ok = deleted > 0;
      if (ok) {
        try {
          await RedisClient.instance.srem(playerTournamentsKey(playerId), tournamentId);
        } catch (e) {
          logger.info({ err: e }, `${LOG_PREFIX} removePlayerFromTournament: failed to remove from tournaments set`);
        }
      }
      logger.info({ key: k, removed: ok }, `${LOG_PREFIX} InGameUserStateCache.removePlayerFromTournament result`);
      return ok;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.removePlayerFromTournament failed`);
      return false;
    }
  }

  async addReentryCount(
    playerId: PlayerId,
    tournamentId: TournamentId,
    count: number
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId, count }, `${LOG_PREFIX} InGameUserStateCache.addReentryCount entry`);
    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.addReentryCount result: miss (key not found)`);
        return null;
      }
      const newTotalReentryCount = await RedisClient.instance.hincrby(
        k,
        "totalReentryCount",
        count
      );
      const hash = await RedisClient.instance.hgetall(k);
      if (!hash || Object.keys(hash).length === 0) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.addReentryCount result: miss (no data after incr)`);
        return null;
      }
      const state = parseHashToState(
        { ...hash, totalReentryCount: String(newTotalReentryCount) },
        playerId
      );
      logger.info(
        { state: !!state, totalReentryCount: state?.totalReentryCount },
        `${LOG_PREFIX} InGameUserStateCache.addReentryCount result`
      );
      return state;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.addReentryCount failed`);
      return null;
    }
  }

  async appendBurnedStackEvent(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number,
    source: "Rebuy" | "Out"
  ): Promise<InGameUserState | null> {
    logger.info(
      { playerId, tournamentId, chips, source },
      `${LOG_PREFIX} InGameUserStateCache.appendBurnedStackEvent entry`
    );
    if (!Number.isInteger(chips) || chips < 0) {
      logger.info({ chips }, `${LOG_PREFIX} InGameUserStateCache.appendBurnedStackEvent: invalid chips`);
      return null;
    }
    const state = await this.get(playerId, tournamentId);
    if (!state) {
      logger.info(`${LOG_PREFIX} InGameUserStateCache.appendBurnedStackEvent: miss`);
      return null;
    }
    const event: BurnedStackEvent = { chips, source };
    const newState: InGameUserState = {
      ...state,
      burnedStackEvents: [...state.burnedStackEvents, event],
    };
    const ok = await this.set(playerId, tournamentId, newState);
    logger.info({ stored: ok }, `${LOG_PREFIX} InGameUserStateCache.appendBurnedStackEvent result`);
    return ok ? newState : null;
  }

  async removeLastRebuyBurnedStackEventMatching(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null> {
    logger.info(
      { playerId, tournamentId, chips },
      `${LOG_PREFIX} InGameUserStateCache.removeLastRebuyBurnedStackEventMatching entry`
    );
    if (!Number.isInteger(chips) || chips < 0) {
      return null;
    }
    const state = await this.get(playerId, tournamentId);
    if (!state) return null;
    const events = state.burnedStackEvents;
    let idx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e != null && e.source === "Rebuy" && e.chips === chips) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      logger.info(
        { chips },
        `${LOG_PREFIX} InGameUserStateCache.removeLastRebuyBurnedStackEventMatching: no match`
      );
      return null;
    }
    const nextEvents = events.slice(0, idx).concat(events.slice(idx + 1));
    const newState: InGameUserState = { ...state, burnedStackEvents: nextEvents };
    const ok = await this.set(playerId, tournamentId, newState);
    return ok ? newState : null;
  }

  async updateStatus(
    playerId: PlayerId,
    tournamentId: TournamentId,
    status: (typeof InGamePlayerStatus)[keyof typeof InGamePlayerStatus]
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId, status }, `${LOG_PREFIX} InGameUserStateCache.updateStatus entry`);
    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateStatus result: miss (key not found)`);
        return null;
      }
      await RedisClient.instance.hset(k, "status", status);
      const hash = await RedisClient.instance.hgetall(k);
      if (!hash || Object.keys(hash).length === 0) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateStatus result: miss (no data)`);
        return null;
      }
      const state = parseHashToState(hash, playerId);
      logger.info({ state: !!state, status: state?.status }, `${LOG_PREFIX} InGameUserStateCache.updateStatus result`);
      return state;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.updateStatus failed`);
      return null;
    }
  }

  async updateStatusAndPlacement(
    playerId: PlayerId,
    tournamentId: TournamentId,
    status: (typeof InGamePlayerStatus)[keyof typeof InGamePlayerStatus],
    placement: number | null
  ): Promise<InGameUserState | null> {
    logger.info(
      { playerId, tournamentId, status, placement },
      `${LOG_PREFIX} InGameUserStateCache.updateStatusAndPlacement entry`
    );
    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateStatusAndPlacement result: miss (key not found)`);
        return null;
      }
      await RedisClient.instance.hset(k, {
        status,
        placement: placement === null ? "" : String(placement),
      });
      const hash = await RedisClient.instance.hgetall(k);
      if (!hash || Object.keys(hash).length === 0) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateStatusAndPlacement result: miss (no data)`);
        return null;
      }
      const state = parseHashToState(hash, playerId);
      logger.info(
        { state: !!state, status: state?.status, placement: state?.placement },
        `${LOG_PREFIX} InGameUserStateCache.updateStatusAndPlacement result`
      );
      return state;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.updateStatusAndPlacement failed`);
      return null;
    }
  }

  async updateEntryPaymentMethod(
    playerId: PlayerId,
    tournamentId: TournamentId,
    entryPaymentMethod: EntryPaymentMethod | null
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId, entryPaymentMethod }, `${LOG_PREFIX} InGameUserStateCache.updateEntryPaymentMethod entry`);
    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateEntryPaymentMethod result: miss (key not found)`);
        return null;
      }
      await RedisClient.instance.hset(k, "entryPaymentMethod", entryPaymentMethod ?? "");
      const hash = await RedisClient.instance.hgetall(k);
      if (!hash || Object.keys(hash).length === 0) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateEntryPaymentMethod result: miss (no data)`);
        return null;
      }
      const state = parseHashToState(hash, playerId);
      logger.info(
        { state: !!state, entryPaymentMethod: state?.entryPaymentMethod },
        `${LOG_PREFIX} InGameUserStateCache.updateEntryPaymentMethod result`
      );
      return state;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.updateEntryPaymentMethod failed`);
      return null;
    }
  }

  async addReentryPayment(
    playerId: PlayerId,
    tournamentId: TournamentId,
    payments: EntryPaymentMethod[]
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId, payments }, `${LOG_PREFIX} InGameUserStateCache.addReentryPayment entry`);
    try {
      const state = await this.get(playerId, tournamentId);
      if (!state) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.addReentryPayment result: miss (key not found)`);
        return null;
      }
      const current = state.reentryByPaymentMethod ?? [];
      const map = new Map<EntryPaymentMethod, number>();
      for (const [method, count] of current) {
        map.set(method, (map.get(method) ?? 0) + count);
      }
      const freeAdded = payments.filter((m) => m === EntryPaymentMethod.Free).length;
      for (const method of payments) {
        map.set(method, (map.get(method) ?? 0) + 1);
      }
      const updated: ReentryByPaymentMethod = Array.from(map.entries());
      const { freeReentryCount, tournamentFreeReentryCount } = applyFreeReentryDelta(
        state,
        freeAdded
      );
      const newState: InGameUserState = {
        ...state,
        reentryByPaymentMethod: updated,
        totalReentryCount: state.totalReentryCount,
        freeReentryCount,
        tournamentFreeReentryCount,
      };
      const ok = await this.set(playerId, tournamentId, newState);
      if (!ok) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.addReentryPayment result: failed to save`);
        return null;
      }
      logger.info(`${LOG_PREFIX} InGameUserStateCache.addReentryPayment result: updated`);
      return newState;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.addReentryPayment failed`);
      return null;
    }
  }

  async setReentryPaymentMethods(
    playerId: PlayerId,
    tournamentId: TournamentId,
    payments: EntryPaymentMethod[]
  ): Promise<InGameUserState | null> {
    const state = await this.get(playerId, tournamentId);
    if (!state) return null;
    if (payments.length !== state.totalReentryCount) return null;
    const oldFree = countFreeInReentryPairs(state.reentryByPaymentMethod);
    const newFree = payments.filter((p) => p === EntryPaymentMethod.Free).length;
    const delta = newFree - oldFree;
    const map = new Map<EntryPaymentMethod, number>();
    for (const method of payments) {
      map.set(method, (map.get(method) ?? 0) + 1);
    }
    const reentryByPaymentMethod: ReentryByPaymentMethod = Array.from(map.entries());
    const { freeReentryCount, tournamentFreeReentryCount } = applyFreeReentryDelta(state, delta);
    const newState: InGameUserState = {
      ...state,
      reentryByPaymentMethod,
      freeReentryCount,
      tournamentFreeReentryCount,
    };
    const ok = await this.set(playerId, tournamentId, newState);
    return ok ? newState : null;
  }

  async updateTableId(
    playerId: PlayerId,
    tournamentId: TournamentId,
    tableId: TableId | null
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId, tableId }, `${LOG_PREFIX} InGameUserStateCache.updateTableId entry`);
    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateTableId result: miss (key not found)`);
        return null;
      }
      await RedisClient.instance.hset(k, "tableId", tableId ?? "");
      const hash = await RedisClient.instance.hgetall(k);
      if (!hash || Object.keys(hash).length === 0) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateTableId result: miss (no data)`);
        return null;
      }
      const state = parseHashToState(hash, playerId);
      logger.info({ state: !!state, tableId: state?.tableId }, `${LOG_PREFIX} InGameUserStateCache.updateTableId result`);
      return state;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.updateTableId failed`);
      return null;
    }
  }

  async addBonusOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bonus: InGameBonus
  ): Promise<InGameUserState | null> {
    try {
      if (bonus === InGameBonus.Custom) return null;
      const state = await this.get(playerId, tournamentId);
      if (!state) return null;
      const map = bonusesToMap(state.bonuses);
      map.set(bonus, (map.get(bonus) ?? 0) + 1);
      const newBonuses = mapToBonuses(map);
      const newState: InGameUserState = { ...state, bonuses: newBonuses };
      const ok = await this.set(playerId, tournamentId, newState);
      return ok ? newState : null;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.addBonusOne failed`);
      return null;
    }
  }

  async removeBonusOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bonus: InGameBonus
  ): Promise<InGameUserState | null> {
    try {
      if (bonus === InGameBonus.Custom) return null;
      const state = await this.get(playerId, tournamentId);
      if (!state) return null;
      const map = bonusesToMap(state.bonuses);
      const current = map.get(bonus) ?? 0;
      if (current < 1) return null;
      const next = current - 1;
      if (next <= 0) {
        map.delete(bonus);
      } else {
        map.set(bonus, next);
      }
      const newBonuses = mapToBonuses(map);
      const newState: InGameUserState = { ...state, bonuses: newBonuses };
      const ok = await this.set(playerId, tournamentId, newState);
      return ok ? newState : null;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.removeBonusOne failed`);
      return null;
    }
  }

  async addCustomBonusChips(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null> {
    try {
      if (
        typeof chips !== "number" ||
        !Number.isInteger(chips) ||
        chips <= 0
      ) {
        return null;
      }
      const state = await this.get(playerId, tournamentId);
      if (!state) return null;
      const customBonusChips = [...state.customBonusChips, chips];
      const newState: InGameUserState = { ...state, customBonusChips };
      const ok = await this.set(playerId, tournamentId, newState);
      return ok ? newState : null;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.addCustomBonusChips failed`);
      return null;
    }
  }

  async removeCustomBonusChipsOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null> {
    try {
      if (
        typeof chips !== "number" ||
        !Number.isInteger(chips) ||
        chips <= 0
      ) {
        return null;
      }
      const state = await this.get(playerId, tournamentId);
      if (!state) return null;
      const arr = [...state.customBonusChips];
      let found = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] === chips) {
          found = i;
          break;
        }
      }
      if (found < 0) return null;
      arr.splice(found, 1);
      const newState: InGameUserState = { ...state, customBonusChips: arr };
      const ok = await this.set(playerId, tournamentId, newState);
      return ok ? newState : null;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} InGameUserStateCache.removeCustomBonusChipsOne failed`);
      return null;
    }
  }

  async addTournamentFreeEntries(
    playerId: PlayerId,
    tournamentId: TournamentId,
    delta: number
  ): Promise<InGameUserState | null> {
    const state = await this.get(playerId, tournamentId);
    if (!state) return null;
    const current = state.tournamentFreeEntryCount ?? 0;
    const newCount = Math.max(0, current + delta);
    const newState: InGameUserState = { ...state, tournamentFreeEntryCount: newCount };
    const ok = await this.set(playerId, tournamentId, newState);
    return ok ? newState : null;
  }

  async addTournamentFreeReentries(
    playerId: PlayerId,
    tournamentId: TournamentId,
    delta: number
  ): Promise<InGameUserState | null> {
    const state = await this.get(playerId, tournamentId);
    if (!state) return null;
    const current = state.tournamentFreeReentryCount ?? 0;
    const newCount = Math.max(0, current + delta);
    const newState: InGameUserState = { ...state, tournamentFreeReentryCount: newCount };
    const ok = await this.set(playerId, tournamentId, newState);
    return ok ? newState : null;
  }

  async syncPlayerFreeEntryCount(playerId: PlayerId, newCount: number): Promise<void> {
    try {
      const k = playerTournamentsKey(playerId);
      const tournamentIds = await RedisClient.instance.smembers(k);
      for (const tournamentId of tournamentIds) {
        const stateKey = key(tournamentId, playerId);
        await RedisClient.instance.hset(stateKey, "freeEntryCount", String(newCount));
      }
      logger.info(
        { playerId, newCount, tournamentCount: tournamentIds.length },
        `${LOG_PREFIX} syncPlayerFreeEntryCount done`
      );
    } catch (err) {
      logger.info({ err, playerId }, `${LOG_PREFIX} syncPlayerFreeEntryCount failed`);
    }
  }

  async syncPlayerFreeReentryCount(playerId: PlayerId, newCount: number): Promise<void> {
    try {
      const k = playerTournamentsKey(playerId);
      const tournamentIds = await RedisClient.instance.smembers(k);
      for (const tournamentId of tournamentIds) {
        const stateKey = key(tournamentId, playerId);
        await RedisClient.instance.hset(stateKey, "freeReentryCount", String(newCount));
      }
      logger.info(
        { playerId, newCount, tournamentCount: tournamentIds.length },
        `${LOG_PREFIX} syncPlayerFreeReentryCount done`
      );
    } catch (err) {
      logger.info({ err, playerId }, `${LOG_PREFIX} syncPlayerFreeReentryCount failed`);
    }
  }

  async deductOneFreeEntry(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null> {
    const state = await this.get(playerId, tournamentId);
    if (!state) return null;
    if (state.freeEntryCount > 0) {
      const newState: InGameUserState = { ...state, freeEntryCount: state.freeEntryCount - 1 };
      const ok = await this.set(playerId, tournamentId, newState);
      return ok ? newState : null;
    }
    if ((state.tournamentFreeEntryCount ?? 0) > 0) {
      const newState: InGameUserState = {
        ...state,
        tournamentFreeEntryCount: (state.tournamentFreeEntryCount ?? 0) - 1,
      };
      const ok = await this.set(playerId, tournamentId, newState);
      return ok ? newState : null;
    }
    return null;
  }

  async addBackOneFreeEntry(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null> {
    const state = await this.get(playerId, tournamentId);
    if (!state) return null;
    const newState: InGameUserState = { ...state, freeEntryCount: state.freeEntryCount + 1 };
    const ok = await this.set(playerId, tournamentId, newState);
    return ok ? newState : null;
  }

  async deleteAllForTournament(tournamentId: TournamentId): Promise<void> {
    const states = await this.getAllByTournament(tournamentId);
    for (const state of states) {
      const k = key(tournamentId, state.playerId);
      try {
        await RedisClient.instance.del(k);
        await RedisClient.instance.srem(playerTournamentsKey(state.playerId), tournamentId);
      } catch (err) {
        logger.info(
          { err, tournamentId, playerId: state.playerId },
          `${LOG_PREFIX} deleteAllForTournament: failed for player`
        );
      }
    }
    logger.info(
      { tournamentId, playerCount: states.length },
      `${LOG_PREFIX} deleteAllForTournament done`
    );
  }
}

export const InGameUserStateCache: InGameUserStateCache =
  new InGameUserStateCacheImpl();

function parseHashToState(
  hash: Record<string, string>,
  playerId: PlayerId
): InGameUserState | null {
  if (hash.status === undefined || hash.status === null) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: missing required field 'status'`);
    return null;
  }
  if (!VALID_STATUSES.has(hash.status)) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid status '${hash.status}'`);
    return null;
  }
  if (hash.bountyCount === undefined || hash.bountyCount === null) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: missing required field 'bountyCount'`);
    return null;
  }
  const bountyCount = parseInt(hash.bountyCount, 10);
  if (Number.isNaN(bountyCount)) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid bountyCount`);
    return null;
  }
  let entryPaymentMethod: EntryPaymentMethod | null = null;
  if (hash.entryPaymentMethod !== undefined && hash.entryPaymentMethod !== null && hash.entryPaymentMethod !== "") {
    if (!VALID_ENTRY_PAYMENT_METHODS.has(hash.entryPaymentMethod)) {
      logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid entryPaymentMethod '${hash.entryPaymentMethod}'`);
      return null;
    }
    entryPaymentMethod = hash.entryPaymentMethod as EntryPaymentMethod;
  }
  const reentryByPaymentMethod = parseReentryByPaymentMethod(
    hash.reentryByPaymentMethod
  );
  if (reentryByPaymentMethod === undefined) {
    return null;
  }
  if (hash.totalReentryCount === undefined || hash.totalReentryCount === null) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: missing required field 'totalReentryCount'`);
    return null;
  }
  const totalReentryCount = parseInt(hash.totalReentryCount, 10);
  if (Number.isNaN(totalReentryCount) || totalReentryCount < 0) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid totalReentryCount`);
    return null;
  }
  const freeEntryCount = parseInt(hash.freeEntryCount ?? "0", 10);
  if (Number.isNaN(freeEntryCount) || freeEntryCount < 0) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid freeEntryCount`);
    return null;
  }
  const freeReentryCount = parseInt(hash.freeReentryCount ?? "0", 10);
  if (Number.isNaN(freeReentryCount) || freeReentryCount < 0) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid freeReentryCount`);
    return null;
  }
  const tournamentFreeEntryCount = Math.max(
    0,
    parseInt(hash.tournamentFreeEntryCount ?? "0", 10) || 0
  );
  const tournamentFreeReentryCount = Math.max(
    0,
    parseInt(hash.tournamentFreeReentryCount ?? "0", 10) || 0
  );
  let placement: number | null = null;
  if (hash.placement !== undefined && hash.placement !== null && hash.placement !== "") {
    const p = parseInt(hash.placement, 10);
    if (Number.isNaN(p) || p < 0) {
      logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid placement`);
      return null;
    }
    placement = p;
  }
  const bonuses = parseBonuses(hash.bonuses);
  if (bonuses === undefined) {
    return null;
  }
  const customBonusChips = parseCustomBonusChips(hash.customBonusChips);
  if (customBonusChips === undefined) {
    return null;
  }
  let burnedStackEvents = parseBurnedStackEvents(hash.burnedStackEvents);
  if (burnedStackEvents === undefined) {
    return null;
  }
  if (
    burnedStackEvents.length === 0 &&
    hash.burnedStackChipsTotal !== undefined &&
    hash.burnedStackChipsTotal !== null &&
    hash.burnedStackChipsTotal !== ""
  ) {
    const legacy = parseInt(hash.burnedStackChipsTotal, 10);
    if (!Number.isNaN(legacy) && legacy > 0) {
      burnedStackEvents = [{ chips: legacy, source: "Rebuy" }];
    }
  }
  const tournamentPlayerId =
    hash.tournamentPlayerId !== undefined && hash.tournamentPlayerId !== null && hash.tournamentPlayerId !== ""
      ? parseInt(hash.tournamentPlayerId, 10)
      : 0;
  if (Number.isNaN(tournamentPlayerId) || tournamentPlayerId < 0) {
    logger.info({ hash }, `${LOG_PREFIX} parseHashToState failed: invalid tournamentPlayerId`);
    return null;
  }
  return {
    tournamentPlayerId,
    playerId,
    status: hash.status as InGamePlayerStatus,
    tableId: (hash.tableId || null) as TableId | null,
    bountyCount,
    entryPaymentMethod,
    reentryByPaymentMethod,
    totalReentryCount,
    freeEntryCount,
    freeReentryCount,
    tournamentFreeEntryCount,
    tournamentFreeReentryCount,
    placement,
    bonuses,
    customBonusChips,
    burnedStackEvents,
  };
}

function parseBurnedStackEvents(
  raw: string | undefined | null
): BurnedStackEvent[] | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return [];
  }
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    logger.info({ raw }, `${LOG_PREFIX} parseBurnedStackEvents failed: invalid JSON`);
    return undefined;
  }
  if (!Array.isArray(arr)) {
    logger.info({ raw }, `${LOG_PREFIX} parseBurnedStackEvents failed: expected array`);
    return undefined;
  }
  const out: BurnedStackEvent[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const c = o.chips;
      const n =
        typeof c === "number" ? c : typeof c === "string" ? parseInt(c, 10) : NaN;
      if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) {
        logger.info({ item, index: i }, `${LOG_PREFIX} parseBurnedStackEvents failed: bad chips`);
        return undefined;
      }
      const src = o.source;
      if (src !== "Rebuy" && src !== "Out") {
        logger.info({ item, index: i }, `${LOG_PREFIX} parseBurnedStackEvents failed: bad source`);
        return undefined;
      }
      out.push({ chips: n, source: src });
      continue;
    }
    logger.info({ item, index: i }, `${LOG_PREFIX} parseBurnedStackEvents failed: expected object`);
    return undefined;
  }
  return out;
}

function parseCustomBonusChips(
  raw: string | undefined | null
): number[] | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return [];
  }
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    logger.info({ raw }, `${LOG_PREFIX} parseCustomBonusChips failed: invalid JSON`);
    return undefined;
  }
  if (!Array.isArray(arr)) {
    logger.info({ raw }, `${LOG_PREFIX} parseCustomBonusChips failed: expected array`);
    return undefined;
  }
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    const n = typeof x === "number" ? x : parseInt(String(x), 10);
    if (Number.isNaN(n) || n <= 0) {
      logger.info({ x, index: i }, `${LOG_PREFIX} parseCustomBonusChips failed: invalid entry`);
      return undefined;
    }
    if (!Number.isInteger(n)) {
      logger.info({ x, index: i }, `${LOG_PREFIX} parseCustomBonusChips failed: non-integer`);
      return undefined;
    }
    out.push(n);
  }
  return out;
}

function parseReentryByPaymentMethod(
  raw: string | undefined | null
): ReentryByPaymentMethod | null | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return null; // valid null at start
  }
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    logger.info({ raw }, `${LOG_PREFIX} parseReentryByPaymentMethod failed: invalid JSON`);
    return undefined;
  }
  if (!Array.isArray(arr)) {
    logger.info({ raw }, `${LOG_PREFIX} parseReentryByPaymentMethod failed: expected array`);
    return undefined;
  }
  const result: ReentryByPaymentMethod = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!Array.isArray(item) || item.length !== 2) {
      logger.info({ item, index: i }, `${LOG_PREFIX} parseReentryByPaymentMethod failed: invalid pair at index ${i}`);
      return undefined;
    }
    const [method, count] = item;
    if (typeof method !== "string" || !VALID_ENTRY_PAYMENT_METHODS.has(method)) {
      logger.info({ method, index: i }, `${LOG_PREFIX} parseReentryByPaymentMethod failed: invalid method at index ${i}`);
      return undefined;
    }
    const num = typeof count === "number" ? count : parseInt(String(count), 10);
    if (Number.isNaN(num) || num < 0) {
      logger.info({ count, index: i }, `${LOG_PREFIX} parseReentryByPaymentMethod failed: invalid count at index ${i}`);
      return undefined;
    }
    result.push([method as EntryPaymentMethod, num]);
  }
  return result;
}

function parseBonuses(
  raw: string | undefined | null
): BonusesByType | null | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return null; // valid null at start
  }
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    logger.info({ raw }, `${LOG_PREFIX} parseBonuses failed: invalid JSON`);
    return undefined;
  }
  if (!Array.isArray(arr)) {
    logger.info({ raw }, `${LOG_PREFIX} parseBonuses failed: expected array`);
    return undefined;
  }
  const result: BonusesByType = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!Array.isArray(item) || item.length !== 2) {
      logger.info({ item, index: i }, `${LOG_PREFIX} parseBonuses failed: invalid pair at index ${i}`);
      return undefined;
    }
    const [bonus, count] = item;
    if (typeof bonus !== "string" || !VALID_BONUSES.has(bonus)) {
      logger.info({ bonus, index: i }, `${LOG_PREFIX} parseBonuses failed: invalid bonus at index ${i}`);
      return undefined;
    }
    if (bonus === InGameBonus.Custom) {
      logger.info({ index: i }, `${LOG_PREFIX} parseBonuses failed: Custom must not appear in pairs`);
      return undefined;
    }
    const num = typeof count === "number" ? count : parseInt(String(count), 10);
    if (Number.isNaN(num) || num < 0) {
      logger.info({ count, index: i }, `${LOG_PREFIX} parseBonuses failed: invalid count at index ${i}`);
      return undefined;
    }
    result.push([bonus as InGameBonus, num]);
  }
  return result;
}
