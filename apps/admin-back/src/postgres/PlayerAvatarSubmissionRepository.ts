import { logger } from "../logger";
import type { PoolClient } from "pg";
import { PostgresClient } from "./PostgresClient";

export type SubmissionState = "pending" | "refused";

export interface AvatarSubmission {
  playerId: number;
  /** The identity a verdict answers; changes whenever the bytes change. */
  submissionId: string;
  state: SubmissionState;
  /** Null once a verdict has been reached — refusing drops the picture. */
  image: Buffer | null;
  contentType: string;
  fingerprint: string;
  submittedAt: Date;
  decidedAt: Date | null;
}

export interface SubmissionInsert {
  playerId: number;
  submissionId: string;
  image: Buffer;
  contentType: string;
  fingerprint: string;
}

/**
 * Pictures waiting for a human, one row per player.
 *
 * The upsert is the shape of the storage, not a cleanup pass: a second upload
 * displaces the first, so the queue never grows past the number of players
 * waiting. What survives a verdict is deliberately thin: a refusal leaves a
 * state and a fingerprint, an approval leaves nothing at all. Never the picture.
 */
export interface PlayerAvatarSubmissionRepository {
  /** Replaces the player's row, discarding whatever it displaced. */
  hold(submission: SubmissionInsert): Promise<AvatarSubmission>;
  find(playerId: number, on?: PoolClient): Promise<AvatarSubmission | null>;
  listPending(): Promise<AvatarSubmission[]>;
  /**
   * Marks the submission refused and drops its picture, but only while
   * `submissionId` still matches — the caller learns from the answer whether
   * the player swapped the bytes underneath it.
   */
  refuseWithClient(
    client: PoolClient,
    playerId: number,
    submissionId: string
  ): Promise<AvatarSubmission | null>;
  /**
   * Takes an allowed submission out of the queue entirely: it has become the
   * avatar, and there is no waiting left to describe. Same identity guard.
   */
  clearWithClient(
    client: PoolClient,
    playerId: number,
    submissionId: string
  ): Promise<boolean>;
  rememberRefusalWithClient(
    client: PoolClient,
    playerId: number,
    fingerprint: string
  ): Promise<void>;
  wasRefused(playerId: number, fingerprint: string): Promise<boolean>;
  countRefusals(playerId: number): Promise<number>;
}

const COLUMNS =
  "player_id, submission_id, state, image, content_type, fingerprint, submitted_at, decided_at";

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(String(v));
}

function rowToSubmission(row: Record<string, unknown>): AvatarSubmission {
  return {
    playerId: Number(row.player_id),
    submissionId: String(row.submission_id),
    state: String(row.state) as SubmissionState,
    image: row.image == null ? null : (row.image as Buffer),
    contentType: String(row.content_type),
    fingerprint: String(row.fingerprint),
    submittedAt: toDate(row.submitted_at),
    decidedAt: row.decided_at == null ? null : toDate(row.decided_at),
  };
}

class PlayerAvatarSubmissionRepositoryImpl implements PlayerAvatarSubmissionRepository {
  async hold(submission: SubmissionInsert): Promise<AvatarSubmission> {
    try {
      // The conflict clause is the whole "one waiting picture per player" story:
      // the previous bytes are overwritten, and a refused row becomes pending
      // again. How often this player has been turned down is not carried here —
      // it is counted from the refusals table, which outlives every row.
      const res = await PostgresClient.instance.query(
        `INSERT INTO player_avatar_submissions
           (player_id, submission_id, state, image, content_type, fingerprint, submitted_at, decided_at)
         VALUES ($1, $2, 'pending', $3, $4, $5, now(), NULL)
         ON CONFLICT (player_id) DO UPDATE
           SET submission_id = EXCLUDED.submission_id,
               state = 'pending',
               image = EXCLUDED.image,
               content_type = EXCLUDED.content_type,
               fingerprint = EXCLUDED.fingerprint,
               submitted_at = now(),
               decided_at = NULL
         RETURNING ${COLUMNS}`,
        [
          submission.playerId,
          submission.submissionId,
          submission.image,
          submission.contentType,
          submission.fingerprint,
        ]
      );
      return rowToSubmission(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      logger?.error(
        { err, playerId: submission.playerId },
        "[PlayerAvatarSubmissionRepository] hold failed"
      );
      throw err;
    }
  }

  async find(playerId: number, on?: PoolClient): Promise<AvatarSubmission | null> {
    try {
      const res = await (on ?? PostgresClient.instance).query(
        `SELECT ${COLUMNS} FROM player_avatar_submissions WHERE player_id = $1`,
        [playerId]
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      return row ? rowToSubmission(row) : null;
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAvatarSubmissionRepository] find failed");
      throw err;
    }
  }

  /** Only pending rows: a refused one lives on for its fingerprint, not for the queue. */
  async listPending(): Promise<AvatarSubmission[]> {
    try {
      const res = await PostgresClient.instance.query(
        `SELECT ${COLUMNS} FROM player_avatar_submissions
         WHERE state = 'pending'
         ORDER BY submitted_at`
      );
      return (res.rows as Record<string, unknown>[]).map(rowToSubmission);
    } catch (err) {
      logger?.error({ err }, "[PlayerAvatarSubmissionRepository] listPending failed");
      throw err;
    }
  }

  async refuseWithClient(
    client: PoolClient,
    playerId: number,
    submissionId: string
  ): Promise<AvatarSubmission | null> {
    // The `submission_id` in the WHERE clause is the whole race story: if the
    // player replaced the picture since the admin looked, no row matches and
    // nothing at all happens.
    const res = await client.query(
      `UPDATE player_avatar_submissions
          SET state = 'refused',
              image = NULL,
              decided_at = now()
        WHERE player_id = $1 AND submission_id = $2 AND state = 'pending'
        RETURNING ${COLUMNS}`,
      [playerId, submissionId]
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToSubmission(row) : null;
  }

  async clearWithClient(
    client: PoolClient,
    playerId: number,
    submissionId: string
  ): Promise<boolean> {
    const res = await client.query(
      `DELETE FROM player_avatar_submissions
        WHERE player_id = $1 AND submission_id = $2 AND state = 'pending'`,
      [playerId, submissionId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async rememberRefusalWithClient(
    client: PoolClient,
    playerId: number,
    fingerprint: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO player_avatar_refusals (player_id, fingerprint)
       VALUES ($1, $2)
       ON CONFLICT (player_id, fingerprint) DO NOTHING`,
      [playerId, fingerprint]
    );
  }

  async wasRefused(playerId: number, fingerprint: string): Promise<boolean> {
    try {
      const res = await PostgresClient.instance.query(
        "SELECT 1 FROM player_avatar_refusals WHERE player_id = $1 AND fingerprint = $2",
        [playerId, fingerprint]
      );
      return res.rows.length > 0;
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAvatarSubmissionRepository] wasRefused failed");
      throw err;
    }
  }

  async countRefusals(playerId: number): Promise<number> {
    try {
      const res = await PostgresClient.instance.query(
        "SELECT count(*) AS n FROM player_avatar_refusals WHERE player_id = $1",
        [playerId]
      );
      return Number((res.rows[0] as { n?: unknown })?.n ?? 0);
    } catch (err) {
      logger?.error({ err, playerId }, "[PlayerAvatarSubmissionRepository] countRefusals failed");
      throw err;
    }
  }
}

export const playerAvatarSubmissionRepository: PlayerAvatarSubmissionRepository =
  new PlayerAvatarSubmissionRepositoryImpl();
