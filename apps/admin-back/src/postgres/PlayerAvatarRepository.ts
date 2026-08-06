import { logger } from "../logger";
import type { PoolClient } from "pg";
import { PostgresClient } from "./PostgresClient";

export interface PublishedAvatar {
  playerId: number;
  address: string;
  image: Buffer;
  contentType: string;
  publishedAt: Date;
}

export interface AvatarPublish {
  playerId: number;
  address: string;
  image: Buffer;
  contentType: string;
}

/**
 * The published avatars, and nothing about how they got here. Three operations:
 * write one, read one by its address, erase a player's.
 *
 * Who may call them is not this repository's business, but the shape of the
 * slice depends on it: the write is handed to the moderation service alone, so
 * the upload path cannot reach it even by accident.
 */
export interface PlayerAvatarRepository {
  publishWithClient(client: PoolClient, avatar: AvatarPublish): Promise<void>;
  findByAddress(address: string): Promise<PublishedAvatar | null>;
  findAddressForPlayer(playerId: number): Promise<string | null>;
  addressesForPlayers(playerIds: readonly number[]): Promise<Map<number, string>>;
  erase(playerId: number): Promise<boolean>;
}

const COLUMNS = "player_id, address, image, content_type, published_at";

function rowToAvatar(row: Record<string, unknown>): PublishedAvatar {
  return {
    playerId: Number(row.player_id),
    address: String(row.address),
    image: row.image as Buffer,
    contentType: String(row.content_type),
    publishedAt:
      row.published_at instanceof Date ? row.published_at : new Date(String(row.published_at)),
  };
}

class PlayerAvatarRepositoryImpl implements PlayerAvatarRepository {
  /**
   * Replaces whatever the player had. The address comes from the caller because
   * it is derived from the bytes and the player together — the store keeps it,
   * it does not mint it.
   */
  async publishWithClient(client: PoolClient, avatar: AvatarPublish): Promise<void> {
    await client.query(
      `INSERT INTO player_avatars (player_id, address, image, content_type, published_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (player_id) DO UPDATE
         SET address = EXCLUDED.address,
             image = EXCLUDED.image,
             content_type = EXCLUDED.content_type,
             published_at = now()`,
      [avatar.playerId, avatar.address, avatar.image, avatar.contentType]
    );
  }

  async findByAddress(address: string): Promise<PublishedAvatar | null> {
    try {
      const res = await PostgresClient.instance.query(
        `SELECT ${COLUMNS} FROM player_avatars WHERE address = $1`,
        [address]
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      return row ? rowToAvatar(row) : null;
    } catch (err) {
      logger?.error({ err, address }, "[PlayerAvatarRepository] findByAddress failed");
      throw err;
    }
  }

  async findAddressForPlayer(playerId: number): Promise<string | null> {
    try {
      const res = await PostgresClient.instance.query(
        "SELECT address FROM player_avatars WHERE player_id = $1",
        [playerId]
      );
      const row = res.rows[0] as { address?: unknown } | undefined;
      return row?.address == null ? null : String(row.address);
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAvatarRepository] findAddressForPlayer failed");
      throw err;
    }
  }

  /** The lists ask for many at once; the payloads already carry nicknames the same way. */
  async addressesForPlayers(playerIds: readonly number[]): Promise<Map<number, string>> {
    if (playerIds.length === 0) return new Map();
    try {
      const res = await PostgresClient.instance.query(
        "SELECT player_id, address FROM player_avatars WHERE player_id = ANY($1::int[])",
        [playerIds]
      );
      const out = new Map<number, string>();
      for (const r of res.rows as Record<string, unknown>[]) {
        out.set(Number(r.player_id), String(r.address));
      }
      return out;
    } catch (err) {
      logger?.error({ err }, "[PlayerAvatarRepository] addressesForPlayers failed");
      throw err;
    }
  }

  /** Answers whether there was anything to erase, so a takedown can say so. */
  async erase(playerId: number): Promise<boolean> {
    try {
      const res = await PostgresClient.instance.query(
        "DELETE FROM player_avatars WHERE player_id = $1",
        [playerId]
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAvatarRepository] erase failed");
      throw err;
    }
  }
}

export const playerAvatarRepository: PlayerAvatarRepository = new PlayerAvatarRepositoryImpl();
