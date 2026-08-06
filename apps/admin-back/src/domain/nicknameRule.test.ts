import { describe, expect, test } from "bun:test";
import { fold, NICKNAME_MAX, NICKNAME_MIN, weighNickname } from "./nicknameRule";

function folded(name: string): string {
  const v = weighNickname(name);
  if (!v.ok) throw new Error(`expected ${name} to be accepted, got ${v.reason}`);
  return v.folded;
}

describe("folding", () => {
  test("case, outer and inner whitespace collapse to one form", () => {
    const canonical = folded("Иван");
    expect(folded("иван")).toBe(canonical);
    expect(folded(" Иван ")).toBe(canonical);
    expect(fold("Иван  Петров")).toBe(fold("иван петров"));
  });

  test("a Latin lookalike is the same name — this is the whole point", () => {
    // `Ивaн` with a Latin `a`: indistinguishable on screen, and in a club that
    // mixes alphabets daily it is a mistype far more often than an attack.
    expect(folded("Ивaн")).toBe(folded("Иван"));
    // Every letter of `Макс` has a Latin twin; typed either way it is one name.
    expect(folded("Makc")).toBe(folded("Макс"));
  });

  test("names that genuinely differ keep differing", () => {
    expect(folded("Иван2")).not.toBe(folded("Иван"));
    expect(folded("Иванов")).not.toBe(folded("Иван"));
  });

  test("the verdict carries the typed name, not the folded one", () => {
    const v = weighNickname("  ИвАн  ");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // Outer whitespace is trimmed, but the case the player chose survives.
    expect(v.nickname).toBe("ИвАн");
    expect(v.folded).not.toBe(v.nickname);
  });
});

describe("bounds", () => {
  test("shorter than the minimum and longer than the maximum are refused", () => {
    expect(weighNickname("a")).toEqual({ ok: false, reason: "too_short" });
    expect(weighNickname("x".repeat(NICKNAME_MAX + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  test("the boundaries themselves are accepted", () => {
    expect(weighNickname("x".repeat(NICKNAME_MIN)).ok).toBe(true);
    expect(weighNickname("x".repeat(NICKNAME_MAX)).ok).toBe(true);
  });

  test("an absent or blank name is refused as empty, not as short", () => {
    expect(weighNickname(undefined)).toEqual({ ok: false, reason: "empty" });
    expect(weighNickname("   ")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("reserved names", () => {
  test("the club's roles cannot be taken, in any spelling", () => {
    expect(weighNickname("Администратор").ok).toBe(false);
    expect(weighNickname("администратор").ok).toBe(false);
    // Latin `A` in place of the Cyrillic one — folded to the same thing.
    expect(weighNickname("Aдминистратор").ok).toBe(false);
    expect(weighNickname("Администратор")).toEqual({ ok: false, reason: "reserved" });
  });

  test("the club's own name is reserved", () => {
    expect(weighNickname("NUTS").ok).toBe(false);
    expect(weighNickname("Nuts Family").ok).toBe(false);
  });

  test("the list is literal, not a substring hunt", () => {
    // A person legitimately called this is not the club speaking.
    expect(weighNickname("Администратор Иван").ok).toBe(true);
    expect(weighNickname("Адмиралов").ok).toBe(true);
  });
});

describe("the shape of an answer", () => {
  test("a refusal names its reason, so every caller can show a sentence", () => {
    const v = weighNickname("a");
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(typeof v.reason).toBe("string");
  });

  test("uniqueness is not decided here — that is the database's answer", async () => {
    const source = await Bun.file(new URL("./nicknameRule.ts", import.meta.url).pathname).text();
    expect(source).not.toMatch(/Repository|postgres|SELECT/i);
  });
});
