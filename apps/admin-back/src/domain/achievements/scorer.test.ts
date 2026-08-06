import { describe, expect, test } from "bun:test";
import type { PlayerTournamentFact } from "../../postgres/PlayerTournamentRatingFactsRepository";
import { ruleById } from "./catalog";
import { score, type ScorableRecord } from "./scorer";

const MAY = { year: 2026, month: 5 };
const JUNE = { year: 2026, month: 6 };

/** A field of thirty unless said otherwise — placement is high-is-better. */
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

function record(over: Partial<ScorableRecord> = {}): ScorableRecord {
  return {
    playerId: "7",
    facts: [],
    clubTournaments: [],
    settledSeasons: [],
    ...over,
  };
}

/** How far along one rule, by rule id. */
function reached(rec: ScorableRecord, ruleId: string, season = MAY): number {
  const rule = ruleById(ruleId)!;
  return score(rec, { season }, [rule])[0]!.reached;
}

function closed(rec: ScorableRecord, ruleId: string, season = MAY): boolean {
  const rule = ruleById(ruleId)!;
  return score(rec, { season }, [rule])[0]!.closed;
}

describe("counting tournaments", () => {
  test("playing one tournament closes «Новый игрок» and no more", () => {
    const rec = record({ facts: [fact()] });
    expect(closed(rec, "first-tournament")).toBe(true);
    expect(closed(rec, "played-5")).toBe(false);
    expect(reached(rec, "played-5")).toBe(1);
  });

  test("a placement in the rating zone closes «Первая кровь»", () => {
    expect(closed(record({ facts: [fact({ basePoints: 12 })] }), "first-blood")).toBe(true);
    expect(closed(record({ facts: [fact({ basePoints: 0 })] }), "first-blood")).toBe(false);
  });

  test("top three is a podium, fourth is not", () => {
    expect(closed(record({ facts: [fact({ placement: 28 })] }), "podium")).toBe(true);
    expect(closed(record({ facts: [fact({ placement: 27 })] }), "podium")).toBe(false);
  });

  test("finishing first is a win", () => {
    expect(closed(record({ facts: [fact({ placement: 30 })] }), "champion")).toBe(true);
    expect(closed(record({ facts: [fact({ placement: 29 })] }), "champion")).toBe(false);
  });

  test("tenth place is a final table, eleventh is not", () => {
    const tenth = record({ facts: [fact({ placement: 21 })] });
    const eleventh = record({ facts: [fact({ placement: 20 })] });
    expect(reached(tenth, "final-tables-5")).toBe(1);
    expect(reached(eleventh, "final-tables-5")).toBe(0);
  });
});

describe("counts compare as whole knockouts", () => {
  test("9.5 knockouts leaves «Охотник» unclosed and reports nine", () => {
    const rec = record({ facts: [fact({ knockouts: 9.5 })] });
    expect(reached(rec, "knockouts-10")).toBe(9);
    expect(closed(rec, "knockouts-10")).toBe(false);
  });

  test("fractional shares that sum to ten close the rule despite binary residue", () => {
    // Thirds do not sum to exactly ten in double precision.
    const thirds = Array.from({ length: 30 }, () => fact({ knockouts: 1 / 3 }));
    const rec = record({ facts: thirds });
    expect(reached(rec, "knockouts-10")).toBe(10);
    expect(closed(rec, "knockouts-10")).toBe(true);
  });

  test("«Меткий» is the best single tournament, not the sum", () => {
    const rec = record({
      facts: [
        fact({ tournamentId: 1, knockouts: 4 }),
        fact({ tournamentId: 2, knockouts: 5 }),
      ],
    });
    // Nine across two evenings is not seven in one.
    expect(reached(rec, "knockouts-7-in-one")).toBe(5);
    expect(closed(rec, "knockouts-7-in-one")).toBe(false);
    expect(closed(rec, "knockouts-10")).toBe(false);
  });

  test("seven in one tournament closes «Меткий»", () => {
    const rec = record({ facts: [fact({ knockouts: 7 })] });
    expect(closed(rec, "knockouts-7-in-one")).toBe(true);
  });
});

