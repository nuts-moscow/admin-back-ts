import { isFinalTable } from "../../postgres/PlayerTournamentRatingFactsRepository";
import type { PlayerTournamentFact } from "../../postgres/PlayerTournamentRatingFactsRepository";
import { activeRules } from "./catalog";
import type {
  AchievementProgress,
  AchievementRule,
  UnitPredicate,
} from "./types";

export interface Season {
  year: number;
  month: number;
}

/** A season already settled, and who led it. */
export interface SettledSeasonRef extends Season {
  leaderPlayerId: string | null;
}

/** A tournament the club held, as the streak walks it. */
export interface ClubTournamentRef {
  tournamentId: number;
}

/**
 * Everything the scorer reads. Assembling it belongs to the record reader; the
 * scorer neither queries nor knows where any of this came from.
 */
export interface ScorableRecord {
  playerId: string;
  facts: readonly PlayerTournamentFact[];
  clubTournaments: readonly ClubTournamentRef[];
  settledSeasons: readonly SettledSeasonRef[];
}

/**
 * Which season a seasonal rule is measured in. The awarding pass passes the
 * tournament being completed; the profile passes the season it is showing.
 */
export interface ScoringContext {
  season: Season | null;
}

/** Whether one tournament satisfies a per-tournament predicate. */
function factSatisfies(fact: PlayerTournamentFact, predicate: UnitPredicate): boolean {
  switch (predicate) {
    case "played":
      // A fact exists only for a rated tournament the player took part in.
      return true;
    case "rating_zone":
      return fact.basePoints > 0;
    case "podium":
      // Placement is high-is-better: first place equals the field size.
      return fact.placement != null && fact.placement > fact.ratingFieldSize - 3;
    case "win":
      return fact.placement != null && fact.placement === fact.ratingFieldSize;
    case "final_table":
      return isFinalTable(fact.placement, fact.ratingFieldSize);
    case "season_leader":
      // Decided by comparing players, which is the settlement's job — never a
      // property of one tournament.
      return false;
  }
}

function inSeason(fact: PlayerTournamentFact, season: Season): boolean {
  return fact.seasonYear === season.year && fact.seasonMonth === season.month;
}

/**
 * Knockouts arrive fractional — a simultaneous elimination splits the bounty —
 * so they are floored once, here, before anything is compared to a threshold.
 * The floored number is also what the profile reports, so the figure a player
 * reads and the figure behind their badge are the same figure.
 */
function wholeKnockouts(value: number): number {
  // A hair of tolerance first: summing thirds in binary leaves 9.999999999
  // where the arithmetic says ten, and a player who knocked out ten people
  // must not read nine.
  return Math.floor(value + 1e-9);
}

function factsInScope(
  record: ScorableRecord,
  rule: AchievementRule,
  ctx: ScoringContext
): readonly PlayerTournamentFact[] {
  if (rule.scope !== "season") return record.facts;
  if (!ctx.season) return [];
  return record.facts.filter((f) => inSeason(f, ctx.season!));
}

/**
 * The run of tournaments ending at the club's most recent one that the player
 * played. Walking the club's sequence rather than the player's own facts is
 * what makes a missed tournament break the run — including one they were never
 * invited to.
 */
function tournamentStreak(record: ScorableRecord): number {
  const played = new Set(record.facts.map((f) => f.tournamentId));
  let run = 0;
  for (let i = record.clubTournaments.length - 1; i >= 0; i -= 1) {
    if (!played.has(record.clubTournaments[i]!.tournamentId)) break;
    run += 1;
  }
  return run;
}

/**
 * The run of settled seasons ending at the newest that this player led. Only
 * seasons that held a tournament are ever settled, so a quiet month cannot
 * break the run.
 */
function seasonStreak(record: ScorableRecord): number {
  let run = 0;
  for (let i = record.settledSeasons.length - 1; i >= 0; i -= 1) {
    if (record.settledSeasons[i]!.leaderPlayerId !== record.playerId) break;
    run += 1;
  }
  return run;
}

function seasonsLed(record: ScorableRecord): number {
  return record.settledSeasons.filter((s) => s.leaderPlayerId === record.playerId).length;
}

/** How far along one rule the record puts the player. */
export function reachedFor(
  record: ScorableRecord,
  rule: AchievementRule,
  ctx: ScoringContext
): number {
  if (rule.unit === "season") {
    return rule.kind === "streak" ? seasonStreak(record) : seasonsLed(record);
  }

  const facts = factsInScope(record, rule, ctx);

  switch (rule.kind) {
    case "occurrence":
      return facts.filter((f) => factSatisfies(f, rule.predicate!)).length;
    case "total":
      return wholeKnockouts(facts.reduce((sum, f) => sum + f.knockouts, 0));
    case "unit_max":
      return facts.reduce((best, f) => Math.max(best, wholeKnockouts(f.knockouts)), 0);
    case "streak":
      // A streak is about the club's sequence, not a window inside it, so a
      // seasonal streak rule would be a different question — none exists.
      return tournamentStreak(record);
  }
}

/**
 * Where a player stands on every active rule. Pure: the same record and the
 * same context always give the same answer, which is what lets the awarding
 * pass and the profile agree without sharing anything but this function.
 */
export function score(
  record: ScorableRecord,
  ctx: ScoringContext,
  rules: readonly AchievementRule[] = activeRules()
): AchievementProgress[] {
  return rules.map((rule) => {
    const reached = reachedFor(record, rule, ctx);
    return {
      ruleId: rule.id,
      reached,
      threshold: rule.threshold,
      closed: reached >= rule.threshold,
    };
  });
}
