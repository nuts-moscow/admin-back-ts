import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The Telegram login widget's answer, as it arrives. Every field except the
 * signature is part of what was signed, including ones we never read — which
 * is why the check works over whatever came in rather than over a fixed list.
 */
export type TelegramPayload = Record<string, string>;

/** What the club keeps from a proved payload. Nothing here is a claim about a person. */
export interface TelegramIdentity {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  /** The signature itself, which doubles as the payload's identity for replay checks. */
  hash: string;
}

export type TelegramVerdict =
  | { ok: true; identity: TelegramIdentity }
  | { ok: false; reason: "malformed" | "bad_signature" | "stale" };

/**
 * Telegram's own scheme: the secret is the SHA-256 *digest* of the bot token,
 * and the signature is an HMAC over the remaining fields sorted by key. The
 * digest step is not decoration — it is what stops the token itself from being
 * the HMAC key, and getting it wrong verifies nothing while looking correct.
 */
function dataCheckString(payload: TelegramPayload): string {
  return Object.keys(payload)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("\n");
}

function signatureMatches(expectedHex: string, actualHex: string): boolean {
  // Hex of the same digest is always the same length; a mismatch here means
  // malformed input, and timingSafeEqual would throw on it.
  if (expectedHex.length !== actualHex.length) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(actualHex, "hex"));
}

/**
 * Weighs one payload. Pure: no network, no clock of its own and no storage —
 * the caller supplies the time, so freshness is testable without waiting and
 * the whole door can be verified with nothing running.
 *
 * A payload is refused for a wrong signature and for age with the same
 * indifference; neither answer says anything about whether the identity is
 * known here.
 */
export function verifyTelegramPayload(
  payload: TelegramPayload,
  botToken: string,
  nowSec: number,
  maxAgeSec: number
): TelegramVerdict {
  const hash = payload.hash;
  const rawId = payload.id;
  const rawAuthDate = payload.auth_date;
  if (!hash || !rawId || !rawAuthDate) return { ok: false, reason: "malformed" };

  const telegramId = Number(rawId);
  const authDate = Number(rawAuthDate);
  if (!Number.isSafeInteger(telegramId) || !Number.isFinite(authDate)) {
    return { ok: false, reason: "malformed" };
  }

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString(payload)).digest("hex");
  if (!signatureMatches(expected, hash)) return { ok: false, reason: "bad_signature" };

  // Signed in the future is as wrong as signed too long ago: a clock that
  // disagrees is not a reason to widen the window in one direction.
  const age = nowSec - authDate;
  if (age > maxAgeSec || age < -maxAgeSec) return { ok: false, reason: "stale" };

  return {
    ok: true,
    identity: {
      telegramId,
      username: payload.username ?? null,
      firstName: payload.first_name ?? null,
      hash,
    },
  };
}

/** Signs a payload the way Telegram would. Test-only, and the reason the tests are honest. */
export function signTelegramPayload(
  payload: TelegramPayload,
  botToken: string
): TelegramPayload {
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString(payload)).digest("hex");
  return { ...payload, hash };
}
