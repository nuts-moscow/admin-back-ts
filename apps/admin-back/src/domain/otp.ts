import type { OtpPurpose } from "../redis/OtpChallengeStore";

/** Six digits: short enough to retype from a phone, bounded by the attempt budget. */
export const OTP_CODE_LENGTH = 6;

/**
 * A code carries no meaning beyond being hard to guess, so it is drawn from a
 * cryptographic source rather than Math.random.
 */
export function generateOtpCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const max = 10 ** OTP_CODE_LENGTH;
  return String(bytes[0]! % max).padStart(OTP_CODE_LENGTH, "0");
}

/**
 * The letter is deliberately boring, and that is a security property rather
 * than a style choice: it teaches players what a real letter from the club
 * looks like. No links and no buttons, so a forged copy has nothing to
 * imitate; the purpose in words, so "you are resetting your password" is
 * distinguishable from "someone is resetting it for you"; and the code out of
 * the subject line, so it does not surface on a phone lying face-up on a
 * poker table.
 */
export function renderOtpLetter(
  purpose: OtpPurpose,
  code: string
): { subject: string; text: string } {
  const what =
    purpose === "signup"
      ? "подтверждения почты при регистрации в NUTS Family"
      : "смены пароля в NUTS Family";

  const subject =
    purpose === "signup"
      ? "Подтверждение почты — NUTS Family"
      : "Смена пароля — NUTS Family";

  const text = [
    `Код для ${what}:`,
    "",
    code,
    "",
    "Код действует 10 минут и используется один раз.",
    "",
    "Никто из клуба никогда не спросит у вас этот код —",
    "ни в переписке, ни по телефону.",
    "",
    "Если вы этого не делали, просто не вводите код: без него",
    "ничего не произойдёт.",
  ].join("\n");

  return { subject, text };
}
