import { describe, expect, test } from "bun:test";
import { PlayerRecordReader } from "./PlayerRecordReader";
import type { ClubTournament, PlayerTournamentFact } from "../../postgres/PlayerTournamentRatingFactsRepository";

function fact(over: Partial<PlayerTournamentFact>): PlayerTournamentFact {
  return {
    tournamentId: 1,
    tournamentDateMs: 1_000,
    seasonYear: 2026,
    seasonMonth: 5,
    placement: null,
    ratingFieldSize: 20,
    basePoints: 0,
    knockouts: 0,
    ...over,
  };
}

function reader(opts: {
  facts?: PlayerTournamentFact[];
  tournaments?: ClubTournament[];
  held?: string[];
}) {
  return new PlayerRecordReader(
    {
      async listFactsForPlayer() {
        return opts.facts ?? [];
      },
      async listRatedTournaments() {
        return opts.tournaments ?? [];
      },
    },
    {
      async listForPlayer() {
        return (opts.held ?? []).map((ruleId) => ({ ruleId }));
      },
    },
    {
      async listSettled() {
        return [];
      },
    }
  );
}

describe("PlayerRecordReader", () => {
  test("the record carries the player's facts and the club's tournament sequence", async () => {
    const record = await reader({
      facts: [fact({ tournamentId: 1 }), fact({ tournamentId: 3, tournamentDateMs: 3_000 })],
      tournaments: [
        { tournamentId: 1, tournamentDateMs: 1_000, seasonYear: 2026, seasonMonth: 5 },
        { tournamentId: 2, tournamentDateMs: 2_000, seasonYear: 2026, seasonMonth: 5 },
        { tournamentId: 3, tournamentDateMs: 3_000, seasonYear: 2026, seasonMonth: 5 },
      ],
    }).assemble(7);

    expect(record.playerId).toBe("7");
    expect(record.facts).toHaveLength(2);
    // The club held three; the player played two. The gap is what a streak reads.
    expect(record.clubTournaments).toHaveLength(3);
  });

  test("rules already held come back as a set", async () => {
    const record = await reader({ held: ["champion", "podium"] }).assemble(7);
    expect(record.heldRuleIds.has("champion")).toBe(true);
    expect(record.heldRuleIds.has("first-blood")).toBe(false);
  });

  test("a player with no history yields an empty record rather than failing", async () => {
    const record = await reader({}).assemble(99);
    expect(record.facts).toEqual([]);
    expect(record.heldRuleIds.size).toBe(0);
  });
});
