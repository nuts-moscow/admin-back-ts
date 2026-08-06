import type { CreatePlayerInput, Player, UpdatePlayerInput } from "../../domain/Player";
import { weighNickname, type NicknameRefusal } from "../../domain/nicknameRule";
import { playerRepository } from "../../postgres";

export type CreatePlayerResult =
  | { ok: true; player: Player }
  | {
      ok: false;
      error: "duplicate_nickname" | "invalid_nickname" | "failed";
      /** Present with `invalid_nickname`: which of the rule's refusals it was. */
      nicknameReason?: NicknameRefusal;
    };

export type UpdatePlayerResult =
  | { ok: true; player: Player }
  | { ok: false; error: "not_found" | "duplicate_nickname" | "invalid_nickname" };

export type DeletePlayerResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "failed" };

export class PlayersService {
  async listPlayers(offset?: number, limit?: number) {
    return playerRepository.list({ offset, limit });
  }

  /** Returns player by id or null if not found. */
  async getPlayer(playerId: string): Promise<Player | null> {
    return playerRepository.findById(playerId);
  }

  async createPlayer(input: CreatePlayerInput): Promise<CreatePlayerResult> {
    // The admin console is the third writer of a player's name, and the busiest
    // — someone is written down a minute before a tournament starts. It is
    // bound by the same rule as the other two, and it has to say what went
    // wrong rather than surface a constraint violation.
    const verdict = weighNickname(input.nickname);
    if (!verdict.ok) {
      return { ok: false, error: "invalid_nickname", nicknameReason: verdict.reason };
    }

    const existing = await playerRepository.findByFoldedNickname(verdict.nickname);
    if (existing) {
      return { ok: false, error: "duplicate_nickname" };
    }
    const player = await playerRepository.create(input);
    if (!player) {
      return { ok: false, error: "failed" };
    }
    return { ok: true, player };
  }

  async updatePlayer(
    playerId: string,
    input: UpdatePlayerInput
  ): Promise<UpdatePlayerResult> {
    if (input.nickname !== undefined && input.nickname.trim() === "") {
      return { ok: false, error: "invalid_nickname" };
    }
    if (input.nickname !== undefined) {
      const existing = await playerRepository.findByNickname(input.nickname.trim());
      if (existing && String(existing.id) !== playerId) {
        return { ok: false, error: "duplicate_nickname" };
      }
    }
    const player = await playerRepository.update(playerId, input);
    if (!player) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, player };
  }

  /** Removes the player row from the database by id. */
  async deletePlayer(playerId: string): Promise<DeletePlayerResult> {
    const deleted = await playerRepository.deleteById(playerId);
    if (!deleted) {
      const exists = await playerRepository.findById(playerId);
      if (exists) {
        return { ok: false, error: "failed" };
      }
      return { ok: false, error: "not_found" };
    }
    return { ok: true };
  }

  /**
   * Applies delta to player's free entry count (clamp to >= 0). Returns new count or null if player not found.
   */
  async updateFreeEntryCountByDelta(
    playerId: string,
    delta: number
  ): Promise<{ ok: true; freeEntryCount: number } | { ok: false; error: "not_found" }> {
    const newCount = await playerRepository.updateFreeEntryCountByDelta(playerId, delta);
    if (newCount === null) return { ok: false, error: "not_found" };
    return { ok: true, freeEntryCount: newCount };
  }

  /**
   * Applies delta to player's free reentry count (clamp to >= 0). Returns new count or null if player not found.
   * Caller should sync to tournament state after this.
   */
  async updateFreeReentryCountByDelta(
    playerId: string,
    delta: number
  ): Promise<{ ok: true; freeReentryCount: number } | { ok: false; error: "not_found" }> {
    const newCount = await playerRepository.updateFreeReentryCountByDelta(playerId, delta);
    if (newCount === null) return { ok: false, error: "not_found" };
    return { ok: true, freeReentryCount: newCount };
  }
}
