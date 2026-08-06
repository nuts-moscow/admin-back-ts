import { logger } from "../../logger";
import {
  playerAvatarRepository,
  playerAvatarSubmissionRepository,
} from "../../postgres";
import { RedisClient } from "../../redis";
import { imageNormalizer, MAX_UPLOAD_BYTES } from "./ImageNormalizer";
import { AvatarModerationService } from "./AvatarModerationService";

export type SubmissionView =
  | { state: "none" }
  | { state: "pending"; submissionId: string; submittedAt: string }
  | { state: "refused" };

export type UploadOutcome =
  | { ok: true; submission: SubmissionView }
  | { ok: false; status: number; error: string };

/** A handful an hour, generous enough that nobody choosing between two photos meets it. */
const RATE_LIMIT = 6;
const RATE_WINDOW_SECONDS = 3600;

export interface IntakeDeps {
  withinRateLimit(playerId: number): Promise<boolean>;
  normalize(input: Uint8Array): Promise<{ ok: true; image: Buffer; contentType: string } | { ok: false }>;
  wasRefused(playerId: number, fingerprint: string): Promise<boolean>;
  hold(input: {
    playerId: number;
    submissionId: string;
    image: Buffer;
    contentType: string;
    fingerprint: string;
  }): Promise<{ submissionId: string; submittedAt: Date }>;
}

/**
 * The door on the write side.
 *
 * The order matters and is the requirement: size ceiling, rate limit, sandbox,
 * the fingerprint of what this player has already been refused, then one write
 * to the queue. The two free checks come before the expensive one, so a flood
 * costs the club nothing. The fingerprint is the exception that has to come
 * after the decode, and the comment below says why.
 *
 * Nothing here waits on a human: the request ends at the queue, and the verdict
 * arrives days later on a different request entirely.
 *
 * This service has no reference to the published avatar store. Not "does not
 * call it" — cannot: the only import from postgres here is the queue and a read
 * of the player's current address, and the store's write is handed to
 * `AvatarModerationService` alone.
 */
export class AvatarIntakeService {
  constructor(private readonly deps: IntakeDeps = defaultDeps) {}

  async upload(playerId: number, body: Uint8Array): Promise<UploadOutcome> {
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return { ok: false, status: 413, error: "Изображение слишком большое" };
    }

    if (!(await this.deps.withinRateLimit(playerId))) {
      return { ok: false, status: 429, error: "Слишком часто, попробуйте позже" };
    }

    const normalized = await this.deps.normalize(body);
    if (!normalized.ok) {
      return { ok: false, status: 400, error: "Не удалось прочитать изображение" };
    }

    // Asked after normalizing rather than before, because the fingerprint is of
    // the normalized bytes: re-encoding the same photo differently must not be
    // a way to put a refused picture back in front of a human.
    const fingerprint = AvatarModerationService.fingerprintFor(normalized.image);
    if (await this.deps.wasRefused(playerId, fingerprint)) {
      return { ok: false, status: 409, error: "Это фото уже не приняли" };
    }

    const held = await this.deps.hold({
      playerId,
      submissionId: AvatarModerationService.newSubmissionId(),
      image: normalized.image,
      contentType: normalized.contentType,
      fingerprint,
    });

    logger?.info({ playerId }, "[AvatarIntake] submission held");
    return {
      ok: true,
      submission: {
        state: "pending",
        submissionId: held.submissionId,
        submittedAt: held.submittedAt.toISOString(),
      },
    };
  }

  /**
   * Removing your own published avatar needs no verdict: there is nothing to
   * approve about an absence, and a player who wants no picture should not have
   * to wait for one.
   */
  async removeOwn(playerId: number): Promise<void> {
    await playerAvatarRepository.erase(playerId);
  }

  /** What the profile shows: waiting, refused, or nothing to say. */
  async submissionState(playerId: number): Promise<SubmissionView> {
    const submission = await playerAvatarSubmissionRepository.find(playerId);
    if (!submission) return { state: "none" };
    if (submission.state === "refused") return { state: "refused" };
    return {
      state: "pending",
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt.toISOString(),
    };
  }
}

/**
 * The real collaborators. Split out so the order of the checks — the part of
 * this service that is actually a requirement — can be tested without a Redis
 * and a Postgres standing behind it.
 */
const defaultDeps: IntakeDeps = {
  normalize: (input) => imageNormalizer.normalize(input),
  wasRefused: (playerId, fingerprint) =>
    playerAvatarSubmissionRepository.wasRefused(playerId, fingerprint),
  hold: (input) => playerAvatarSubmissionRepository.hold(input),
  async withinRateLimit(playerId: number): Promise<boolean> {
    try {
      const key = `avatar:upload:${playerId}`;
      const count = await RedisClient.instance.incr(key);
      if (count === 1) await RedisClient.instance.expire(key, RATE_WINDOW_SECONDS);
      return count <= RATE_LIMIT;
    } catch (err) {
      // The counter being unavailable must not become a way to upload freely,
      // but it must not lock the feature either. The decode budget and the size
      // ceiling still stand behind it, so we let the upload through and say so.
      logger?.warn({ err, playerId }, "[AvatarIntake] rate counter unavailable");
      return true;
    }
  },
};

export const avatarIntakeService = new AvatarIntakeService();
