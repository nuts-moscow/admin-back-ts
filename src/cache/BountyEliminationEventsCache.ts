import { logger } from "../logger";
import { RedisClient } from "../redis";
import type { PlayerId, TournamentId } from "../domain/cache/InGameUserState";

const EVENT_KEY_PREFIX = "nuts.api.data.tournament.bounty.eliminationEvent";
const LOG_PREFIX = "[BountyEliminationEventsCache]";

/** Persisted record for POST bounty/eliminate undo. */
export interface BountyEliminationEventRecord {
  eventId: string;
  eliminatedPlayerId: PlayerId;
  killerPlayerIds: PlayerId[];
  type: "Rebuy" | "Out";
  burnedStack: boolean;
  burnedChips: number;
  /** true when bounty and kill lists were applied (!burnedStack && killerPlayerIds.length > 0) */
  recordedBounty: boolean;
  /** Increment applied per killer when recordedBounty (1 / killerPlayerIds.length). */
  bountyShare: number;
}

function eventKey(tournamentId: TournamentId, eventId: string): string {
  return `${EVENT_KEY_PREFIX}.${tournamentId}.${eventId}`;
}

function eventsPattern(tournamentId: TournamentId): string {
  return `${EVENT_KEY_PREFIX}.${tournamentId}.*`;
}

export interface BountyEliminationEventsCache {
  save(record: BountyEliminationEventRecord, tournamentId: TournamentId): Promise<boolean>;
  get(
    tournamentId: TournamentId,
    eventId: string
  ): Promise<BountyEliminationEventRecord | null>;
  delete(tournamentId: TournamentId, eventId: string): Promise<void>;
  deleteAllForTournament(tournamentId: TournamentId): Promise<void>;
}

class BountyEliminationEventsCacheImpl implements BountyEliminationEventsCache {
  async save(
    record: BountyEliminationEventRecord,
    tournamentId: TournamentId
  ): Promise<boolean> {
    try {
      const k = eventKey(tournamentId, record.eventId);
      await RedisClient.instance.set(k, JSON.stringify(record));
      logger.info({ k }, `${LOG_PREFIX} save ok`);
      return true;
    } catch (err) {
      logger.info({ err }, `${LOG_PREFIX} save failed`);
      return false;
    }
  }

  async get(
    tournamentId: TournamentId,
    eventId: string
  ): Promise<BountyEliminationEventRecord | null> {
    try {
      const raw = await RedisClient.instance.get(eventKey(tournamentId, eventId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BountyEliminationEventRecord;
      if (
        !parsed ||
        typeof parsed.eventId !== "string" ||
        parsed.eventId !== eventId
      ) {
        return null;
      }
      return parsed;
    } catch (err) {
      logger.info({ err, eventId }, `${LOG_PREFIX} get failed`);
      return null;
    }
  }

  async delete(tournamentId: TournamentId, eventId: string): Promise<void> {
    try {
      await RedisClient.instance.del(eventKey(tournamentId, eventId));
    } catch (err) {
      logger.info({ err, eventId }, `${LOG_PREFIX} delete failed`);
    }
  }

  async deleteAllForTournament(tournamentId: TournamentId): Promise<void> {
    try {
      const keys = await RedisClient.instance.keys(eventsPattern(tournamentId));
      if (keys.length > 0) {
        await RedisClient.instance.del(...keys);
      }
      logger.info(
        { tournamentId, removed: keys.length },
        `${LOG_PREFIX} deleteAllForTournament`
      );
    } catch (err) {
      logger.info({ err, tournamentId }, `${LOG_PREFIX} deleteAllForTournament failed`);
    }
  }
}

export const BountyEliminationEventsCache: BountyEliminationEventsCache =
  new BountyEliminationEventsCacheImpl();
