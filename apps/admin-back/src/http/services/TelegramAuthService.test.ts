import { describe, expect, test } from "bun:test";
import { signTelegramPayload, type TelegramPayload } from "../../domain/telegramPayload";
import type { PlayerUser } from "../../postgres/PlayerUserRepository";
import {
  TelegramAuthService,
  type Consent,
  type TelegramAccounts,
  type TelegramGrants,
  type TelegramLogSink,
} from "./TelegramAuthService";

const TOKEN = "123456:test-bot-token";
const NOW = 1_700_000_000;
const CONSENTS: Consent[] = [{ slug: "offer", version: "1" }];

function payload(over: Partial<TelegramPayload> = {}): TelegramPayload {
  return signTelegramPayload(
    { id: "42", first_name: "Игрок", username: "player", auth_date: String(NOW), ...over },
    TOKEN
  );
}

function user(over: Partial<PlayerUser>): PlayerUser {
  return {
    id: 1,
    login: null,
    email: null,
    passwordHash: "h:nothing",
    playerId: 100,
    createdAt: new Date(0),
    emailVerifiedAt: null,
    telegramId: null,
    ...over,
  };
}

/** A store that behaves like the schema does, uniqueness included. */
function accounts(rows: PlayerUser[] = []) {
  const opened: Array<{ nickname: string; telegramId: number; consents: readonly Consent[] }> = [];
  let nextId = 500;
  const store: TelegramAccounts = {
    async findByTelegramId(telegramId) {
      return rows.find((r) => r.telegramId === telegramId) ?? null;
    },
    async bindTelegram(id, telegramId) {
      if (rows.some((r) => r.telegramId === telegramId)) return { ok: false, reason: "taken" };
      const row = rows.find((r) => r.id === id);
      if (!row || row.telegramId != null) return { ok: false, reason: "taken" };
      row.telegramId = telegramId;
      return { ok: true };
    },
    async unbindTelegram(id) {
      const row = rows.find((r) => r.id === id);
      if (!row) return false;
      row.telegramId = null;
      return true;
    },
    async openAccount(input) {
      if (rows.some((r) => r.telegramId === input.telegramId)) {
        return { ok: false, reason: "taken" };
      }
      opened.push({ ...input, consents: input.consents });
      const row = user({ id: (nextId += 1), telegramId: input.telegramId, playerId: nextId });
      rows.push(row);
      return { ok: true, user: row };
    },
  };
  return Object.assign(store, { rows, opened });
}

const grants: TelegramGrants = {
  async issue(accountId) {
    return { token: `token-${accountId}`, jti: `jti-${accountId}` };
  },
};

function sink() {
  const lines: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const log: TelegramLogSink = {
    info: (fields, message) => lines.push({ fields, message }),
    warn: (fields, message) => lines.push({ fields, message }),
  };
  return Object.assign(log, { lines });
}

function service(store = accounts(), log = sink(), botToken: string | null = TOKEN) {
  return new TelegramAuthService(
    store,
    grants,
    () => ({ botToken, maxAgeSec: 60 }),
    () => NOW,
    log
  );
}

describe("TelegramAuthService — the payload has to prove itself", () => {
  test("a tampered payload is refused and touches nothing", async () => {
    const store = accounts();
    const result = await service(store).signIn({ ...payload(), id: "43" });
    expect(result).toEqual({ ok: false, reason: "not_proved" });
    expect(store.rows).toHaveLength(0);
  });

  test("a stale payload is refused", async () => {
    const svc = new TelegramAuthService(
      accounts(),
      grants,
      () => ({ botToken: TOKEN, maxAgeSec: 60 }),
      () => NOW + 61,
      sink()
    );
    expect(await svc.signIn(payload())).toEqual({ ok: false, reason: "not_proved" });
  });

  test("with no bot token the door does not exist rather than trusting anything", async () => {
    expect(await service(accounts(), sink(), null).signIn(payload())).toEqual({
      ok: false,
      reason: "disabled",
    });
  });
});

