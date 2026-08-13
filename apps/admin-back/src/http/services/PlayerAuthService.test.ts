import { describe, expect, test } from "bun:test";
import type { PlayerUser } from "../../postgres/PlayerUserRepository";
import {
  PlayerAuthService,
  type AttemptBudget,
  type CredentialStore,
  type GrantIssuer,
  type LogSink,
  type PasswordChecker,
} from "./PlayerAuthService";

function user(over: Partial<PlayerUser>): PlayerUser {
  return {
    id: 1,
    login: null,
    email: null,
    passwordHash: "h:passw0rd",
    playerId: 100,
    createdAt: new Date(0),
    emailVerifiedAt: null,
    telegramId: null,
    ...over,
  };
}

/** citext is case-insensitive; the fake mirrors that rather than the SQL. */
function credentials(rows: PlayerUser[]): CredentialStore {
  const eq = (a: string | null, b: string) =>
    a != null && a.toLowerCase() === b.trim().toLowerCase();
  return {
    async findByLogin(login) {
      return rows.find((r) => eq(r.login, login)) ?? null;
    },
    async findByEmail(email) {
      return rows.find((r) => eq(r.email, email)) ?? null;
    },
  };
}

const MAX_IDENTITY = 5;

function budget() {
  const byIdentity = new Map<string, number>();
  const key = (s: string) => s.trim().toLowerCase();
  const b: AttemptBudget = {
    maxAttempts: MAX_IDENTITY,
    windowSec: 900,
    async getIdentityAttempts(identity) {
      return byIdentity.get(key(identity)) ?? 0;
    },
    async incrementIdentityAttempts(identity) {
      const n = (byIdentity.get(key(identity)) ?? 0) + 1;
      byIdentity.set(key(identity), n);
      return n;
    },
    async clearIdentityAttempts(identity) {
      byIdentity.delete(key(identity));
    },
  };
  return Object.assign(b, { byIdentity });
}

const grants: GrantIssuer = {
  async issue(accountId) {
    return { token: `token-${accountId}`, jti: `jti-${accountId}` };
  },
};

const passwords: PasswordChecker = {
  async verify(password, hash) {
    return hash === `h:${password}`;
  },
};

type Line = { fields: Record<string, unknown>; message: string };

function sink() {
  const lines: Line[] = [];
  const log: LogSink = {
    info: (fields, message) => lines.push({ fields, message }),
    warn: (fields, message) => lines.push({ fields, message }),
  };
  return Object.assign(log, { lines });
}

function service(rows: PlayerUser[], b = budget(), log = sink()) {
  return new PlayerAuthService(
    credentials(rows),
    b,
    grants,
    passwords,
    () => "h:__dummy__",
    log
  );
}

describe("PlayerAuthService — legacy logins keep working", () => {
  test("an account with a login and no address signs in unchanged", async () => {
    const svc = service([user({ id: 3, login: "oldtimer" })]);
    const result = await svc.signIn("oldtimer", "passw0rd", "1.2.3.4");
    expect(result.ok).toBe(true);
    expect(result.ok && result.user.email).toBeNull();
  });

  test("a legacy account signs in by its address in any case variant", async () => {
    const svc = service([user({ id: 4, email: "Legacy@Example.com" })]);
    expect((await svc.signIn("legacy@example.com", "passw0rd", "1.2.3.4")).ok).toBe(true);
    expect((await svc.signIn("  LEGACY@EXAMPLE.COM ", "passw0rd", "1.2.3.4")).ok).toBe(true);
  });

  test("a mailbox account signs in by its address", async () => {
    const svc = service([user({ id: 5, email: "new@example.com" })]);
    expect((await svc.signIn("new@example.com", "passw0rd", "1.2.3.4")).ok).toBe(true);
  });
});

describe("PlayerAuthService — the refusal answers nothing", () => {
  test("an unknown identifier and a wrong password are indistinguishable", async () => {
    const svc = service([user({ id: 6, email: "known@example.com" })]);

    const unknown = await svc.signIn("nobody@example.com", "passw0rd", "1.2.3.4");
    const wrong = await svc.signIn("known@example.com", "guess123", "1.2.3.4");

    expect(unknown).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(wrong).toEqual({ ok: false, reason: "invalid_credentials" });
  });
});

describe("PlayerAuthService — the budget follows the identity", () => {
  test("failures against one account do not refuse another from the same client", async () => {
    const b = budget();
    const svc = service(
      [user({ id: 7, email: "mine@example.com" }), user({ id: 8, email: "theirs@example.com" })],
      b
    );

    for (let i = 0; i < MAX_IDENTITY; i += 1) {
      await svc.signIn("mine@example.com", "wrongpw1", "1.2.3.4");
    }

    expect(await svc.signIn("mine@example.com", "passw0rd", "1.2.3.4")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect((await svc.signIn("theirs@example.com", "passw0rd", "1.2.3.4")).ok).toBe(true);
  });

  test("a roomful of failures from one address never refuses a fresh identity", async () => {
    const b = budget();
    const svc = service([user({ id: 9, email: "known@example.com" })], b);

    // The whole club is on one NAT and the evening has gone badly: far more
    // failures from this address than any per-client bound would have allowed.
    for (let i = 0; i < MAX_IDENTITY * 20; i += 1) {
      await svc.signIn(`nobody${i}@example.com`, "wrongpw1", "5.6.7.8");
    }

    expect((await svc.signIn("known@example.com", "passw0rd", "5.6.7.8")).ok).toBe(true);
  });

  test("one identity failing from many addresses is still refused", async () => {
    const b = budget();
    const svc = service([user({ id: 11, email: "target@example.com" })], b);

    for (let i = 0; i < MAX_IDENTITY; i += 1) {
      await svc.signIn("target@example.com", "wrongpw1", `10.0.0.${i}`);
    }

    expect(await svc.signIn("target@example.com", "passw0rd", "10.0.0.99")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  test("a successful sign-in clears the identity counter", async () => {
    const b = budget();
    const svc = service([user({ id: 10, email: "known@example.com" })], b);

    await svc.signIn("known@example.com", "wrongpw1", "1.2.3.4");
    expect((await svc.signIn("known@example.com", "passw0rd", "1.2.3.4")).ok).toBe(true);

    expect(b.byIdentity.get("known@example.com")).toBeUndefined();
  });
});

describe("PlayerAuthService — the log names its door", () => {
  test("every line this door writes says which door it was", async () => {
    const log = sink();
    const svc = service([user({ id: 12, email: "known@example.com" })], budget(), log);

    await svc.signIn("known@example.com", "passw0rd", "1.2.3.4");
    await svc.signIn("known@example.com", "wrongpw1", "1.2.3.4");

    expect(log.lines.length).toBeGreaterThanOrEqual(2);
    for (const line of log.lines) {
      expect(line.fields.door).toBe("password");
    }
  });

  test("the failure line still does not say whether the account existed", async () => {
    const known = sink();
    const unknown = sink();

    await service([user({ id: 13, email: "known@example.com" })], budget(), known).signIn(
      "known@example.com",
      "wrongpw1",
      "1.2.3.4"
    );
    await service([user({ id: 14, email: "known@example.com" })], budget(), unknown).signIn(
      "nobody@example.com",
      "wrongpw1",
      "1.2.3.4"
    );

    expect(unknown.lines.map((l) => l.message)).toEqual(known.lines.map((l) => l.message));
    expect(unknown.lines.map((l) => Object.keys(l.fields).sort())).toEqual(
      known.lines.map((l) => Object.keys(l.fields).sort())
    );
  });
});
