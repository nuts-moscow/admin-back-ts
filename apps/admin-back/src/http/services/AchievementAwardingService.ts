// `logger` is initialised at app startup; unit tests construct this service
// directly, so every call site guards instead of assuming it is up.
import { logger } from "../../logger";
import type { PoolClient } from "pg";
import { activeRules } from "../../domain/achievements/catalog";
import { score } from "../../domain/achievements/scorer";
import type { AchievementRule } from "../../domain/achievements/types";
import type { AwardInsert } from "../../postgres/PlayerAchievementRepository";
import { playerAchievementRepository } from "../../postgres/PlayerAchievementRepository";
import type { Queryable } from "../../postgres/PlayerTournamentRatingFactsRepository";
import { PostgresClient } from "../../postgres/PostgresClient";
import { type PlayerRecord, playerRecordReader } from "./PlayerRecordReader";
import type { Season } from "./SeasonSettlementService";

export interface RecordSource {
  assemble(playerId: number, on?: Queryable): Promise<PlayerRecord>;
}

export interface AwardSink {
  awardWithClient(client: PoolClient, awards: readonly AwardInsert[]): Promise<number>;
}

/** Everyone the club has a record for — the history pass walks this. */
export interface PlayerDirectory {
  listPlayerIds(on?: Queryable): Promise<number[]>;
}

/**
 * The pass that turns a standing into an award.
 *
 * It runs inside the transaction that completed the tournament, so every
 * player in the field is weighed against one snapshot: being a tournament late
 * costs nothing, but a pass that disagreed with itself could not be debugged
 * from a complaint.
 *
 * The same pass runs over the whole club, which is how a rollout and a
 * catalogue change are handled — never a script with its own copy of the
 * rules.
 */
export class AchievementAwardingService {
  constructor(
    private readonly records: RecordSource,
    private readonly awards: AwardSink,
    private readonly directory: PlayerDirectory
  ) {}

  /** Weighs the field of one finished tournament. */
  async runForField(
    client: PoolClient,
    input: { playerIds: readonly number[]; tournamentId: number; season: Season | null }
  ): Promise<number> {
    let written = 0;
    for (const playerId of input.playerIds) {
      written += await this.weighOne(client, playerId, input.tournamentId, input.season);
    }
    logger?.info(
      { tournamentId: input.tournamentId, players: input.playerIds.length, written },
      "[AchievementAwarding] field weighed"
    );
    return written;
  }

  /**
   * Weighs every player the club knows. Safe to run at any time: the store
   * skips rules already held, so a second run writes nothing.
   */
  async runOverHistory(client: PoolClient, season: Season | null): Promise<number> {
    const playerIds = await this.directory.listPlayerIds(client);
    let written = 0;
    for (const playerId of playerIds) {
      // No tournament closed these: they were already true when the rule
      // appeared, so the award carries no tournament.
      written += await this.weighOne(client, playerId, null, season);
    }
    logger?.info(
      { players: playerIds.length, written },
      "[AchievementAwarding] history weighed"
    );
    return written;
  }

  private async weighOne(
    client: PoolClient,
    playerId: number,
    tournamentId: number | null,
    season: Season | null
  ): Promise<number> {
    const record = await this.records.assemble(playerId, client);
    const rules = activeRules();
    const standing = score(record, { season }, rules);

    const toAward: AwardInsert[] = [];
    for (const entry of standing) {
      if (!entry.closed) continue;
      if (record.heldRuleIds.has(entry.ruleId)) continue;
      if (isSettlementOwned(rules, entry.ruleId)) continue;
      toAward.push({ playerId, ruleId: entry.ruleId, tournamentId });
    }
    if (toAward.length === 0) return 0;
    return this.awards.awardWithClient(client, toAward);
  }
}

/**
 * The MVP family is closed by the season settlement, which knows the standings
 * and the date the season actually ended. If this pass wrote them too, the
 * award would carry today's date and the wrong tournament.
 */
function isSettlementOwned(rules: readonly AchievementRule[], ruleId: string): boolean {
  const rule = rules.find((r) => r.id === ruleId);
  return rule?.unit === "season";
}

export const achievementAwardingService = new AchievementAwardingService(
  playerRecordReader,
  playerAchievementRepository,
  {
    async listPlayerIds(on) {
      const res = await (on ?? PostgresClient.instance).query(
        "SELECT id FROM players ORDER BY id"
      );
      return res.rows.map((r) => Number((r as { id: unknown }).id));
    },
  }
);
