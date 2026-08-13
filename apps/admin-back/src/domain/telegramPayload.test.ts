import { describe, expect, test } from "bun:test";
import {
  signTelegramPayload,
  verifyTelegramPayload,
  type TelegramPayload,
} from "./telegramPayload";

const TOKEN = "123456:test-bot-token";
const NOW = 1_700_000_000;

function payload(over: Partial<TelegramPayload> = {}): TelegramPayload {
  return signTelegramPayload(
    {
      id: "42",
      first_name: "Тимофей",
      username: "tgusev",
      auth_date: String(NOW),
      ...over,
    },
    TOKEN
  );
}

describe("verifyTelegramPayload — the payload proves itself", () => {
  test("a payload signed by the bot's token is accepted and names its identity", () => {
    const verdict = verifyTelegramPayload(payload(), TOKEN, NOW, 60);
    expect(verdict).toEqual({
      ok: true,
      identity: {
        telegramId: 42,
        username: "tgusev",
        firstName: "Тимофей",
        hash: expect.any(String),
      },
    });
  });

  test("changing any signed field breaks the signature, the rest untouched", () => {
    const signed = payload();
    // Each replacement stays well-formed on purpose — a value that is merely
    // unparseable would be refused before the signature is ever weighed, and
    // would prove nothing about the signature.
    const swaps: Record<string, string> = {
      id: "43",
      first_name: "Кто-то",
      username: "someone",
      auth_date: String(NOW + 1),
    };
    for (const [field, value] of Object.entries(swaps)) {
      const tampered = { ...signed, [field]: value };
      expect(verifyTelegramPayload(tampered, TOKEN, NOW, 60)).toEqual({
        ok: false,
        reason: "bad_signature",
      });
    }
  });

  test("a field added after signing breaks it too — the check covers what arrived", () => {
    const tampered = { ...payload(), is_admin: "1" };
    expect(verifyTelegramPayload(tampered, TOKEN, NOW, 60).ok).toBe(false);
  });

  test("another bot's token does not verify this payload", () => {
    expect(verifyTelegramPayload(payload(), "999:other", NOW, 60)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  test("a correctly signed payload goes stale, in both directions", () => {
    const signed = payload();
    expect(verifyTelegramPayload(signed, TOKEN, NOW + 61, 60)).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(verifyTelegramPayload(signed, TOKEN, NOW - 61, 60)).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(verifyTelegramPayload(signed, TOKEN, NOW + 59, 60).ok).toBe(true);
  });

  test("a payload without a signature, an id or a date is malformed, not refused", () => {
    for (const missing of ["hash", "id", "auth_date"]) {
      const partial = { ...payload() };
      delete partial[missing];
      expect(verifyTelegramPayload(partial, TOKEN, NOW, 60)).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });

  test("a signature that is not hex of the right length is refused, not thrown", () => {
    expect(() =>
      verifyTelegramPayload({ ...payload(), hash: "zz" }, TOKEN, NOW, 60)
    ).not.toThrow();
    expect(verifyTelegramPayload({ ...payload(), hash: "zz" }, TOKEN, NOW, 60).ok).toBe(false);
  });
});
