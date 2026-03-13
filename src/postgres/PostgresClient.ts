import { Pool } from "pg";
import { ApplicationConfigs } from "../configs";

export class PostgresClient {
  private static _instance: Pool | null = null;

  static async init(): Promise<Pool> {
    if (PostgresClient._instance) {
      return PostgresClient._instance;
    }
    const { url, ssl, sslRejectUnauthorized } = ApplicationConfigs.instance.postgres;
    PostgresClient._instance = new Pool({
      connectionString: url,
      ssl: ssl ? { rejectUnauthorized: sslRejectUnauthorized } : false,
    });
    const client = await PostgresClient._instance.connect();
    await client.query("SELECT 1");
    client.release();
    return PostgresClient._instance;
  }

  static get instance(): Pool {
    if (!PostgresClient._instance) {
      throw new Error(
        "PostgresClient not initialized. Call init() at app start."
      );
    }
    return PostgresClient._instance;
  }
}
