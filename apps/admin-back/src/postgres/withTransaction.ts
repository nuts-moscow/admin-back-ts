import type { PoolClient } from "pg";
import { PostgresClient } from "./PostgresClient";

/**
 * Runs `fn` inside BEGIN/COMMIT; ROLLBACK on throw. Releases the client in `finally`.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await PostgresClient.instance.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
