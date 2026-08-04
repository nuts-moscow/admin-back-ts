// `logger` is initialised at app startup; unit tests construct this service
// directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import type { PoolClient } from "pg";
import type { AwardInsert } from "../../postgres/PlayerAchievementRepository";
import { playerAchievementRepository } from "../../postgres/PlayerAchievementRepository";
import { playerTournamentRatingFactsRepository } from "../../postgres/PlayerTournamentRatingFactsRepository";
import {
  type SettledSeason,
  seasonSettlementRepository,
} from "../../postgres/SeasonSettlementRepository";

export interface Season {
  year: number;
  month: number;
}

/** Season ordering, so «earlier» never depends on how a loop was written. */
export function seasonKey(s: Season): number {
  return s.year * 12 + s.month;
}

export interface StandingsSource {
  listSeasonsWithTournaments(): Promise<Season[]>;
  getSeasonalRating(year: number, month: number): Promise<Array<{ playerId: string; totalPoints: number }>>;
  lastTournamentOfSeason(year: number, month: number): Promise<{ id: number; dateMs: number } | null>;
}

export interface SettlementStore {
  listSettled(): Promise<SettledSeason[]>;
  settleWithClient(client: PoolClient, season: SettledSeason): Promise<boolean>;
}

export interface AwardSink {
  awardWithClient(client: PoolClient, awards: readonly AwardInsert[]): Promise<number>;
}

/** The MVP family, by identity — the settlement is their only author. */
const MVP_RULE = "season-mvp";
const MVP_STREAK_RULES: ReadonlyArray<{ id: string; length: number }> = [
  { id: "mvp-streak-2", length: 2 },
  { id: "mvp-streak-3", length: 3 },
];

/**
 * Settles finished seasons — the one rule in the catalogue that compares
 * players rather than counting one.
 *
 * A season is settled by the first tournament of a later one, because the
 * system has no event for a month ending and the last tournament of a month
 * does not know it is the last. A month that held no rated tournament is not a
 * season at all: it settles nobody and does not sit between two MVPs as a gap.
 */
export class SeasonSettlementService {
  constructor(
    private readonly standings: StandingsSource,
    private readonly settlements: SettlementStore,
    private readonly awards: AwardSink
  ) {}

  /**
   * Settles every season with tournaments strictly earlier than `current` that
   * has not been settled yet. Safe to call on every completion: seasons
   * already settled are skipped by the store's conflict clause.
   */
  async settleUpTo(client: PoolClient, current: Season): Promise<void> {
    const [withTournaments, alreadySettled] = await Promise.all([
      this.standings.listSeasonsWithTournaments(),
      this.settlements.listSettled(),
    ]);

    const settledKeys = new Set(alreadySettled.map(seasonKey));
    const pending = withTournaments
      .filter((s) => seasonKey(s) < seasonKey(current) && !settledKeys.has(seasonKey(s)))
      .sort((a, b) => seasonKey(a) - seasonKey(b));

    if (pending.length === 0) return;

    // Rebuilt as we go, so a run spanning several seasons settled in one call
    // is counted the same as one settled over several evenings.
    const settled: SettledSeason[] = [...alreadySettled].sort(
      (a, b) => seasonKey(a) - seasonKey(b)
    );

    for (const season of pending) {
      const standing = await this.standings.getSeasonalRating(season.year, season.month);
      const leader = pickLeader(standing);
      const last = await this.standings.lastTournamentOfSeason(season.year, season.month);

      const fresh = await this.settlements.settleWithClient(client, {
        year: season.year,
        month: season.month,
        leaderPlayerId: leader,
      });
      if (!fresh) continue;

      settled.push({ ...season, leaderPlayerId: leader });
      settled.sort((a, b) => seasonKey(a) - seasonKey(b));

      if (leader == null) {
        logger?.info({ season }, "[SeasonSettlement] season settled with no leader");
        continue;
      }

      const earnedAt = last ? new Date(last.dateMs) : undefined;
      const toAward: AwardInsert[] = [
        {
          playerId: Number(leader),
          ruleId: MVP_RULE,
          tournamentId: last?.id ?? null,
          earnedAt,
        },
      ];

      // A run is counted over settled seasons, which only ever hold seasons
      // that had tournaments — so a quiet month cannot break it.
      const run = trailingRun(settled, leader);
      for (const rule of MVP_STREAK_RULES) {
        if (run >= rule.length) {
          toAward.push({
            playerId: Number(leader),
            ruleId: rule.id,
            tournamentId: last?.id ?? null,
            earnedAt,
          });
        }
      }

      await this.awards.awardWithClient(client, toAward);
      logger?.info({ season, leader, run }, "[SeasonSettlement] season settled");
    }
  }
}

/** The single highest scorer, or nobody when there is a tie or no points. */
function pickLeader(
  standing: ReadonlyArray<{ playerId: string; totalPoints: number }>
): string | null {
  const scoring = standing.filter((e) => e.totalPoints > 0);
  if (scoring.length === 0) return null;
  const best = Math.max(...scoring.map((e) => e.totalPoints));
  const leaders = scoring.filter((e) => e.totalPoints === best);
  // A tie leaves the season without an MVP rather than handing it to whoever
  // the query returned first.
  return leaders.length === 1 ? leaders[0]!.playerId : null;
}

/** How many settled seasons in a row, ending at the newest, this player led. */
function trailingRun(settled: readonly SettledSeason[], playerId: string): number {
  let run = 0;
  for (let i = settled.length - 1; i >= 0; i -= 1) {
    if (settled[i]!.leaderPlayerId !== playerId) break;
    run += 1;
  }
  return run;
}

export const seasonSettlementService = new SeasonSettlementService(
  {
    listSeasonsWithTournaments: () =>
      playerTournamentRatingFactsRepository.listSeasonsWithTournaments(),
    getSeasonalRating: (year, month) =>
      playerTournamentRatingFactsRepository
        .getSeasonalRating(year, month)
        .then((rows) => rows.map((r) => ({ playerId: r.playerId, totalPoints: r.totalPoints }))),
    lastTournamentOfSeason: async (year, month) => {
      const tournaments = await playerTournamentRatingFactsRepository.listRatedTournaments();
      const inSeason = tournaments.filter(
        (t) => t.seasonYear === year && t.seasonMonth === month
      );
      const last = inSeason[inSeason.length - 1];
      return last ? { id: last.tournamentId, dateMs: last.tournamentDateMs } : null;
    },
  },
  seasonSettlementRepository,
  playerAchievementRepository
);
