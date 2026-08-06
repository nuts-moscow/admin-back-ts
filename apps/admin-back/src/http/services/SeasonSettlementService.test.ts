import { describe, expect, test } from "bun:test";
import type { PoolClient } from "pg";
import type { AwardInsert } from "../../postgres/PlayerAchievementRepository";
import type { SettledSeason } from "../../postgres/SeasonSettlementRepository";
import { SeasonSettlementService, type Season } from "./SeasonSettlementService";

const CLIENT = {} as PoolClient;

function harness(opts: {
  seasons: Season[];
  standings: Record<string, Array<{ playerId: string; totalPoints: number }>>;
  settled?: SettledSeason[];
}) {
  const settled: SettledSeason[] = [...(opts.settled ?? [])];
  const awarded: AwardInsert[] = [];
  const key = (y: number, m: number) => `${y}-${m}`;

  const svc = new SeasonSettlementService(
    {
      async listSeasonsWithTournaments() {
        return opts.seasons;
      },
      async getSeasonalRating(year, month) {
        return opts.standings[key(year, month)] ?? [];
      },
      async lastTournamentOfSeason(year, month) {
        return { id: year * 100 + month, dateMs: (year * 100 + month) * 1_000 };
      },
    },
    {
      async listSettled() {
        return settled;
      },
      async settleWithClient(_c, season) {
        if (settled.some((s) => s.year === season.year && s.month === season.month)) {
          return false;
        }
        settled.push(season);
        return true;
      },
    },
    {
      async awardWithClient(_c, awards) {
        awarded.push(...awards);
        return awards.length;
      },
    }
  );
  return { svc, settled, awarded };
}

const ALICE = [{ playerId: "1", totalPoints: 100 }, { playerId: "2", totalPoints: 50 }];
const BOB = [{ playerId: "2", totalPoints: 100 }, { playerId: "1", totalPoints: 50 }];

describe("a season is settled by its successor", () => {
  test("completing in June settles May and leaves June alone", async () => {
    const h = harness({
      seasons: [{ year: 2026, month: 5 }, { year: 2026, month: 6 }],
      standings: { "2026-5": ALICE, "2026-6": BOB },
    });

    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 6 });

    expect(h.settled.map((s) => s.month)).toEqual([5]);
    expect(h.awarded.filter((a) => a.ruleId === "season-mvp")).toHaveLength(1);
    expect(h.awarded[0]!.playerId).toBe(1);
  });

  test("the award is dated to the season's last tournament, not to now", async () => {
    const h = harness({
      seasons: [{ year: 2026, month: 5 }, { year: 2026, month: 6 }],
      standings: { "2026-5": ALICE },
    });
    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 6 });
    expect(h.awarded[0]!.earnedAt).toEqual(new Date(202_605 * 1_000));
  });

  test("a season with no later tournament settles nobody", async () => {
    const h = harness({ seasons: [{ year: 2026, month: 6 }], standings: { "2026-6": ALICE } });
    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 6 });
    expect(h.settled).toEqual([]);
    expect(h.awarded).toEqual([]);
  });

  test("settling twice awards nothing the second time", async () => {
    const h = harness({
      seasons: [{ year: 2026, month: 5 }, { year: 2026, month: 6 }],
      standings: { "2026-5": ALICE },
    });
    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 6 });
    const after = h.awarded.length;
    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 6 });
    expect(h.awarded).toHaveLength(after);
  });
});

describe("a season without tournaments is not a season", () => {
  test("MVP in January and March with an empty February closes «Неудержимый»", async () => {
    // February never held a rated tournament, so it is not in the sequence at
    // all — the run is January then March, and it is a run of two.
    const h = harness({
      seasons: [
        { year: 2026, month: 1 },
        { year: 2026, month: 3 },
        { year: 2026, month: 4 },
      ],
      standings: { "2026-1": ALICE, "2026-3": ALICE },
    });

    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 4 });

    expect(h.settled.map((s) => s.month)).toEqual([1, 3]);
    expect(h.awarded.map((a) => a.ruleId)).toContain("mvp-streak-2");
    expect(h.awarded.map((a) => a.ruleId)).not.toContain("mvp-streak-3");
  });

  test("a different leader between two wins breaks the run", async () => {
    const h = harness({
      seasons: [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
        { year: 2026, month: 4 },
      ],
      standings: { "2026-1": ALICE, "2026-2": BOB, "2026-3": ALICE },
    });

    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 4 });

    expect(h.awarded.map((a) => a.ruleId)).not.toContain("mvp-streak-2");
  });

  test("three in a row closes both streak rules", async () => {
    const h = harness({
      seasons: [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
        { year: 2026, month: 4 },
      ],
      standings: { "2026-1": ALICE, "2026-2": ALICE, "2026-3": ALICE },
    });

    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 4 });

    const ids = h.awarded.map((a) => a.ruleId);
    expect(ids).toContain("mvp-streak-2");
    expect(ids).toContain("mvp-streak-3");
  });
});

describe("a season without a clear leader", () => {
  test("a tie settles the season and awards nobody", async () => {
    const h = harness({
      seasons: [{ year: 2026, month: 5 }, { year: 2026, month: 6 }],
      standings: {
        "2026-5": [
          { playerId: "1", totalPoints: 100 },
          { playerId: "2", totalPoints: 100 },
        ],
      },
    });

    await h.svc.settleUpTo(CLIENT, { year: 2026, month: 6 });

    expect(h.settled).toHaveLength(1);
    expect(h.settled[0]!.leaderPlayerId).toBeNull();
    expect(h.awarded).toEqual([]);
  });
});
