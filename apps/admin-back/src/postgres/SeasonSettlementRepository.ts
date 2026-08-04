import type { PoolClient } from "pg";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface SettledSeason {
  year: number;
  month: number;
  leaderPlayerId: string | null;
}

/**
 * The record of settled seasons. Append-only in practice: a season is settled
 * once and never revisited, which is what makes the settlement pass safe to
 * run again on every tournament completion.
 */
export interface SeasonSettlementRepository {
  listSettled(): Promise<SettledSeason[]>;
  settleWithClient(
    client: PoolClient,
    season: SettledSeason
  ): Promise<boolean>;
}

class SeasonSettlementRepositoryImpl implements SeasonSettlementRepository {
  async listSettled(): Promise<SettledSeason[]> {
    try {
      const res = await PostgresClient.instance.query(
        `SELECT season_year, season_month, leader_player_id
           FROM season_settlements
          ORDER BY season_year ASC, season_month ASC`
      );
      return res.rows.map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
          year: Number(r.season_year),
          month: Number(r.season_month),
          leaderPlayerId: r.leader_player_id == null ? null : String(r.leader_player_id),
        };
      });
    } catch (err) {
      logger?.error({ err }, "[SeasonSettlementRepository] listSettled failed");
      throw err;
    }
  }

  /** Answers whether this call is the one that settled it. */
  async settleWithClient(client: PoolClient, season: SettledSeason): Promise<boolean> {
    const res = await client.query(
      `INSERT INTO season_settlements (season_year, season_month, leader_player_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (season_year, season_month) DO NOTHING`,
      [season.year, season.month, season.leaderPlayerId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export const seasonSettlementRepository: SeasonSettlementRepository =
  new SeasonSettlementRepositoryImpl();
