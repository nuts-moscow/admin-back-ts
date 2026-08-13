import { ApplicationConfigs } from "../../configs";
// The sink is injected rather than reached for: unit tests construct this
// service directly, and what its lines say is part of the contract.
import { logger, moduleLogSink, type LogSink } from "../../logger";
import {
  verifyTelegramPayload,
  type TelegramIdentity,
  type TelegramPayload,
} from "../../domain/telegramPayload";
import { fold } from "../../domain/nicknameRule";
import { playerUserRepository, type PlayerUser } from "../../postgres/PlayerUserRepository";
import { withTransaction } from "../../postgres/withTransaction";
import { playerSessionService } from "./PlayerSessionService";

/**
 * What the door answers. `unbound` is the load-bearing one and the reason this
 * service exists in this shape: a proved identity the club has never seen is
 * neither a success nor a failure, and above all it is not a new account. It
 * is a question for the person standing there — see
 * `unknown-telegram-asks-before-it-creates`.
 */
export type TelegramSignInResult =
  | { ok: true; user: PlayerUser; token: string; jti: string }
  | { ok: false; reason: "unbound" | "not_proved" | "disabled" | "error" };

export type TelegramOpenResult =
  | { ok: true; user: PlayerUser; token: string; jti: string }
  | { ok: false; reason: "taken" | "not_proved" | "disabled" | "error" };

export type TelegramBindResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "not_proved" | "disabled" | "error" };

export interface Consent {
  slug: string;
  version: string;
}

export interface TelegramAccounts {
  findByTelegramId(telegramId: number): Promise<PlayerUser | null>;
  bindTelegram(id: number, telegramId: number): Promise<{ ok: boolean; reason?: string }>;
  unbindTelegram(id: number): Promise<boolean>;
  /**
   * Profile, credential and consent together or nothing at all — the same
   * promise `signup-completes-or-leaves-nothing` makes for the mail door, and
   * it has to hold here for the same reason: an account without the consent
   * that gated it must not exist.
   */
  openAccount(input: {
    nickname: string;
    telegramId: number;
    consents: ReadonlyArray<Consent>;
  }): Promise<{ ok: true; user: PlayerUser } | { ok: false; reason: "taken" | "error" }>;
}

export interface TelegramGrants {
  issue(accountId: number): Promise<{ token: string; jti: string }>;
}

export interface TelegramSettings {
  botToken: string | null;
  maxAgeSec: number;
}

/**
 * The second door.
 *
 * Three acts, deliberately three and not one. Signing in resolves a proved
 * identity to an account and never writes. Opening an account is the only
 * path that creates, and it exists because the door is forbidden to guess
 * that a newcomer's Telegram belongs to a player it already knows. Binding
 * ties the two together and demands a live grant, because a door is installed
 * from inside.
 *
 * There is no attempt budget here and there will not be one: a signature is
 * either right or wrong, and nothing about it can be approached by guessing.
 */
export class TelegramAuthService {
  constructor(
    private readonly accounts: TelegramAccounts,
    private readonly grants: TelegramGrants,
    private readonly settings: () => TelegramSettings,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
    private readonly log: LogSink = moduleLogSink
  ) {}

  private prove(payload: TelegramPayload): TelegramIdentity | "disabled" | null {
    const { botToken, maxAgeSec } = this.settings();
    if (!botToken) {
      this.log.warn({ door: "telegram" }, "[TelegramAuth] refused: no bot token configured");
      return "disabled";
    }
    const verdict = verifyTelegramPayload(payload, botToken, this.now(), maxAgeSec);
    if (!verdict.ok) {
      // The reason is worth a log line and never worth a response body: a
      // caller learning "stale" rather than "bad signature" learns how close
      // they got.
      this.log.warn({ door: "telegram", verdict: verdict.reason }, "[TelegramAuth] payload refused");
      return null;
    }
    return verdict.identity;
  }

  async signIn(payload: TelegramPayload): Promise<TelegramSignInResult> {
    const proved = this.prove(payload);
    if (proved === "disabled") return { ok: false, reason: "disabled" };
    if (!proved) return { ok: false, reason: "not_proved" };

    const user = await this.accounts.findByTelegramId(proved.telegramId);
    if (!user) {
      // Nothing is written and nothing is created. The only thing that happens
      // here is that we say so.
      this.log.info({ door: "telegram" }, "[TelegramAuth] sign-in refused: identity not bound");
      return { ok: false, reason: "unbound" };
    }

    const { token, jti } = await this.grants.issue(user.id);
    this.log.info(
      { door: "telegram", jti: jti.slice(0, 8) },
      "[TelegramAuth] sign-in successful"
    );
    return { ok: true, user, token, jti };
  }

