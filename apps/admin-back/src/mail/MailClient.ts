import { ApplicationConfigs } from "../configs";
import { logger } from "../logger";

/** A letter on its way out: plain text, no markup, no links. */
export interface OtpLetter {
  to: string;
  subject: string;
  text: string;
  /**
   * Echoed back verbatim on the provider's delivery webhook, which is the
   * only way a later bounce can be matched to the challenge that sent it.
   */
  metadata?: Record<string, string>;
}

/**
 * What became of one letter at the moment we handed it over. The later half
 * of the story — a bounce — arrives on the delivery webhook, never here.
 */
export type DeliveryOutcome =
  | { taken: true }
  | { taken: false; reason: string };

export interface MailClient {
  send(letter: OtpLetter): Promise<DeliveryOutcome>;
}

/** Unisender Go's per-address rejections, returned on an otherwise-200 send. */
interface UnisenderSendResponse {
  status?: string;
  message?: string;
  code?: number;
  emails?: string[];
  failed_emails?: Record<string, string>;
}

/**
 * Unisender Go transactional API.
 *
 * Two details are load-bearing rather than incidental. Link and read tracking
 * are switched off: tracking rewrites URLs and injects a pixel, and
 * `letter-carries-only-the-code` says the letter contains neither. And a 200
 * is not success on its own — the provider reports per-address rejections in
 * `failed_emails`, so the address we sent to has to be looked for by name.
 */
class UnisenderGoMailClient implements MailClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fromName: string
  ) {}

  async send(letter: OtpLetter): Promise<DeliveryOutcome> {
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey,
        },
        body: JSON.stringify({
          message: {
            recipients: [
              {
                email: letter.to,
                ...(letter.metadata ? { metadata: letter.metadata } : {}),
              },
            ],
            body: { plaintext: letter.text },
            subject: letter.subject,
            from_email: this.from,
            from_name: this.fromName,
            track_links: 0,
            track_read: 0,
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | UnisenderSendResponse
        | null;

      if (!response.ok || payload?.status === "error") {
        const detail =
          payload?.message ?? `HTTP ${response.status}`;
        logger?.error(
          { status: response.status, code: payload?.code },
          "[Mail] Unisender Go refused the request"
        );
        return { taken: false, reason: String(detail).slice(0, 200) };
      }

      // A 200 with the address in failed_emails is a refusal of this letter,
      // however healthy the request was.
      const failure = payload?.failed_emails?.[letter.to];
      if (failure) {
        logger?.error({ failure }, "[Mail] Unisender Go rejected the address");
        return { taken: false, reason: failure };
      }

      return { taken: true };
    } catch (err) {
      logger?.error({ err }, "[Mail] Unisender Go unreachable");
      return { taken: false, reason: "provider unreachable" };
    }
  }
}

/**
 * Development stand-in: writes the letter to the log instead of sending it,
 * so the club can run the whole flow locally without a provider account.
 * Never selected when an API key is configured.
 */
class LogOnlyMailClient implements MailClient {
  async send(letter: OtpLetter): Promise<DeliveryOutcome> {
    logger?.warn(
      { to: letter.to, subject: letter.subject, text: letter.text },
      "[Mail] no provider configured — letter written to the log, not sent"
    );
    return { taken: true };
  }
}

let client: MailClient | null = null;

export function mailClient(): MailClient {
  if (client) return client;
  const { apiUrl, apiToken, from, fromName } = ApplicationConfigs.instance.mail;
  client =
    apiUrl && apiToken
      ? new UnisenderGoMailClient(apiUrl, apiToken, from, fromName)
      : new LogOnlyMailClient();
  return client;
}
