import type { BunRequest } from "bun";
import { ApplicationConfigs } from "../../configs";
import { logger } from "../../logger";
import {
  parseDeliveryReports,
  verifyWebhookSignature,
} from "../../mail/unisenderWebhook";
import { otpChallengeStore } from "../../redis/OtpChallengeStore";

/**
 * Unisender Go's delivery callback. This entry point carries no player grant —
 * it authenticates by the provider's own signature over the request body,
 * keyed by the API key. With no key configured the endpoint does not exist,
 * rather than accepting anonymous reports about players' mailboxes.
 */
export function mailWebhookRoutes() {
  return {
    "/api/mail/delivery": {
      POST: async (req: BunRequest) => {
        const { apiToken } = ApplicationConfigs.instance.mail;
        if (!apiToken) {
          logger?.warn("[Mail] delivery webhook hit with no API key configured");
          return new Response(null, { status: 404 });
        }

        // The signature covers the bytes as sent, so the body is read raw and
        // parsed afterwards.
        const rawBody = await req.text();
        if (!verifyWebhookSignature(rawBody, apiToken)) {
          logger?.warn("[Mail] delivery webhook rejected: bad signature");
          return new Response(null, { status: 401 });
        }

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return new Response(null, { status: 400 });
        }

        const reports = parseDeliveryReports(body);
        for (const report of reports) {
          await otpChallengeStore.recordDelivery(
            report.address,
            report.purpose,
            report.state,
            report.detail
          );
          logger?.info(
            { purpose: report.purpose, state: report.state },
            "[Mail] delivery outcome recorded"
          );
        }

        // Acknowledge whatever arrived: an unrecognised event is not an error,
        // and a retry would bring the same one back.
        return new Response(null, { status: 200 });
      },
    },
  };
}
