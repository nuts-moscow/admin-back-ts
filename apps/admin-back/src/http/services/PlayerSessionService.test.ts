import { describe, expect, test } from "bun:test";
import {
  PlayerSessionService,
  type GrantSigner,
  type SessionStateStore,
} from "./PlayerSessionService";

function fakeStore(): SessionStateStore & { blocked: Set<string>; versions: Map<number, number> } {
  const blocked = new Set<string>();
  const versions = new Map<number, number>();
  return {
    blocked,
    versions,
    async addToBlocklist(jti) {
      blocked.add(jti);
    },
    async isBlocked(jti) {
      return blocked.has(jti);
    },
    async incrementUserTokenVersion(id) {
      const next = (versions.get(id) ?? 0) + 1;
      versions.set(id, next);
      return next;
    },
    async getUserTokenVersion(id) {
      return versions.get(id) ?? 0;
    },
  };
}

/** Tokens are `<playerUserId>:<ver>:<jti>` — enough to test the logic around them. */
function fakeSigner(): GrantSigner {
  let counter = 0;
  return {
    async sign(playerUserId, version) {
      counter += 1;
      const jti = `jti${counter}`;
      return { token: `${playerUserId}:${version}:${jti}`, jti };
    },
    async verify(token) {
      const [id, ver, jti] = token.split(":");
      if (!id || !ver || !jti) return null;
      return { playerUserId: Number(id), ver: Number(ver), jti };
    },
  };
}

describe("PlayerSessionService", () => {
  test("a freshly issued grant verifies", async () => {
    const svc = new PlayerSessionService(fakeStore(), fakeSigner());
    const { token } = await svc.issue(7);
    expect(await svc.verify(token)).toEqual({ ok: true, playerUserId: 7, jti: "jti1" });
  });

  test("ending one session refuses that grant and leaves another device working", async () => {
    const svc = new PlayerSessionService(fakeStore(), fakeSigner());
    const phone = await svc.issue(7);
    const laptop = await svc.issue(7);

    await svc.endSession("current", phone.jti, 7);

    expect(await svc.verify(phone.token)).toEqual({ ok: false });
    expect((await svc.verify(laptop.token)).ok).toBe(true);
  });

  test("ending all sessions refuses every grant, including the one that asked", async () => {
    const svc = new PlayerSessionService(fakeStore(), fakeSigner());
    const phone = await svc.issue(7);
    const laptop = await svc.issue(7);

    await svc.endSession("all", phone.jti, 7);

    expect(await svc.verify(phone.token)).toEqual({ ok: false });
    expect(await svc.verify(laptop.token)).toEqual({ ok: false });
  });

  test("retiring one account's grants leaves another account alone", async () => {
    const svc = new PlayerSessionService(fakeStore(), fakeSigner());
    const mine = await svc.issue(7);
    const theirs = await svc.issue(8);

    await svc.revokeAll(7);

    expect(await svc.verify(mine.token)).toEqual({ ok: false });
    expect((await svc.verify(theirs.token)).ok).toBe(true);
  });

  test("a grant issued after a revocation carries the new version and verifies", async () => {
    const svc = new PlayerSessionService(fakeStore(), fakeSigner());
    await svc.issue(7);
    await svc.revokeAll(7);
    const reissued = await svc.issue(7);

    expect((await svc.verify(reissued.token)).ok).toBe(true);
  });

  test("a token whose signature does not verify is refused without touching the store", async () => {
    const store = fakeStore();
    const svc = new PlayerSessionService(store, fakeSigner());
    expect(await svc.verify("nonsense")).toEqual({ ok: false });
    expect(store.blocked.size).toBe(0);
  });
});
