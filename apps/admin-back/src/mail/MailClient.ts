import { ApplicationConfigs } from "../configs";
import { logger } from "../logger";

/** A letter on its way out: plain text, no markup, no links. */
export interface OtpLetter {
  to: string;
  subject: string;
  text: string;
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

/**
 * The provider adapter. The wire shape below is the common denominator of
 * transactional mail APIs — a JSON body and a bearer token; a provider that
 * wants different field names is a change to this one function and nothing
 * else.
 *
 * The provider must offer delivery webhooks. Plain SMTP is deliberately not
 * an option here: it reports only that a relay accepted the message, and the
 * failures that matter are the quiet ones that follow.
 */
class HttpMailClient implements MailClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiToken: string,
    private readonly from: string
  ) {}

  async send(letter: OtpLetter): Promise<DeliveryOutcome> {
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: letter.to,
          subject: letter.subject,
          text: letter.text,
        }),
      });

      if (!response.ok) {
        const detail = `${response.status} ${await response.text().catch(() => "")}`.trim();
        logger.error({ status: response.status }, "[Mail] provider refused the letter");
        return { taken: false, reason: detail.slice(0, 200) };
      }
      return { taken: true };
    } catch (err) {
      logger.error({ err }, "[Mail] provider unreachable");
      return { taken: false, reason: "provider unreachable" };
    }
  }
}

/**
 * Development stand-in: writes the letter to the log instead of sending it,
 * so the club can run the whole flow locally without a provider account.
 * Never selected when an API url is configured.
 */
class LogOnlyMailClient implements MailClient {
  async send(letter: OtpLetter): Promise<DeliveryOutcome> {
    logger.warn(
      { to: letter.to, subject: letter.subject, text: letter.text },
      "[Mail] no provider configured — letter written to the log, not sent"
    );
    return { taken: true };
  }
}

let client: MailClient | null = null;

export function mailClient(): MailClient {
  if (client) return client;
  const { apiUrl, apiToken, from } = ApplicationConfigs.instance.mail;
  client =
    apiUrl && apiToken
      ? new HttpMailClient(apiUrl, apiToken, from)
      : new LogOnlyMailClient();
  return client;
}
