/** Unisender Go, in the datacentre the club's account lives in. */
const DEFAULT_API_URL =
  "https://go2.unisender.ru/ru/transactional/api/v1/email/send.json";

export interface MailConfig {
  /**
   * Transactional send endpoint. Defaults to the club's datacentre; the other
   * hosts (`go1`, `goapi`) speak the same API.
   */
  apiUrl: string;
  /**
   * Unisender Go API key. Unset in development: the club then runs without a
   * sender and codes go to the log instead of a mailbox.
   *
   * It doubles as the webhook secret — Unisender Go signs each callback by
   * MD5-ing the body with this key substituted for the signature field, so
   * there is no second secret to configure.
   */
  apiToken: string | null;
  /** Envelope sender; must be on a domain the account has verified. */
  from: string;
  fromName: string;
}

export function loadMailConfig(): MailConfig {
  return {
    apiUrl: process.env.MAIL_API_URL ?? DEFAULT_API_URL,
    apiToken: process.env.MAIL_API_TOKEN ?? null,
    from: process.env.MAIL_FROM ?? "no-reply@localhost",
    fromName: process.env.MAIL_FROM_NAME ?? "NUTS Family",
  };
}
