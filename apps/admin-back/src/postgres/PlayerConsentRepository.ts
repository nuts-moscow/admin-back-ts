import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface PlayerConsentRepository {
  /**
   * Records the player's acceptance of the given documents. Idempotent per
   * (player, document, version) — re-recording the same consent is a no-op.
   */
  record(
    playerId: number,
    docs: ReadonlyArray<{ slug: string; version: string }>,
    ip: string | null
  ): Promise<boolean>;
}

class PlayerConsentRepositoryImpl implements PlayerConsentRepository {
  async record(
    playerId: number,
    docs: ReadonlyArray<{ slug: string; version: string }>,
    ip: string | null
  ): Promise<boolean> {
    if (docs.length === 0) return true;
    try {
      const values: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const d of docs) {
        values.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(playerId, d.slug, d.version, ip);
      }
      await PostgresClient.instance.query(
        `INSERT INTO player_document_consents
           (player_id, document_slug, document_version, ip)
         VALUES ${values.join(", ")}
         ON CONFLICT (player_id, document_slug, document_version) DO NOTHING`,
        params
      );
      return true;
    } catch (err) {
      logger.error({ err, playerId }, "[Postgres] PlayerConsentRepository.record failed");
      return false;
    }
  }
}

export const playerConsentRepository: PlayerConsentRepository =
  new PlayerConsentRepositoryImpl();
