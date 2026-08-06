import { describe, expect, test } from "bun:test";
import type { PoolClient } from "pg";
import type { PlayerTournamentFact } from "../../postgres/PlayerTournamentRatingFactsRepository";
import type { AwardInsert } from "../../postgres/PlayerAchievementRepository";
import { AchievementAwardingService } from "./AchievementAwardingService";
import type { PlayerRecord } from "./PlayerRecordReader";

const CLIENT = {} as PoolClient;
const MAY = { year: 2026, month: 5 };

function fact(over: Partial<PlayerTournamentFact> = {}): PlayerTournamentFact {
  return {
    tournamentId: 1,
    tournamentDateMs: 1_000,
    seasonYear: MAY.year,
    seasonMonth: MAY.month,
    placement: null,
    ratingFieldSize: 30,
    basePoints: 0,
    knockouts: 0,
    ...over,
  };
}

/**
 * A club where each player's history is given directly. `held` accumulates as
 * awards are written, which is what makes the second pass a real repeat.
 */
function club(histories: Record<number, PlayerTournamentFact[]>) {
  const written: AwardInsert[] = [];
  const held = new Map<number, Set<string>>();

  const svc = new AchievementAwardingService(
    {
      async assemble(playerId): Promise<PlayerRecord> {
        const facts = histories[playerId] ?? [];
        return {
          playerId: String(playerId),
          facts,
          clubTournaments: facts.map((f) => ({
            tournamentId: f.tournamentId,
            tournamentDateMs: f.tournamentDateMs,
            seasonYear: f.seasonYear,
            seasonMonth: f.seasonMonth,
          })),
          heldRuleIds: held.get(playerId) ?? new Set<string>(),
          settledSeasons: [],
        };
      },
    },
    {
      async awardWithClient(_c, awards) {
        for (const a of awards) {
          const set = held.get(a.playerId) ?? new Set<string>();
          if (set.has(a.ruleId)) continue;
          set.add(a.ruleId);
          held.set(a.playerId, set);
          written.push(a);
        }
        return awards.length;
      },
    },
    {
      async listPlayerIds() {
        return Object.keys(histories).map(Number);
      },
    }
  );
  return { svc, written, held };
}

const FIVE_TOURNAMENTS = Array.from({ length: 5 }, (_, i) =>
  fact({ tournamentId: i + 1, tournamentDateMs: (i + 1) * 1_000 })
);

describe("closed after every tournament", () => {
  test("reaching a fifth event awards «Дебютант» to that player and nobody else", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS, 2: [fact()] });

    await c.svc.runForField(CLIENT, { playerIds: [1, 2], tournamentId: 5, season: MAY });

    const debutant = c.written.filter((a) => a.ruleId === "played-5");
    expect(debutant).toHaveLength(1);
    expect(debutant[0]!.playerId).toBe(1);
  });

  test("a player who took no part receives nothing from the tournament", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS, 2: FIVE_TOURNAMENTS });
    await c.svc.runForField(CLIENT, { playerIds: [1], tournamentId: 5, season: MAY });
    expect(c.written.every((a) => a.playerId === 1)).toBe(true);
  });

  test("the award carries the tournament that closed it", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS });
    await c.svc.runForField(CLIENT, { playerIds: [1], tournamentId: 5, season: MAY });
    expect(c.written.every((a) => a.tournamentId === 5)).toBe(true);
  });
});

describe("the pass is idempotent", () => {
  test("completing the same tournament three times writes each award once", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS });
    const input = { playerIds: [1], tournamentId: 5, season: MAY };

    await c.svc.runForField(CLIENT, input);
    const afterFirst = c.written.length;
    await c.svc.runForField(CLIENT, input);
    await c.svc.runForField(CLIENT, input);

    expect(c.written).toHaveLength(afterFirst);
    expect(afterFirst).toBeGreaterThan(0);
  });
});

describe("the catalogue applies to history", () => {
  test("a pass over the club awards everything already closed", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS, 2: [fact()] });

    await c.svc.runOverHistory(CLIENT, MAY);

    const ids = c.written.filter((a) => a.playerId === 1).map((a) => a.ruleId);
    expect(ids).toContain("first-tournament");
    expect(ids).toContain("played-5");
    // Player 2 has one tournament: the first-timer rule and nothing beyond it.
    const theirs = c.written.filter((a) => a.playerId === 2).map((a) => a.ruleId);
    expect(theirs).toContain("first-tournament");
    expect(theirs).not.toContain("played-5");
  });

  test("a second history pass adds nothing", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS });
    await c.svc.runOverHistory(CLIENT, MAY);
    const afterFirst = c.written.length;
    await c.svc.runOverHistory(CLIENT, MAY);
    expect(c.written).toHaveLength(afterFirst);
  });

  test("awards from the history pass carry no tournament", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS });
    await c.svc.runOverHistory(CLIENT, MAY);
    expect(c.written.every((a) => a.tournamentId === null)).toBe(true);
  });
});

describe("the MVP family is left to the settlement", () => {
  test("the pass never writes a season-unit rule", async () => {
    const c = club({ 1: FIVE_TOURNAMENTS });
    await c.svc.runOverHistory(CLIENT, MAY);
    const ids = c.written.map((a) => a.ruleId);
    expect(ids).not.toContain("season-mvp");
    expect(ids).not.toContain("mvp-streak-2");
    expect(ids).not.toContain("mvp-streak-3");
  });
});
