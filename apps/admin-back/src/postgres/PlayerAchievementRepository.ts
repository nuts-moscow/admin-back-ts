import { logger } from "../logger";
import type { PoolClient } from "pg";
import { PostgresClient } from "./PostgresClient";

export interface PlayerAchievement {
  playerId: number;
  ruleId: string;
  earnedAt: Date;
  tournamentId: number | null;
  seenAt: Date | null;
}

export interface AwardInsert {
  playerId: number;
  ruleId: string;
  tournamentId: number | null;
}

/**
 * Awards, and the one operation they support: being written. There is no
 * update and no delete — the store is append-only by design, because an award
 * once earned stands whatever later arithmetic says.
 *
 * `markSeen` is the exception that proves it: it touches a column that is not
 * part of the award, and leaves the rule and the date alone.
 */
export interface PlayerAchievementRepository {
  listForPlayer(playerId: number): Promise<PlayerAchievement[]>;
  countUnseen(playerId: number): Promise<number>;
  /**
   * Writes awards, skipping any the player already holds. Answers how many
   * rows were new, so a caller can tell a first pass from a repeat.
   */
  awardWithClient(client: PoolClient, awards: readonly AwardInsert[]): Promise<number>;
  award(awards: readonly AwardInsert[]): Promise<number>;
  markSeen(playerId: number): Promise<void>;
}

const COLUMNS = "player_id, rule_id, earned_at, tournament_id, seen_at";

function rowToAward(row: Record<string, unknown>): PlayerAchievement {
  return {
    playerId: Number(row.player_id),
    ruleId: String(row.rule_id),
    earnedAt: row.earned_at instanceof Date ? row.earned_at : new Date(String(row.earned_at)),
    tournamentId: row.tournament_id == null ? null : Number(row.tournament_id),
    seenAt:
      row.seen_at == null
        ? null
        : row.seen_at instanceof Date
          ? row.seen_at
          : new Date(String(row.seen_at)),
  };
}

class PlayerAchievementRepositoryImpl implements PlayerAchievementRepository {
  async listForPlayer(playerId: number): Promise<PlayerAchievement[]> {
    try {
      const res = await PostgresClient.instance.query(
        `SELECT ${COLUMNS} FROM player_achievements WHERE player_id = $1 ORDER BY earned_at`,
        [playerId]
      );
      return res.rows.map((r) => rowToAward(r as Record<string, unknown>));
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAchievementRepository] listForPlayer failed");
      throw err;
    }
  }

  async countUnseen(playerId: number): Promise<number> {
    try {
      const res = await PostgresClient.instance.query(
        "SELECT count(*) AS n FROM player_achievements WHERE player_id = $1 AND seen_at IS NULL",
        [playerId]
      );
      return Number((res.rows[0] as { n?: unknown })?.n ?? 0);
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAchievementRepository] countUnseen failed");
      throw err;
    }
  }

  async awardWithClient(
    client: PoolClient,
    awards: readonly AwardInsert[]
  ): Promise<number> {
    if (awards.length === 0) return 0;
    const values: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const a of awards) {
      values.push(`($${i++}, $${i++}, $${i++})`);
      params.push(a.playerId, a.ruleId, a.tournamentId);
    }
    // The conflict clause is the whole idempotence story: a rule the player
    // already holds keeps its original earned_at, untouched.
    const res = await client.query(
      `INSERT INTO player_achievements (player_id, rule_id, tournament_id)
       VALUES ${values.join(", ")}
       ON CONFLICT (player_id, rule_id) DO NOTHING`,
      params
    );
    return res.rowCount ?? 0;
  }

  async award(awards: readonly AwardInsert[]): Promise<number> {
    if (awards.length === 0) return 0;
    const client = await PostgresClient.instance.connect();
    try {
      return await this.awardWithClient(client, awards);
    } finally {
      client.release();
    }
  }

  async markSeen(playerId: number): Promise<void> {
    try {
      await PostgresClient.instance.query(
        "UPDATE player_achievements SET seen_at = now() WHERE player_id = $1 AND seen_at IS NULL",
        [playerId]
      );
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAchievementRepository] markSeen failed");
      throw err;
    }
  }
}

export const playerAchievementRepository: PlayerAchievementRepository =
  new PlayerAchievementRepositoryImpl();
