/**
 * What a nickname may be — the whole of it, in one place.
 *
 * Three writers reach for this: a newcomer's signup, a player renaming
 * themselves, and an admin creating a player by hand. Having one
 * implementation is the requirement, not a tidiness preference: a name refused
 * at one door and accepted at another is the same as no rule at all.
 *
 * The verdict carries the *folded* form — what uniqueness is decided on — but
 * never replaces the name. A player who typed `ИвАн` is shown `ИвАн`; folding
 * only decides who may have it.
 */

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 24;

export type NicknameRefusal = "too_short" | "too_long" | "reserved" | "empty";

export type NicknameVerdict =
  | { ok: true; nickname: string; folded: string }
  | { ok: false; reason: NicknameRefusal };

/**
 * Cyrillic letters that are indistinguishable from a Latin one in every font
 * the club's screens use, mapped onto the Latin side. This is the difference
 * between "two names look alike" and "two players at one table cannot be told
 * apart" — in a club that mixes both alphabets daily, a homoglyph is an
 * ordinary mistype far more often than it is an attack.
 */
const CONFUSABLES: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
};

/**
 * Names the club keeps for itself: its own, and the roles it speaks in.
 * Deliberately short and literal — this is not a profanity filter, and a name
 * someone finds offensive is for the human who already moderates the club.
 * Each entry is stored folded, so one line covers every spelling of it.
 */
const RESERVED = [
  "nuts",
  "nutsfamily",
  "nuts family",
  "администратор",
  "админ",
  "admin",
  "administrator",
  "касса",
  "кассир",
  "дилер",
  "dealer",
  "moderator",
  "модератор",
  "support",
  "поддержка",
].map(fold);

/**
 * The form two names are compared by: normalized, case-flattened, whitespace
 * collapsed, and confusable Cyrillic folded onto Latin.
 */
export function fold(nickname: string): string {
  const collapsed = nickname.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  let out = "";
  for (const ch of collapsed) out += CONFUSABLES[ch] ?? ch;
  return out;
}

/**
 * Weighs a proposed name. Answers the folded form to compare it by, or why it
 * cannot be had — a reason rather than a boolean, because every caller has to
 * show a person a sentence.
 *
 * Uniqueness is not decided here: it belongs to the database, which is the only
 * place that can settle two people typing at once.
 */
export function weighNickname(raw: unknown): NicknameVerdict {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };

  const nickname = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (nickname.length === 0) return { ok: false, reason: "empty" };
  if (nickname.length < NICKNAME_MIN) return { ok: false, reason: "too_short" };
  if (nickname.length > NICKNAME_MAX) return { ok: false, reason: "too_long" };

  const folded = fold(nickname);
  if (RESERVED.includes(folded)) return { ok: false, reason: "reserved" };

  return { ok: true, nickname, folded };
}

/** One wording per refusal, so the same «нет» reads the same at every door. */
export function nicknameRefusalMessage(reason: NicknameRefusal | "taken"): string {
  switch (reason) {
    case "empty":
      return "Никнейм обязателен";
    case "too_short":
      return `Никнейм должен быть от ${NICKNAME_MIN} до ${NICKNAME_MAX} символов`;
    case "too_long":
      return `Никнейм должен быть от ${NICKNAME_MIN} до ${NICKNAME_MAX} символов`;
    case "reserved":
      return "Этот никнейм занят клубом";
    case "taken":
      return "Этот никнейм уже занят";
  }
}
