import { describe, expect, test } from "bun:test";
import type { PlayerUser } from "../../postgres/PlayerUserRepository";
import {
  PlayerAuthService,
  type AttemptBudget,
  type CredentialStore,
  type GrantIssuer,
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
const MAX_CLIENT = 50;

function budget() {
  const byIp = new Map<string, number>();
  const byIdentity = new Map<string, number>();
  const key = (s: string) => s.trim().toLowerCase();
  const b: AttemptBudget = {
    async isRateLimited(ip, identity) {
      if ((byIp.get(ip) ?? 0) >= MAX_CLIENT) return true;
      if (identity && (byIdentity.get(key(identity)) ?? 0) >= MAX_IDENTITY) return true;
      return false;
    },
    async incrementLoginAttempts(ip) {
      const n = (byIp.get(ip) ?? 0) + 1;
      byIp.set(ip, n);
      return n;
    },
    async incrementIdentityAttempts(identity) {
      const n = (byIdentity.get(key(identity)) ?? 0) + 1;
      byIdentity.set(key(identity), n);
      return n;
    },
    async clearLoginAttempts(ip) {
      byIp.delete(ip);
    },
    async clearIdentityAttempts(identity) {
      byIdentity.delete(key(identity));
    },
  };
  return Object.assign(b, { byIp, byIdentity });
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

function service(rows: PlayerUser[], b = budget()) {
  return new PlayerAuthService(credentials(rows), b, grants, passwords, () => "h:__dummy__");
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

  test("a spread of failures across many accounts still exhausts the client budget", async () => {
    const b = budget();
    const svc = service([user({ id: 9, email: "known@example.com" })], b);

    for (let i = 0; i < MAX_CLIENT; i += 1) {
      await svc.signIn(`nobody${i}@example.com`, "wrongpw1", "5.6.7.8");
    }

    expect(await svc.signIn("known@example.com", "passw0rd", "5.6.7.8")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  test("a successful sign-in clears both counters", async () => {
    const b = budget();
    const svc = service([user({ id: 10, email: "known@example.com" })], b);

    await svc.signIn("known@example.com", "wrongpw1", "1.2.3.4");
    expect((await svc.signIn("known@example.com", "passw0rd", "1.2.3.4")).ok).toBe(true);

    expect(b.byIp.get("1.2.3.4")).toBeUndefined();
    expect(b.byIdentity.get("known@example.com")).toBeUndefined();
  });
});