describe("TelegramAuthService — an unknown identity asks before it creates", () => {
  test("signing in with an unbound identity writes nothing and issues no grant", async () => {
    const store = accounts();
    const result = await service(store).signIn(payload());

    expect(result).toEqual({ ok: false, reason: "unbound" });
    expect(store.rows).toHaveLength(0);
    expect(store.opened).toHaveLength(0);
  });

  test("a matching name or username is not a reason to join an existing account", async () => {
    const store = accounts([user({ id: 7, login: "player", telegramId: null })]);
    const result = await service(store).signIn(payload({ username: "player" }));

    expect(result).toEqual({ ok: false, reason: "unbound" });
    expect(store.rows.find((r) => r.id === 7)?.telegramId).toBeNull();
  });

  test("the deliberate act creates, with the consents it was gated on", async () => {
    const store = accounts();
    const result = await service(store).openAccount(payload(), "Новичок", CONSENTS);

    expect(result.ok).toBe(true);
    expect(store.opened).toHaveLength(1);
    expect(store.opened[0]?.nickname).toBe("Новичок");
    expect(store.opened[0]?.consents).toEqual(CONSENTS);
  });

  test("opening twice with the same identity is refused the second time", async () => {
    const store = accounts();
    await service(store).openAccount(payload(), "Первый", CONSENTS);
    const again = await service(store).openAccount(payload(), "Второй", CONSENTS);

    expect(again).toEqual({ ok: false, reason: "taken" });
    expect(store.rows).toHaveLength(1);
  });
});

describe("TelegramAuthService — a bound identity is a full entrance", () => {
  test("a bound identity signs in and gets a grant", async () => {
    const store = accounts([user({ id: 9, telegramId: 42 })]);
    const result = await service(store).signIn(payload());

    expect(result.ok).toBe(true);
    expect(result.ok && result.user.id).toBe(9);
    expect(result.ok && result.token).toBe("token-9");
  });

  test("an account with no password and no address still gets in", async () => {
    const store = accounts([user({ id: 10, telegramId: 42, email: null, login: null })]);
    expect((await service(store).signIn(payload())).ok).toBe(true);
  });
});

describe("TelegramAuthService — binding is installed from inside", () => {
  test("binding ties the identity to the account whose grant was presented", async () => {
    const store = accounts([user({ id: 11 }), user({ id: 12 })]);
    expect(await service(store).bind(12, payload())).toEqual({ ok: true });

    expect(store.rows.find((r) => r.id === 12)?.telegramId).toBe(42);
    expect(store.rows.find((r) => r.id === 11)?.telegramId).toBeNull();
  });

  test("an identity already bound elsewhere is refused", async () => {
    const store = accounts([user({ id: 13, telegramId: 42 }), user({ id: 14 })]);
    expect(await service(store).bind(14, payload())).toEqual({ ok: false, reason: "taken" });
    expect(store.rows.find((r) => r.id === 14)?.telegramId).toBeNull();
  });

  test("an account that already carries a binding keeps the one it has", async () => {
    const store = accounts([user({ id: 15, telegramId: 7 })]);
    expect(await service(store).bind(15, payload())).toEqual({ ok: false, reason: "taken" });
    expect(store.rows.find((r) => r.id === 15)?.telegramId).toBe(7);
  });

  test("unbinding leaves the account reachable by its other door", async () => {
    const store = accounts([user({ id: 16, telegramId: 42, email: "a@b.c" })]);
    expect(await service(store).unbind(16)).toBe(true);
    expect(store.rows.find((r) => r.id === 16)?.telegramId).toBeNull();
  });
});

describe("TelegramAuthService — the log names its door", () => {
  test("every line this door writes says which door it was", async () => {
    const log = sink();
    const store = accounts([user({ id: 17, telegramId: 42 })]);
    const svc = service(store, log);

    await svc.signIn(payload());
    await svc.signIn(payload({ id: "99" }));
    await svc.bind(17, payload());

    expect(log.lines.length).toBeGreaterThanOrEqual(3);
    for (const line of log.lines) {
      expect(line.fields.door).toBe("telegram");
    }
  });

  test("no line carries the telegram identifier", async () => {
    const log = sink();
    const store = accounts();
    await service(store, log).openAccount(payload(), "Кто-то", CONSENTS);

    for (const line of log.lines) {
      expect(JSON.stringify(line.fields)).not.toContain("42");
    }
  });
});
