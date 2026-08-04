import { describe, expect, test } from "bun:test";
import { renderOtpLetter } from "../../domain/otp";
import type { DeliveryOutcome, OtpLetter } from "../../mail/MailClient";
import type { OtpChallenge, OtpPurpose } from "../../redis/OtpChallengeStore";
import {
  EmailVerificationService,
  type ChallengeStore,
} from "./EmailVerificationService";

const MAX_ATTEMPTS = 5;
const MAX_MINTS = 5;

function key(address: string, purpose: OtpPurpose): string {
  return `${purpose}:${address.trim().toLowerCase()}`;
}

function fakeStore(): ChallengeStore & { live: Map<string, OtpChallenge> } {
  const live = new Map<string, OtpChallenge>();
  const attempts = new Map<string, number>();
  const mints = new Map<string, number>();
  return {
    live,
    maxAttempts: MAX_ATTEMPTS,
    async put(challenge) {
      live.set(key(challenge.address, challenge.purpose), challenge);
    },
    async get(address, purpose) {
      return live.get(key(address, purpose)) ?? null;
    },
    async drop(address, purpose) {
      live.delete(key(address, purpose));
    },
    async spendAttempt(address, purpose) {
      const k = key(address, purpose);
      attempts.set(k, (attempts.get(k) ?? 0) + 1);
      return Math.max(0, MAX_ATTEMPTS - (attempts.get(k) ?? 0));
    },
    async attemptsLeft(address, purpose) {
      return Math.max(0, MAX_ATTEMPTS - (attempts.get(key(address, purpose)) ?? 0));
    },
    async spendMint(address, purpose) {
      const k = key(address, purpose);
      mints.set(k, (mints.get(k) ?? 0) + 1);
      return Math.max(0, MAX_MINTS - (mints.get(k) ?? 0));
    },
    async mintsLeft(address, purpose) {
      return Math.max(0, MAX_MINTS - (mints.get(key(address, purpose)) ?? 0));
    },
    async recordDelivery(address, purpose, state, detail) {
      const k = key(address, purpose);
      const existing = live.get(k);
      if (existing) live.set(k, { ...existing, delivery: state, deliveryDetail: detail ?? null });
    },
  };
}

function fakeMailer(outcome: DeliveryOutcome = { taken: true }) {
  const sent: OtpLetter[] = [];
  return {
    sent,
    async send(letter: OtpLetter) {
      sent.push(letter);
      return outcome;
    },
  };
}

/** Plain-text "hashing" — the KDF is not what these tests are about. */
const hasher = {
  async hash(code: string) {
    return `h:${code}`;
  },
  async verify(code: string, hash: string) {
    return hash === `h:${code}`;
  },
};

function accounts(map: Record<string, number>) {
  return {
    async findAccountIdByEmail(address: string) {
      return map[address.trim().toLowerCase()] ?? null;
    },
  };
}

/** The code never rides the response, so tests read it off the sent letter. */
function codeFrom(letter: OtpLetter): string {
  const match = letter.text.match(/\b(\d{6})\b/);
  if (!match) throw new Error("no code in the letter");
  return match[1]!;
}

describe("EmailVerificationService — the code proves a mailbox", () => {
  test("nothing about the code comes back on the request that asked for it", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(fakeStore(), mailer, accounts({}), hasher);

    const result = await svc.issue("a@example.com", "signup");

    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain(codeFrom(mailer.sent[0]!));
  });

  test("a signup code is refused when presented for a password reset", async () => {
    const mailer = fakeMailer();
    const store = fakeStore();
    const svc = new EmailVerificationService(store, mailer, accounts({ "a@example.com": 3 }), hasher);

    await svc.issue("a@example.com", "signup");
    const code = codeFrom(mailer.sent[0]!);

    expect(await svc.check("a@example.com", "password_reset", code)).toEqual({
      status: "expired",
    });
    expect(await svc.check("a@example.com", "signup", code)).toEqual({
      status: "accepted",
      accountId: null,
    });
  });

  test("a code dies on first use — a replay is refused", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(fakeStore(), mailer, accounts({}), hasher);
    await svc.issue("a@example.com", "signup");
    const code = codeFrom(mailer.sent[0]!);

    expect((await svc.check("a@example.com", "signup", code)).status).toBe("accepted");
    expect((await svc.check("a@example.com", "signup", code)).status).toBe("expired");
  });

  test("a fresh code retires the previous one", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(fakeStore(), mailer, accounts({}), hasher);
    await svc.issue("a@example.com", "signup");
    await svc.issue("a@example.com", "signup");

    const first = codeFrom(mailer.sent[0]!);
    const second = codeFrom(mailer.sent[1]!);

    expect((await svc.check("a@example.com", "signup", first)).status).toBe("wrong");
    expect((await svc.check("a@example.com", "signup", second)).status).toBe("accepted");
  });

  test("attempts past the budget are refused even when the code is right", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(fakeStore(), mailer, accounts({}), hasher);
    await svc.issue("a@example.com", "signup");
    const code = codeFrom(mailer.sent[0]!);

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await svc.check("a@example.com", "signup", "000000")).status).toBe("wrong");
    }
    expect((await svc.check("a@example.com", "signup", code)).status).toBe("exhausted");
  });

  test("a fresh code does not buy a fresh attempt budget", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(fakeStore(), mailer, accounts({}), hasher);
    await svc.issue("a@example.com", "signup");

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await svc.check("a@example.com", "signup", "000000");
    }
    await svc.issue("a@example.com", "signup");
    const fresh = codeFrom(mailer.sent[1]!);

    expect((await svc.check("a@example.com", "signup", fresh)).status).toBe("exhausted");
  });

  test("mint requests past the budget send no letter", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(fakeStore(), mailer, accounts({}), hasher);

    for (let i = 0; i < MAX_MINTS; i += 1) {
      expect(await svc.issue("a@example.com", "signup")).toEqual({ ok: true });
    }
    expect(await svc.issue("a@example.com", "signup")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(mailer.sent).toHaveLength(MAX_MINTS);
  });
});