  /**
   * The deliberate act. The caller has told us this identity is new here, so
   * the only thing left to check is whether it is — the unique index decides,
   * not this method.
   */
  async openAccount(
    payload: TelegramPayload,
    nickname: string,
    consents: ReadonlyArray<Consent>
  ): Promise<TelegramOpenResult> {
    const proved = this.prove(payload);
    if (proved === "disabled") return { ok: false, reason: "disabled" };
    if (!proved) return { ok: false, reason: "not_proved" };

    // A fast path, never the authority: the unique index below settles the
    // race this check cannot see.
    if (await this.accounts.findByTelegramId(proved.telegramId)) {
      return { ok: false, reason: "taken" };
    }

    const created = await this.accounts.openAccount({
      nickname,
      telegramId: proved.telegramId,
      consents,
    });
    if (!created.ok) return { ok: false, reason: created.reason };
    const user = created.user;

    const { token, jti } = await this.grants.issue(user.id);
    this.log.info(
      { door: "telegram", jti: jti.slice(0, 8) },
      "[TelegramAuth] account opened by telegram"
    );
    return { ok: true, user, token, jti };
  }

  /** Installed from inside: `accountId` comes from a live grant, never from the payload. */
  async bind(accountId: number, payload: TelegramPayload): Promise<TelegramBindResult> {
    const proved = this.prove(payload);
    if (proved === "disabled") return { ok: false, reason: "disabled" };
    if (!proved) return { ok: false, reason: "not_proved" };

    const result = await this.accounts.bindTelegram(accountId, proved.telegramId);
    if (!result.ok) {
      this.log.warn(
        { door: "telegram", accountId, outcome: result.reason ?? "taken" },
        "[TelegramAuth] bind refused"
      );
      return { ok: false, reason: result.reason === "error" ? "error" : "taken" };
    }
    this.log.info({ door: "telegram", accountId }, "[TelegramAuth] telegram bound");
    return { ok: true };
  }

  async unbind(accountId: number): Promise<boolean> {
    const done = await this.accounts.unbindTelegram(accountId);
    this.log.info({ door: "telegram", accountId, done }, "[TelegramAuth] telegram unbound");
    return done;
  }
}

/**
 * A bcrypt-shaped string no password hashes to. An account opened by Telegram
 * has no password, and "no password" must not read as "empty password"
 * anywhere downstream.
 */
export const UNUSABLE_PASSWORD_HASH = "$2b$12$" + "x".repeat(53);

/**
 * One transaction, mirroring the mail door's. The nickname's comparison key is
 * written in the same statement as the name, so the unique index settles a
 * race no pre-check could; a Telegram identity taken in the meantime rolls the
 * whole thing back and leaves no orphan profile behind.
 */
async function openAccountAtomically(input: {
  nickname: string;
  telegramId: number;
  consents: ReadonlyArray<Consent>;
}): Promise<{ ok: true; user: PlayerUser } | { ok: false; reason: "taken" | "error" }> {
  try {
    const accountId = await withTransaction(async (client) => {
      const player = await client.query(
        "INSERT INTO players (nickname, nickname_folded) VALUES ($1, $2) RETURNING id",
        [input.nickname, fold(input.nickname)]
      );
      const playerId = Number(player.rows[0]?.id);
      if (!playerId) throw new Error("player insert returned no id");

      const user = await client.query(
        `INSERT INTO player_users (login, email, password_hash, player_id, telegram_id)
         VALUES (NULL, NULL, $1, $2, $3) RETURNING id`,
        [UNUSABLE_PASSWORD_HASH, playerId, input.telegramId]
      );
      const id = Number(user.rows[0]?.id);
      if (!id) throw new Error("player_user insert returned no id");

      for (const doc of input.consents) {
        await client.query(
          `INSERT INTO player_document_consents
             (player_id, document_slug, document_version, ip)
           VALUES ($1, $2, $3, NULL)
           ON CONFLICT (player_id, document_slug, document_version) DO NOTHING`,
          [playerId, doc.slug, doc.version]
        );
      }
      return id;
    });
    const user = await playerUserRepository.findById(accountId);
    return user ? { ok: true, user } : { ok: false, reason: "error" };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      // The index is the authority — on the nickname and on the identity alike.
      return { ok: false, reason: "taken" };
    }
    logger?.error({ err, door: "telegram" }, "[TelegramAuth] account transaction rolled back");
    return { ok: false, reason: "error" };
  }
}

export const telegramAuthService = new TelegramAuthService(
  {
    findByTelegramId: (telegramId) => playerUserRepository.findByTelegramId(telegramId),
    bindTelegram: (id, telegramId) => playerUserRepository.bindTelegram(id, telegramId),
    unbindTelegram: (id) => playerUserRepository.unbindTelegram(id),
    openAccount: (input) => openAccountAtomically(input),
  },
  { issue: (accountId) => playerSessionService.issue(accountId) },
  () => ApplicationConfigs.instance.telegram
);
