import type { BunRequest } from "bun";
import { ApplicationConfigs } from "../../configs";
import { logger } from "../../logger";
import {
  type DeliveryState,
  type OtpPurpose,
  otpChallengeStore,
} from "../../redis/OtpChallengeStore";

/**
 * How the provider names an event, mapped onto what we care about. Anything
 * unrecognised is ignored rather than guessed at: a wrong delivery state is
 * worse than none.
 */
function toDeliveryState(event: string): DeliveryState | null {
  switch (event.toLowerCase()) {
    case "delivered":
    case "sent":
      return "taken";
    case "bounce":
    case "bounced":
    case "hard_bounce":
    case "soft_bounce":
      return "bounced";
    case "rejected":
    case "dropped":
    case "spam":
    case "complaint":
      return "refused";
    default:
      return null;
  }
}

function isPurpose(value: unknown): value is OtpPurpose {
  return value === "signup" || value === "password_reset";
}

/**
 * The provider's delivery webhook. This entry point carries no player grant —
 * it is authenticated by a shared secret configured on both sides. Without a
 * configured secret the endpoint refuses everything rather than accepting
 * anonymous reports about players' mailboxes.
 */
export function mailWebhookRoutes() {
  return {
    "/api/mail/delivery": {
      POST: async (req: BunRequest) => {
        const { webhookSecret } = ApplicationConfigs.instance.mail;
        if (!webhookSecret) {
          logger.warn("[Mail] delivery webhook hit with no secret configured");
          return new Response(null, { status: 404 });
        }
        if (req.headers.get("x-mail-webhook-secret") !== webhookSecret) {
          logger.warn("[Mail] delivery webhook rejected: bad secret");
          return new Response(null, { status: 401 });
        }

        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(null, { status: 400 });
        }
        if (!body || typeof body !== "object") {
          return new Response(null, { status: 400 });
        }

        const { address, purpose, event, detail } = body as Record<string, unknown>;
        if (typeof address !== "string" || !isPurpose(purpose) || typeof event !== "string") {
          return new Response(null, { status: 400 });
        }

        const state = toDeliveryState(event);
        if (!state) {
          logger.info({ event }, "[Mail] delivery webhook: unrecognised event ignored");
          return new Response(null, { status: 204 });
        }

        await otpChallengeStore.recordDelivery(
          address,
          purpose,
          state,
          typeof detail === "string" ? detail.slice(0, 200) : undefined
        );
        logger.info({ purpose, state }, "[Mail] delivery outcome recorded");
        return new Response(null, { status: 204 });
      },
    },
  };
}
