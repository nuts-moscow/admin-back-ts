// `logger` is initialised at app startup; unit tests construct this service
// directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import {
  type ClubTournament,
  type PlayerTournamentFact,
  type Queryable,
  playerTournamentRatingFactsRepository,
} from "../../postgres/PlayerTournamentRatingFactsRepository";
import { playerAchievementRepository } from "../../postgres/PlayerAchievementRepository";
import {
  type SettledSeason,
  seasonSettlementRepository,
} from "../../postgres/SeasonSettlementRepository";

/**
 * Everything one player's rules read. Assembled fresh on every request — no
 * counter is kept anywhere, so no counter can drift from the tournaments it
 * claims to count.
 */
export interface PlayerRecord {
  playerId: string;
  /** The player's rated tournaments, oldest first. */
  facts: readonly PlayerTournamentFact[];
  /**
   * The club's rated tournaments in date order. A streak is measured against
   * this: an unrated tournament is absent here exactly as it is absent from
   * the facts, so it neither counts nor breaks anything.
   */
  clubTournaments: readonly ClubTournament[];
  /** Rule ids the player already holds. */
  heldRuleIds: ReadonlySet<string>;
  /** Settled seasons, oldest first — the sequence the MVP streak walks. */
  settledSeasons: readonly SettledSeason[];
}

export interface FactSource {
  listFactsForPlayer(playerId: string, on?: Queryable): Promise<PlayerTournamentFact[]>;
  listRatedTournaments(on?: Queryable): Promise<ClubTournament[]>;
}

export interface AwardSource {
  listForPlayer(playerId: number, on?: Queryable): Promise<Array<{ ruleId: string }>>;
}

export interface SettlementSource {
  listSettled(on?: Queryable): Promise<SettledSeason[]>;
}

/**
 * Assembles the record. It reads and shapes; it decides nothing — every
 * judgement about where a player stands belongs to the scorer, which is a
 * pure function over what this produces.
 */
export class PlayerRecordReader {
  constructor(
    private readonly facts: FactSource,
    private readonly awards: AwardSource,
    private readonly settlements: SettlementSource
  ) {}

  /**
   * `on` is the transaction the awarding pass runs in. Passing it is what
   * makes a whole pass read one snapshot: without it every read would see
   * whatever landed since the pass began.
   */
  async assemble(playerId: number, on?: Queryable): Promise<PlayerRecord> {
    const id = String(playerId);
    const [facts, clubTournaments, held, settledSeasons] = await Promise.all([
      this.facts.listFactsForPlayer(id, on),
      this.facts.listRatedTournaments(on),
      this.awards.listForPlayer(playerId, on),
      this.settlements.listSettled(on),
    ]);

    logger?.debug(
      { playerId, facts: facts.length, tournaments: clubTournaments.length },
      "[PlayerRecordReader] record assembled"
    );

    return {
      playerId: id,
      facts,
      clubTournaments,
      heldRuleIds: new Set(held.map((a) => a.ruleId)),
      settledSeasons,
    };
  }
}

export const playerRecordReader = new PlayerRecordReader(
  playerTournamentRatingFactsRepository,
  playerAchievementRepository,
  seasonSettlementRepository
);
