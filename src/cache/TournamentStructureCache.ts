import type { BlindType } from "../domain/BlindType";
import { logger } from "../logger";
import { RedisClient } from "../redis";

const KEY_PREFIX = "nuts.api.data.v2.tournament.structure";
const LOG_PREFIX = "[TournamentStructureCache]";

function key(tournamentId: string): string {
  return `${KEY_PREFIX}.${tournamentId}`;
}

/** Structure data stored in cache (without id) */
export interface TournamentStructureData {
  name: string;
  playersLimit: number;
  stackSize: number;
  freezeOutEnabled: boolean;
  blindsStructure: BlindType[];
}

function parseStructure(raw: string | null): TournamentStructureData | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== "object" || obj === null) return null;
    const o = obj as Record<string, unknown>;
    const freezeOutEnabled =
      o.freezeOutEnabled === null ? false : o.freezeOutEnabled;
    if (
      typeof o.name !== "string" ||
      typeof o.playersLimit !== "number" ||
      typeof o.stackSize !== "number" ||
      typeof freezeOutEnabled !== "boolean" ||
      !Array.isArray(o.blindsStructure)
    ) {
      return null;
    }
    return {
      name: o.name,
      playersLimit: o.playersLimit,
      stackSize: o.stackSize,
      freezeOutEnabled,
      blindsStructure: o.blindsStructure as BlindType[],
    };
  } catch {
    return null;
  }
}

/** Cache for tournament structure by tournament ID */
export interface TournamentStructureCache {
  /**
   * Gets cached structure for a tournament.
   * @param tournamentId - Tournament ID
   * @returns Cached structure or null if miss/expired
   */
  get(tournamentId: string): Promise<TournamentStructureData | null>;

  /**
   * Stores structure for a tournament (no TTL).
   * @param tournamentId - Tournament ID
   * @param structure - Structure to cache
   * @returns true if stored, false on error
   */
  set(tournamentId: string, structure: TournamentStructureData): Promise<boolean>;

  /**
   * Deletes structure for a tournament (e.g. when tournament is completed).
   */
  delete(tournamentId: string): Promise<void>;
}

class TournamentStructureCacheImpl implements TournamentStructureCache {
  async get(tournamentId: string): Promise<TournamentStructureData | null> {
    logger.info({ tournamentId }, `${LOG_PREFIX} get entry`);

    try {
      const raw = await RedisClient.instance.get(key(tournamentId));
      const result = parseStructure(raw);
      logger.info(
        { tournamentId, hit: !!result },
        `${LOG_PREFIX} get result`
      );
      return result;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} get failed`);
      return null;
    }
  }

  async set(
    tournamentId: string,
    structure: TournamentStructureData
  ): Promise<boolean> {
    logger.info(
      { tournamentId, name: structure.name },
      `${LOG_PREFIX} set entry`
    );

    try {
      const k = key(tournamentId);
      await RedisClient.instance.set(k, JSON.stringify(structure));
      logger.info(`${LOG_PREFIX} set result: stored`);
      return true;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} set failed`);
      return false;
    }
  }

  async delete(tournamentId: string): Promise<void> {
    try {
      await RedisClient.instance.del(key(tournamentId));
      logger.info({ tournamentId }, `${LOG_PREFIX} delete done`);
    } catch (err) {
      logger.info({ err, tournamentId }, `${LOG_PREFIX} delete failed`);
    }
  }
}

export const tournamentStructureCache: TournamentStructureCache =
  new TournamentStructureCacheImpl();
