import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface PlayerRepository {
  /** Returns nickname for player by id, or null if not found or on error */
  getNicknameById(playerId: string): Promise<string | null>;
}

class PlayerRepositoryImpl implements PlayerRepository {
  async getNicknameById(playerId: string): Promise<string | null> {
    try {
      const id = parseInt(playerId, 10);
      if (Number.isNaN(id)) {
        return null;
      }
      const result = await PostgresClient.instance.query(
        "SELECT nickname FROM players WHERE id = $1",
        [id]
      );
      const row = result.rows[0] as { nickname: string } | undefined;
      return row?.nickname ?? null;
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.getNicknameById failed");
      return null;
    }
  }
}

export const playerRepository: PlayerRepository = new PlayerRepositoryImpl();