describe("season scope resets each month", () => {
  const across = record({
    facts: [
      ...Array.from({ length: 4 }, (_, i) => fact({ tournamentId: i + 1 })),
      ...Array.from({ length: 4 }, (_, i) =>
        fact({ tournamentId: 10 + i, seasonYear: JUNE.year, seasonMonth: JUNE.month })
      ),
    ],
  });

  test("four games in each of two months close «Старт сезона» in neither", () => {
    expect(closed(across, "season-played-5", MAY)).toBe(false);
    expect(closed(across, "season-played-5", JUNE)).toBe(false);
  });

  test("the same eight games close the lifetime «Дебютант»", () => {
    expect(closed(across, "played-5")).toBe(true);
  });

  test("seasonal progress reads zero in a season with no games", () => {
    expect(reached(across, "season-played-5", { year: 2026, month: 7 })).toBe(0);
  });

  test("two wins in one season close «Дубль», spread across two do not", () => {
    const oneSeason = record({
      facts: [
        fact({ tournamentId: 1, placement: 30 }),
        fact({ tournamentId: 2, placement: 30 }),
      ],
    });
    const twoSeasons = record({
      facts: [
        fact({ tournamentId: 1, placement: 30 }),
        fact({
          tournamentId: 2,
          placement: 30,
          seasonYear: JUNE.year,
          seasonMonth: JUNE.month,
        }),
      ],
    });
    expect(closed(oneSeason, "double-season")).toBe(true);
    expect(closed(twoSeasons, "double-season")).toBe(false);
  });
});

describe("streaks walk the club's sequence", () => {
  const club = [1, 2, 3, 4].map((tournamentId) => ({ tournamentId }));

  test("present at the last three gives a streak of three", () => {
    const rec = record({
      clubTournaments: club,
      facts: [2, 3, 4].map((tournamentId) => fact({ tournamentId })),
    });
    expect(reached(rec, "streak-3")).toBe(3);
    expect(closed(rec, "streak-3")).toBe(true);
  });

  test("skipping the middle one ends the run there", () => {
    const rec = record({
      clubTournaments: club,
      facts: [1, 2, 4].map((tournamentId) => fact({ tournamentId })),
    });
    expect(reached(rec, "streak-3")).toBe(1);
  });

  test("missing the most recent tournament leaves no current run", () => {
    const rec = record({
      clubTournaments: club,
      facts: [1, 2, 3].map((tournamentId) => fact({ tournamentId })),
    });
    expect(reached(rec, "streak-3")).toBe(0);
  });

  test("a tournament the player was never invited to breaks the run like any other", () => {
    // Tournament 3 is an invite-only month final; the player has no fact for
    // it, and the club's sequence does not care why.
    const rec = record({
      clubTournaments: club,
      facts: [1, 2, 4].map((tournamentId) => fact({ tournamentId })),
    });
    expect(reached(rec, "streak-3")).toBe(1);
  });
});

describe("the MVP family counts seasons", () => {
  test("seasons led count towards «MVP сезона»", () => {
    const rec = record({
      settledSeasons: [{ year: 2026, month: 4, leaderPlayerId: "7" }],
    });
    expect(closed(rec, "season-mvp")).toBe(true);
  });

  test("two settled seasons in a row close «Неудержимый»", () => {
    const rec = record({
      settledSeasons: [
        { year: 2026, month: 3, leaderPlayerId: "7" },
        { year: 2026, month: 4, leaderPlayerId: "7" },
      ],
    });
    expect(closed(rec, "mvp-streak-2")).toBe(true);
    expect(closed(rec, "mvp-streak-3")).toBe(false);
  });

  test("someone else in between breaks the run but keeps the count", () => {
    const rec = record({
      settledSeasons: [
        { year: 2026, month: 2, leaderPlayerId: "7" },
        { year: 2026, month: 3, leaderPlayerId: "9" },
        { year: 2026, month: 4, leaderPlayerId: "7" },
      ],
    });
    expect(closed(rec, "mvp-streak-2")).toBe(false);
    expect(reached(rec, "season-mvp")).toBe(2);
  });

  test("a season nobody led does not count as led", () => {
    const rec = record({
      settledSeasons: [{ year: 2026, month: 4, leaderPlayerId: null }],
    });
    expect(closed(rec, "season-mvp")).toBe(false);
  });
});

describe("scoring the whole catalogue", () => {
  test("every active rule gets an entry, closed or not", () => {
    const progress = score(record({ facts: [fact()] }), { season: MAY });
    expect(progress).toHaveLength(26);
    for (const entry of progress) {
      expect(entry.threshold).toBeGreaterThan(0);
      expect(entry.reached).toBeGreaterThanOrEqual(0);
      expect(entry.closed).toBe(entry.reached >= entry.threshold);
    }
  });

  test("an empty record closes nothing and throws nothing", () => {
    const progress = score(record(), { season: null });
    expect(progress.filter((p) => p.closed)).toEqual([]);
  });

  test("the same record and context always give the same answer", () => {
    const rec = record({ facts: [fact({ knockouts: 3.5, placement: 30 })] });
    expect(score(rec, { season: MAY })).toEqual(score(rec, { season: MAY }));
  });
});
