/**
 * How long a widget payload stays usable after Telegram signed it. Short on
 * purpose: this window is the whole replay bound, so it is measured in the
 * seconds a browser needs to post the payload, not in the minutes a person
 * might spend on the page.
 */
const DEFAULT_MAX_AGE_SEC = 60;

export interface TelegramConfig {
  /**
   * The bot's token, and the material every signature is checked against. Not
   * a chat credential: whoever holds it can sign a payload for any Telegram
   * identity and walk into any account bound to it, so it is handled like the
   * session signing key — same storage, same access, same rotation.
   *
   * Unset means the second door does not exist: the routes answer 404 rather
   * than trusting anything, the same way the mail webhook does with no key.
   */
  botToken: string | null;
  /** Seconds a signed payload remains acceptable. */
  maxAgeSec: number;
}

export function loadTelegramConfig(): TelegramConfig {
  const maxAge = Number(process.env.TELEGRAM_MAX_AGE_SEC);
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
    maxAgeSec: Number.isFinite(maxAge) && maxAge > 0 ? maxAge : DEFAULT_MAX_AGE_SEC,
  };
}
