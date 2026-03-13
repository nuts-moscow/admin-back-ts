import { logger } from "../logger";
import { RedisClient } from "../redis";
import {
  EntryPaymentMethod,
  InGameBonus,
  initInGameUserState,
  InGamePlayerStatus,
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
const LOG_PREFIX = "[InGameUserStateCache]";

function key(tournamentId: TournamentId, playerId: PlayerId): string {
  return `${TOURNAMENT_PLAYERS_BASE}.${tournamentId}.${playerId}`;
}

function keyPattern(tournamentId: TournamentId): string {
  return `${TOURNAMENT_PLAYERS_BASE}.${tournamentId}.*`;
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
   * Adds player to tournament with init state (freeEntryCount=0, freeReentryCount=0).
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @returns true if stored, false on error
   */
  addPlayerToTournament(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<boolean>;

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
   * Updates entry payment method in tournament.
   * @param playerId - Player ID
   * @param tournamentId - Tournament ID
   * @param entryPaymentMethod - New entry payment method
   * @returns Updated state or null if state does not exist or on error
   */
  updateEntryPaymentMethod(
    playerId: PlayerId,
    tournamentId: TournamentId,
    entryPaymentMethod: EntryPaymentMethod
  ): Promise<InGameUserState | null>;

  /**
   * Adds reentry payments (increments count for each payment method in list).
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
        placement: state.placement === null ? "" : String(state.placement),
        bonuses: state.bonuses === null ? "" : JSON.stringify(state.bonuses),
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
    tournamentId: TournamentId
  ): Promise<boolean> {
    logger.info({ playerId, tournamentId }, `${LOG_PREFIX} InGameUserStateCache.addPlayerToTournament entry`);
    const existing = await this.getAllByTournament(tournamentId);
    const nextId =
      existing.length === 0
        ? 1
        : Math.max(...existing.map((s) => s.tournamentPlayerId)) + 1;
    const state = initInGameUserState(playerId, nextId, 0, 0);
    const result = await this.set(playerId, tournamentId, state);
    logger.info({ stored: result }, `${LOG_PREFIX} InGameUserStateCache.addPlayerToTournament result`);
    return result;
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

  async updateEntryPaymentMethod(
    playerId: PlayerId,
    tournamentId: TournamentId,
    entryPaymentMethod: EntryPaymentMethod
  ): Promise<InGameUserState | null> {
    logger.info({ playerId, tournamentId, entryPaymentMethod }, `${LOG_PREFIX} InGameUserStateCache.updateEntryPaymentMethod entry`);
    try {
      const k = key(tournamentId, playerId);
      const exists = await RedisClient.instance.exists(k);
      if (!exists) {
        logger.info(`${LOG_PREFIX} InGameUserStateCache.updateEntryPaymentMethod result: miss (key not found)`);
        return null;
      }
      await RedisClient.instance.hset(k, "entryPaymentMethod", entryPaymentMethod);
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
      for (const method of payments) {
        map.set(method, (map.get(method) ?? 0) + 1);
      }
      const updated: ReentryByPaymentMethod = Array.from(map.entries());
      const newState: InGameUserState = {
        ...state,
        reentryByPaymentMethod: updated,
        totalReentryCount: state.totalReentryCount + payments.length,
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
    placement,
    bonuses,
  };
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
    const num = typeof count === "number" ? count : parseInt(String(count), 10);
    if (Number.isNaN(num) || num < 0) {
      logger.info({ count, index: i }, `${LOG_PREFIX} parseBonuses failed: invalid count at index ${i}`);
      return undefined;
    }
    result.push([bonus as InGameBonus, num]);
  }
  return result;
}
