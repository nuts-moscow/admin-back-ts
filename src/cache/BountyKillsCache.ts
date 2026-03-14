import { logger } from "../logger";
import { RedisClient } from "../redis";
import type { PlayerId, TournamentId } from "../domain/cache/InGameUserState";

const BOUNTY_KILLS_BASE = "nuts.api.data.tournament.bounty.kills";
const LOG_PREFIX = "[BountyKillsCache]";

function key(tournamentId: TournamentId, killerPlayerId: PlayerId): string {
  return `${BOUNTY_KILLS_BASE}.${tournamentId}.${killerPlayerId}`;
}

/** Cache for bounty kill records: killer -> list of eliminated player IDs */
export interface BountyKillsCache {
  /**
   * Records that killerPlayerId eliminated eliminatedPlayerId in tournament.
   * Appends to the list of eliminated players for this killer in this tournament.
   * @param tournamentId - Tournament ID
   * @param killerPlayerId - Player who made the elimination
   * @param eliminatedPlayerId - Player who was eliminated
   * @returns true if stored, false on error
   */
  addKill(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId,
    eliminatedPlayerId: PlayerId
  ): Promise<boolean>;

  /**
   * Gets list of player IDs eliminated by killerPlayerId in tournament.
   * @param tournamentId - Tournament ID
   * @param killerPlayerId - Killer player ID
   * @returns Array of eliminated player IDs (empty on miss/error)
   */
  getKillsByKiller(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId
  ): Promise<PlayerId[]>;

  /**
   * Removes one occurrence of eliminatedPlayerId from killer's kill list.
   * @returns true if removed, false if not found or on error
   */
  removeKill(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId,
    eliminatedPlayerId: PlayerId
  ): Promise<boolean>;
}

class BountyKillsCacheImpl implements BountyKillsCache {
  async addKill(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId,
    eliminatedPlayerId: PlayerId
  ): Promise<boolean> {
    logger.info(
      { tournamentId, killerPlayerId, eliminatedPlayerId },
      `${LOG_PREFIX} addKill entry`
    );
    try {
      const k = key(tournamentId, killerPlayerId);
      await RedisClient.instance.rpush(k, eliminatedPlayerId);
      logger.info({ key: k }, `${LOG_PREFIX} addKill result`);
      return true;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} addKill failed`);
      return false;
    }
  }

  async getKillsByKiller(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId
  ): Promise<PlayerId[]> {
    logger.info(
      { tournamentId, killerPlayerId },
      `${LOG_PREFIX} getKillsByKiller entry`
    );
    try {
      const k = key(tournamentId, killerPlayerId);
      const list = await RedisClient.instance.lrange(k, 0, -1);
      logger.info(
        { count: list.length },
        `${LOG_PREFIX} getKillsByKiller result`
      );
      return list;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} getKillsByKiller failed`);
      return [];
    }
  }

  async removeKill(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId,
    eliminatedPlayerId: PlayerId
  ): Promise<boolean> {
    logger.info(
      { tournamentId, killerPlayerId, eliminatedPlayerId },
      `${LOG_PREFIX} removeKill entry`
    );
    try {
      const k = key(tournamentId, killerPlayerId);
      const removed = await RedisClient.instance.lrem(k, 1, eliminatedPlayerId);
      const ok = removed > 0;
      logger.info({ removed: ok }, `${LOG_PREFIX} removeKill result`);
      return ok;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} removeKill failed`);
      return false;
    }
  }
}

export const BountyKillsCache: BountyKillsCache = new BountyKillsCacheImpl();
