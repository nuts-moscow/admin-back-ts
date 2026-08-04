import { describe, expect, test } from "bun:test";
import type { OtpVerdict } from "./EmailVerificationService";
import {
  PasswordWriteService,
  type AccountStore,
  type CodeChecker,
  type GrantRevoker,
  type PasswordHasher,
} from "./PasswordWriteService";

const hasher: PasswordHasher = {
  async hash(password) {
    return `h:${password}`;
  },
  async verify(password, hash) {
    return hash === `h:${password}`;
  },
};

function accountStore(rows: Record<number, string>): AccountStore & { rows: Record<number, string> } {
  const store = {
    rows,
    async findById(id: number) {
      const passwordHash = rows[id];
      return passwordHash ? { id, passwordHash } : null;
    },
    async updatePassword(id: number, passwordHash: string) {
      if (!(id in rows)) return false;
      rows[id] = passwordHash;
      return true;
    },
  };
  return store;
}

function codes(verdict: OtpVerdict, issued = true): CodeChecker & { issues: string[] } {
  const issues: string[] = [];
  return {
    issues,
    async issue(address) {
      issues.push(address);
      return { ok: issued };
    },
    async check() {
      return verdict;
    },
  };
}

function revoker(): GrantRevoker & { revoked: number[] } {
  const revoked: number[] = [];
  return {
    revoked,
    async revokeAll(accountId) {
      revoked.push(accountId);
    },
  };
}

describe("PasswordWriteService — a write needs a proof", () => {
  test("the current password proves the account and the new password lands", async () => {
    const accounts = accountStore({ 42: "h:oldpass1" });
    const grants = revoker();
    const svc = new PasswordWriteService(accounts, codes({ status: "wrong" }), grants, hasher);

    const result = await svc.write(
      { kind: "current_password", accountId: 42, currentPassword: "oldpass1" },
      "newpass1"
    );

    expect(result).toEqual({ ok: true, accountId: 42 });
    expect(accounts.rows[42]).toBe("h:newpass1");
    expect(grants.revoked).toEqual([42]);
  });

  test("a wrong current password writes nothing", async () => {
    const accounts = accountStore({ 42: "h:oldpass1" });
    const grants = revoker();
    const svc = new PasswordWriteService(accounts, codes({ status: "wrong" }), grants, hasher);

    const result = await svc.write(
      { kind: "current_password", accountId: 42, currentPassword: "guess123" },
      "newpass1"
    );

    expect(result).toEqual({ ok: false, reason: "invalid_proof" });
    expect(accounts.rows[42]).toBe("h:oldpass1");
    expect(grants.revoked).toEqual([]);
  });

  test("a refused code writes nothing", async () => {
    const accounts = accountStore({ 42: "h:oldpass1" });
    const svc = new PasswordWriteService(
      accounts,
      codes({ status: "exhausted" }),
      revoker(),
      hasher
    );

    const result = await svc.write(
      { kind: "mailbox_code", address: "a@example.com", code: "000000" },
      "newpass1"
    );

    expect(result).toEqual({ ok: false, reason: "invalid_proof" });
    expect(accounts.rows[42]).toBe("h:oldpass1");
  });

  test("a weak new password is refused before any proof is spent", async () => {
    const accounts = accountStore({ 42: "h:oldpass1" });
    const checker = codes({ status: "accepted", accountId: 42 });
    const svc = new PasswordWriteService(accounts, checker, revoker(), hasher);

    expect(
      await svc.write({ kind: "mailbox_code", address: "a@example.com", code: "1" }, "short")
    ).toEqual({ ok: false, reason: "weak_password" });
    expect(accounts.rows[42]).toBe("h:oldpass1");
  });
});

describe("PasswordWriteService — the proof names its account", () => {
  test("the written account comes off the verdict, not off the request", async () => {
    const accounts = accountStore({ 42: "h:oldpass1", 7: "h:theirs12" });
    const svc = new PasswordWriteService(
      accounts,
      codes({ status: "accepted", accountId: 42 }),
      revoker(),
      hasher
    );

    // The caller names someone else's mailbox; the verdict still says 42.
    const result = await svc.write(
      { kind: "mailbox_code", address: "theirs@example.com", code: "123456" },
      "newpass1"
    );

    expect(result).toEqual({ ok: true, accountId: 42 });
    expect(accounts.rows[42]).toBe("h:newpass1");
    expect(accounts.rows[7]).toBe("h:theirs12");
  });

  test("an accepted verdict with no account authorises nothing", async () => {
    const accounts = accountStore({ 42: "h:oldpass1" });
    const svc = new PasswordWriteService(
      accounts,
      codes({ status: "accepted", accountId: null }),
      revoker(),
      hasher
    );

    expect(
      await svc.write(
        { kind: "mailbox_code", address: "a@example.com", code: "123456" },
        "newpass1"
      )
    ).toEqual({ ok: false, reason: "invalid_proof" });
    expect(accounts.rows[42]).toBe("h:oldpass1");
  });
});

describe("PasswordWriteService — asking for a reset", () => {
  test("an unknown address is asked for exactly like a known one", async () => {
    const known = codes({ status: "wrong" });
    const unknown = codes({ status: "wrong" });
    const svcKnown = new PasswordWriteService(accountStore({ 42: "h:x" }), known, revoker(), hasher);
    const svcUnknown = new PasswordWriteService(accountStore({}), unknown, revoker(), hasher);

    expect(await svcKnown.requestReset("a@example.com")).toEqual({ ok: true });
    expect(await svcUnknown.requestReset("nobody@example.com")).toEqual({ ok: true });
  });

  test("a spent mint budget is the one distinguishable answer", async () => {
    const svc = new PasswordWriteService(
      accountStore({}),
      codes({ status: "wrong" }, false),
      revoker(),
      hasher
    );
    expect(await svc.requestReset("a@example.com")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });
});
