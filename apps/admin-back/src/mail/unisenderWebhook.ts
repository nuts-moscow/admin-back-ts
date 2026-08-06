import { timingSafeEqual } from "node:crypto";
import type { DeliveryState, OtpPurpose } from "../redis/OtpChallengeStore";

/** One status report about one address, already reduced to what we store. */
export interface DeliveryReport {
  address: string;
  purpose: OtpPurpose;
  state: DeliveryState;
  detail?: string;
}

/**
 * Unisender Go signs a callback by MD5-ing the request body with the value of
 * the `auth` field replaced by the API key. Verification therefore works on
 * the raw bytes and never re-serialises the JSON: any difference in key order
 * or spacing would change the hash.
 */
export function verifyWebhookSignature(rawBody: string, apiKey: string): boolean {
  const match = rawBody.match(/"auth"\s*:\s*"([0-9a-fA-F]{32})"/);
  if (!match) return false;
  const claimed = match[1]!;

  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(rawBody.replace(claimed, apiKey));
  const expected = hasher.digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(claimed.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Their status vocabulary mapped onto ours. Engagement events (opened,
 * clicked, subscribed) say nothing about whether the letter arrived, so they
 * are dropped rather than guessed at — a wrong delivery state is worse than
 * none.
 */
export function toDeliveryState(status: string): DeliveryState | null {
  switch (status.toLowerCase()) {
    case "sent":
    case "delivered":
      return "taken";
    case "soft_bounced":
    case "hard_bounced":
      return "bounced";
    case "spam":
    case "spam_block":
    case "unsubscribed":
      return "refused";
    default:
      return null;
  }
}

function isPurpose(value: unknown): value is OtpPurpose {
  return value === "signup" || value === "password_reset";
}

/**
 * Pulls the reports we can act on out of a callback body.
 *
 * The purpose rides in the per-recipient metadata we set when sending, which
 * is the only thing tying a bounce back to the challenge that caused it: an
 * address can hold a signup challenge and a reset challenge at once.
 */
export function parseDeliveryReports(body: unknown): DeliveryReport[] {
  if (!body || typeof body !== "object") return [];
  const byUser = (body as { events_by_user?: unknown }).events_by_user;
  if (!Array.isArray(byUser)) return [];

  const reports: DeliveryReport[] = [];
  for (const group of byUser) {
    const events = (group as { events?: unknown })?.events;
    if (!Array.isArray(events)) continue;

    for (const event of events) {
      const data = (event as { event_data?: unknown })?.event_data;
      if (!data || typeof data !== "object") continue;

      const { email, status, metadata, delivery_info } = data as Record<string, unknown>;
      if (typeof email !== "string" || typeof status !== "string") continue;

      const state = toDeliveryState(status);
      if (!state) continue;

      const purpose = (metadata as Record<string, unknown> | undefined)?.purpose;
      if (!isPurpose(purpose)) continue;

      const info = delivery_info as Record<string, unknown> | undefined;
      const detail =
        typeof info?.delivery_status === "string"
          ? info.delivery_status
          : typeof info?.destination_response === "string"
            ? info.destination_response
            : status;

      reports.push({ address: email, purpose, state, detail: detail.slice(0, 200) });
    }
  }
  return reports;
}
