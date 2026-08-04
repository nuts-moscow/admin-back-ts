export interface MailConfig {
  /**
   * Transactional provider endpoint. Unset in development: the club then runs
   * without a sender and codes go to the log instead of a mailbox.
   */
  apiUrl: string | null;
  apiToken: string | null;
  /** Envelope sender; must be on a domain the provider is allowed to send for. */
  from: string;
  /**
   * Shared secret the provider echoes on its delivery webhook. The webhook is
   * an unauthenticated entry point otherwise — it carries no player grant.
   */
  webhookSecret: string | null;
}

export function loadMailConfig(): MailConfig {
  return {
    apiUrl: process.env.MAIL_API_URL ?? null,
    apiToken: process.env.MAIL_API_TOKEN ?? null,
    from: process.env.MAIL_FROM ?? "no-reply@localhost",
    webhookSecret: process.env.MAIL_WEBHOOK_SECRET ?? null,
  };
}