describe("EmailVerificationService — the proof names its account", () => {
  test("an accepted reset verdict carries the account the address resolved to", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(
      fakeStore(),
      mailer,
      accounts({ "a@example.com": 42 }),
      hasher
    );
    await svc.issue("a@example.com", "password_reset");
    const code = codeFrom(mailer.sent[0]!);

    expect(await svc.check("a@example.com", "password_reset", code)).toEqual({
      status: "accepted",
      accountId: 42,
    });
  });

  test("a code minted for one account cannot be presented against another", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(
      fakeStore(),
      mailer,
      accounts({ "mine@example.com": 42, "theirs@example.com": 7 }),
      hasher
    );
    await svc.issue("mine@example.com", "password_reset");
    const mine = codeFrom(mailer.sent[0]!);

    // Presented against the other address, the code finds that address's
    // challenge — there is none, so it proves nothing about account 7.
    expect((await svc.check("theirs@example.com", "password_reset", mine)).status).toBe(
      "expired"
    );
  });

  test("a reset for an address with no account sends nothing and answers the same", async () => {
    const mailer = fakeMailer();
    const svc = new EmailVerificationService(fakeStore(), mailer, accounts({}), hasher);

    expect(await svc.issue("nobody@example.com", "password_reset")).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("EmailVerificationService — delivery is observable", () => {
  test("a provider refusal is recorded against the challenge", async () => {
    const store = fakeStore();
    const mailer = fakeMailer({ taken: false, reason: "quota exceeded" });
    const svc = new EmailVerificationService(store, mailer, accounts({}), hasher);

    await svc.issue("a@example.com", "signup");

    const challenge = await store.get("a@example.com", "signup");
    expect(challenge?.delivery).toBe("refused");
    expect(challenge?.deliveryDetail).toBe("quota exceeded");
  });

  test("a taken letter is recorded as taken", async () => {
    const store = fakeStore();
    const svc = new EmailVerificationService(store, fakeMailer(), accounts({}), hasher);

    await svc.issue("a@example.com", "signup");

    expect((await store.get("a@example.com", "signup"))?.delivery).toBe("taken");
  });

  test("a later bounce lands on the same challenge", async () => {
    const store = fakeStore();
    const svc = new EmailVerificationService(store, fakeMailer(), accounts({}), hasher);
    await svc.issue("a@example.com", "signup");

    await store.recordDelivery("a@example.com", "signup", "bounced", "mailbox unavailable");

    expect((await store.get("a@example.com", "signup"))?.delivery).toBe("bounced");
  });
});

describe("the letter carries only the code", () => {
  test("no anchors, no URLs, and no code in the subject", () => {
    const { subject, text } = renderOtpLetter("password_reset", "123456");

    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/<a\b/i);
    expect(subject).not.toContain("123456");
  });

  test("the letter names its purpose, and the two purposes differ", () => {
    const signup = renderOtpLetter("signup", "123456");
    const reset = renderOtpLetter("password_reset", "123456");

    expect(signup.text).not.toBe(reset.text);
    expect(signup.text).toContain("регистрации");
    expect(reset.text).toContain("пароля");
  });

  test("the letter warns that the club will never ask for the code", () => {
    expect(renderOtpLetter("signup", "123456").text).toContain("никогда не спросит");
  });
});
