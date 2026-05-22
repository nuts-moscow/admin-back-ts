import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

/** Cash desk snapshot stored as JSONB (shape matches CashDeskResponse from InGameUserStateService) */
export type CashDeskSnapshot = Record<string, unknown>;

export interface TournamentCashSnapshotRepository {
  save(tournamentId: number, cashDesk: CashDeskSnapshot): Promise<boolean>;
  findByTournamentId(tournamentId: number): Promise<CashDeskSnapshot | null>;
}

class TournamentCashSnapshotRepositoryImpl
  implements TournamentCashSnapshotRepository
{
  async save(tournamentId: number, cashDesk: CashDeskSnapshot): Promise<boolean> {
    try {
      await PostgresClient.instance.query(
        `INSERT INTO tournament_cash_snapshots (tournament_id, cash_desk)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (tournament_id) DO UPDATE SET cash_desk = EXCLUDED.cash_desk`,
        [tournamentId, JSON.stringify(cashDesk)]
      );
      return true;
    } catch (err) {
      logger.info(
        { err, tournamentId },
        "[Postgres] TournamentCashSnapshotRepository.save failed"
      );
      return false;
    }
  }

  async findByTournamentId(
    tournamentId: number
  ): Promise<CashDeskSnapshot | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT cash_desk FROM tournament_cash_snapshots WHERE tournament_id = $1",
        [tournamentId]
      );
      const row = result.rows[0] as { cash_desk: unknown } | undefined;
      if (!row || row.cash_desk == null) return null;
      return typeof row.cash_desk === "object" && row.cash_desk !== null
        ? (row.cash_desk as CashDeskSnapshot)
        : (JSON.parse(String(row.cash_desk)) as CashDeskSnapshot);
    } catch (err) {
      logger.info(
        { err, tournamentId },
        "[Postgres] TournamentCashSnapshotRepository.findByTournamentId failed"
      );
      return null;
    }
  }
}

export const tournamentCashSnapshotRepository: TournamentCashSnapshotRepository =
  new TournamentCashSnapshotRepositoryImpl();
