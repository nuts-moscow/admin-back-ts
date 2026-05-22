import type { PoolClient } from "pg";
import type { TournamentRatingBreakdown } from "../domain/TournamentRatingBreakdown";
import {
  isTournamentRatingBreakdown,
  normalizeTournamentRatingBreakdown,
  ratingWithManualAdjustment,
} from "../domain/TournamentRatingBreakdown";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

const LOG_PREFIX = "[PlayerTournamentRatingFactsRepository]";

export interface PlayerTournamentRatingFactInsert {
  playerId: string;
  tournamentPlayerId: number;
  tournamentDateMs: number;
  ratingTableId: number;
  ratingFieldSize: number;
  playerStatus: string;
  placement: number | null;
  breakdown: TournamentRatingBreakdown;
  ratingSeasonYear: number | null;
  ratingSeasonMonth: number | null;
}

export interface SeasonalRatingEntry {
  playerId: string;
  totalPoints: number;
  tournamentCount: number;
}

export interface PlayerTournamentRatingFactsRepository {
  replaceForTournament(
    tournamentId: number,
    rows: PlayerTournamentRatingFactInsert[]
  ): Promise<boolean>;
  replaceForTournamentWithClient(
    client: PoolClient,
    tournamentId: number,
    rows: PlayerTournamentRatingFactInsert[]
  ): Promise<boolean>;
  updateManualAdjustmentWithClient(
    client: PoolClient,
    tournamentId: number,
    playerId: string,
    manualAdjustment: number
  ): Promise<boolean>;
  updateSeasonForTournamentWithClient(
    client: PoolClient,
    tournamentId: number,
    year: number | null,
    month: number | null
  ): Promise<boolean>;
  getSeasonalRating(year: number, month: number): Promise<SeasonalRatingEntry[]>;
}

function breakdownToRowParams(b: TournamentRatingBreakdown): {
  basePoints: number;
  guaranteeBonus: number;
  pointsCoefficient: number;
  fromTableAfterCoefficient: number;
  bountyCount: number;
  bountyPoints: number;
  bountyCoefficient: number;
  nonPlacementAccrued: number;
  manualAdjustment: number;
  totalPoints: number;
} {
  const n = normalizeTournamentRatingBreakdown(b);
  return {
    basePoints: n.basePoints,
    guaranteeBonus: n.guaranteeBonus,
    pointsCoefficient: n.pointsCoefficient,
    fromTableAfterCoefficient: n.fromTableAfterCoefficient,
    bountyCount: n.bountyCount,
    bountyPoints: n.bountyPoints,
    bountyCoefficient: n.bountyCoefficient,
    nonPlacementAccrued: n.nonPlacementAccrued,
    manualAdjustment: n.manualAdjustment,
    totalPoints: n.totalPoints,
  };
}

class PlayerTournamentRatingFactsRepositoryImpl
  implements PlayerTournamentRatingFactsRepository
{
  async replaceForTournament(
    tournamentId: number,
    rows: PlayerTournamentRatingFactInsert[]
  ): Promise<boolean> {
    try {
      const client = await PostgresClient.instance.connect();
      try {
        await client.query("BEGIN");
        const ok = await this.replaceForTournamentWithClient(client, tournamentId, rows);
        if (!ok) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query("COMMIT");
        return true;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.info({ err, tournamentId }, `${LOG_PREFIX} replaceForTournament failed`);
      return false;
    }
  }

  async replaceForTournamentWithClient(
    client: PoolClient,
    tournamentId: number,
    rows: PlayerTournamentRatingFactInsert[]
  ): Promise<boolean> {
    await client.query(
      `DELETE FROM player_tournament_rating_facts WHERE tournament_id = $1`,
      [tournamentId]
    );
    for (const r of rows) {
      const p = breakdownToRowParams(r.breakdown);
      await client.query(
        `INSERT INTO player_tournament_rating_facts (
          tournament_id, player_id, tournament_player_id, tournament_date_ms,
          rating_table_id, rating_field_size, player_status, placement,
          base_points, guarantee_bonus, points_coefficient, from_table_after_coefficient,
          bounty_count, bounty_points, bounty_coefficient, non_placement_accrued,
          manual_adjustment, total_points, breakdown, rating_season_year, rating_season_month
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21
        )`,
        [
          tournamentId,
          r.playerId,
          r.tournamentPlayerId,
          r.tournamentDateMs,
          r.ratingTableId,
          r.ratingFieldSize,
          r.playerStatus,
          r.placement,
          p.basePoints,
          p.guaranteeBonus,
          p.pointsCoefficient,
          p.fromTableAfterCoefficient,
          p.bountyCount,
          p.bountyPoints,
          p.bountyCoefficient,
          p.nonPlacementAccrued,
          p.manualAdjustment,
          p.totalPoints,
          JSON.stringify(r.breakdown),
          r.ratingSeasonYear,
          r.ratingSeasonMonth,
        ]
      );
    }
    return true;
  }

  async updateManualAdjustmentWithClient(
    client: PoolClient,
    tournamentId: number,
    playerId: string,
    manualAdjustment: number
  ): Promise<boolean> {
    const sel = await client.query(
      `SELECT breakdown FROM player_tournament_rating_facts
       WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, playerId]
    );
    if (sel.rows.length === 0) {
      logger.info(
        { tournamentId, playerId },
        `${LOG_PREFIX} updateManualAdjustment: facts row missing`
      );
      return false;
    }
    const raw = sel.rows[0]?.breakdown;
    const parsed =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;
    if (!isTournamentRatingBreakdown(parsed)) {
      logger.info({ tournamentId, playerId }, `${LOG_PREFIX} updateManualAdjustment: bad breakdown`);
      return false;
    }
    const merged = ratingWithManualAdjustment(
      normalizeTournamentRatingBreakdown(parsed),
      manualAdjustment
    );
    const res = await client.query(
      `UPDATE player_tournament_rating_facts
       SET manual_adjustment = $3,
           total_points = $4,
           breakdown = $5::jsonb
       WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, playerId, manualAdjustment, merged.totalPoints, JSON.stringify(merged)]
    );
    return res.rowCount != null && res.rowCount > 0;
  }

  async updateSeasonForTournamentWithClient(
    client: PoolClient,
    tournamentId: number,
    year: number | null,
    month: number | null
  ): Promise<boolean> {
    try {
      await client.query(
        `UPDATE player_tournament_rating_facts
         SET rating_season_year = $2, rating_season_month = $3
         WHERE tournament_id = $1`,
        [tournamentId, year, month]
      );
      return true;
    } catch (err) {
      logger.info(
        { err, tournamentId },
        `${LOG_PREFIX} updateSeasonForTournamentWithClient failed`
      );
      return false;
    }
  }

  async getSeasonalRating(year: number, month: number): Promise<SeasonalRatingEntry[]> {
    try {
      const res = await PostgresClient.instance.query(
        `SELECT player_id, SUM(total_points) AS total_points, COUNT(*) AS tournament_count
         FROM player_tournament_rating_facts
         WHERE rating_season_year = $1 AND rating_season_month = $2
         GROUP BY player_id
         ORDER BY SUM(total_points) DESC`,
        [year, month]
      );
      return res.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          playerId: String(r.player_id),
          totalPoints: Number(r.total_points),
          tournamentCount: Number(r.tournament_count),
        };
      });
    } catch (err) {
      logger.info({ err, year, month }, `${LOG_PREFIX} getSeasonalRating failed`);
      return [];
    }
  }
}

export const playerTournamentRatingFactsRepository: PlayerTournamentRatingFactsRepository =
  new PlayerTournamentRatingFactsRepositoryImpl();
