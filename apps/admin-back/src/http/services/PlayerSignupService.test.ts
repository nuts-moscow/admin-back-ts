import { describe, expect, test } from "bun:test";
import { REQUIRED_LEGAL_DOCS } from "../../domain/legalDocuments";
import type { OtpVerdict } from "./EmailVerificationService";
import {
  PlayerSignupService,
  type AccountCreator,
  type SignupCodes,
  type SignupGrants,
  type SignupHasher,
} from "./PlayerSignupService";

const GOOD_PASSWORD = "passw0rd";
const CONSENTS = REQUIRED_LEGAL_DOCS.map((d) => ({ slug: d.slug, version: d.version }));

interface Written {
  accountId: number;
  playerId: number;
  email: string;
  consents: number;
}

/**
 * Stands in for the transaction: `failAt` makes the whole act fail, which is
 * the only interesting case — a partial account is not representable here for
 * the same reason it is not representable in Postgres.
 */
function accountCreator(opts: { taken?: boolean; fail?: "taken" | "error" } = {}) {
  const written: Written[] = [];
  let nextId = 1;
  const creator: AccountCreator = {
    async isAddressTaken() {
      return opts.taken === true;
    },
    async createAccount(input) {
      if (opts.fail) return { ok: false, reason: opts.fail };
      const accountId = nextId++;
      const playerId = 100 + accountId;
      written.push({
        accountId,
        playerId,
        email: input.email,
        consents: input.consents.length,
      });
      return { ok: true, accountId, playerId };
    },
  };
  return Object.assign(creator, { written });
}

function signupCodes(verdict: OtpVerdict, issued = true) {
  const spent: string[] = [];
  const issues: string[] = [];
  const codes: SignupCodes = {
    async issue(address) {
      issues.push(address);
      return { ok: issued };
    },
    async check(address) {
      spent.push(address);
      return verdict;
    },
  };
  return Object.assign(codes, { spent, issues });
}

const grants: SignupGrants = {
  async issue(accountId) {
    return { token: `token-${accountId}` };
  },
};

const hasher: SignupHasher = {
  async hash(password) {
    return `h:${password}`;
  },
};

describe("PlayerSignupService — an offered address is a claim, not an account", () => {
  test("beginning a signup creates nothing and asks for a code", async () => {
    const accounts = accountCreator();
    const codes = signupCodes({ status: "wrong" });
    const svc = new PlayerSignupService(accounts, codes, grants, hasher);

    expect(await svc.begin("a@example.com", GOOD_PASSWORD)).toEqual({ ok: true });
    expect(accounts.written).toEqual([]);
    expect(codes.issues).toEqual(["a@example.com"]);
  });

  test("a taken address is refused before any letter goes out", async () => {
    const accounts = accountCreator({ taken: true });
    const codes = signupCodes({ status: "wrong" });
    const svc = new PlayerSignupService(accounts, codes, grants, hasher);

    expect(await svc.begin("a@example.com", GOOD_PASSWORD)).toEqual({
      ok: false,
      reason: "taken",
    });
    expect(codes.issues).toEqual([]);
  });

  test("a weak password is refused before any letter goes out", async () => {
    const codes = signupCodes({ status: "wrong" });
    const svc = new PlayerSignupService(accountCreator(), codes, grants, hasher);

    expect(await svc.begin("a@example.com", "short")).toEqual({
      ok: false,
      reason: "weak_password",
    });
    expect(codes.issues).toEqual([]);
  });
});

describe("PlayerSignupService — the signup completes or leaves nothing", () => {
  test("a completed signup writes the account with its consent and hands back a grant", async () => {
    const accounts = accountCreator();
    const svc = new PlayerSignupService(
      accounts,
      signupCodes({ status: "accepted", accountId: null }),
      grants,
      hasher
    );

    const result = await svc.complete({
      address: "a@example.com",
      code: "123456",
      password: GOOD_PASSWORD,
      consents: CONSENTS,
      ip: "1.2.3.4",
    });

    expect(result.ok).toBe(true);
    expect(accounts.written).toHaveLength(1);
    expect(accounts.written[0]!.consents).toBe(REQUIRED_LEGAL_DOCS.length);
    expect(result.ok && result.token).toBe("token-1");
  });

  test("a failed account write leaves nothing behind", async () => {
    const accounts = accountCreator({ fail: "error" });
    const svc = new PlayerSignupService(
      accounts,
      signupCodes({ status: "accepted", accountId: null }),
      grants,
      hasher
    );

    const result = await svc.complete({
      address: "a@example.com",
      code: "123456",
      password: GOOD_PASSWORD,
      consents: CONSENTS,
      ip: null,
    });

    expect(result).toEqual({ ok: false, reason: "error" });
    expect(accounts.written).toEqual([]);
  });

  test("losing the race on the address is reported as taken, not as a crash", async () => {
    const svc = new PlayerSignupService(
      accountCreator({ fail: "taken" }),
      signupCodes({ status: "accepted", accountId: null }),
      grants,
      hasher
    );

    expect(
      await svc.complete({
        address: "a@example.com",
        code: "123456",
        password: GOOD_PASSWORD,
        consents: CONSENTS,
        ip: null,
      })
    ).toEqual({ ok: false, reason: "taken" });
  });

  test("a wrong code writes nothing", async () => {
    const accounts = accountCreator();
    const svc = new PlayerSignupService(accounts, signupCodes({ status: "wrong" }), grants, hasher);

    expect(
      await svc.complete({
        address: "a@example.com",
        code: "000000",
        password: GOOD_PASSWORD,
        consents: CONSENTS,
        ip: null,
      })
    ).toEqual({ ok: false, reason: "invalid_code" });
    expect(accounts.written).toEqual([]);
  });
});

describe("PlayerSignupService — consent gates the account", () => {
  test("an incomplete set of accepted documents is refused and leaves no account", async () => {
    const accounts = accountCreator();
    const codes = signupCodes({ status: "accepted", accountId: null });
    const svc = new PlayerSignupService(accounts, codes, grants, hasher);

    expect(
      await svc.complete({
        address: "a@example.com",
        code: "123456",
        password: GOOD_PASSWORD,
        consents: [],
        ip: null,
      })
    ).toEqual({ ok: false, reason: "consent_required" });
    expect(accounts.written).toEqual([]);
    // Refused before the code was even weighed, so it stays usable.
    expect(codes.spent).toEqual([]);
  });
});
