import type { CreatePlayerInput, Player, UpdatePlayerInput } from "../../domain/Player";
import { playerRepository } from "../../postgres";

export type CreatePlayerResult =
  | { ok: true; player: Player }
  | { ok: false; error: "duplicate_nickname" | "failed" };

export type UpdatePlayerResult =
  | { ok: true; player: Player }
  | { ok: false; error: "not_found" | "duplicate_nickname" | "invalid_nickname" };

export class PlayersService {
  async listPlayers(offset?: number, limit?: number) {
    return playerRepository.list({ offset, limit });
  }

  /** Returns player by id or null if not found. */
  async getPlayer(playerId: string): Promise<Player | null> {
    return playerRepository.findById(playerId);
  }

  async createPlayer(input: CreatePlayerInput): Promise<CreatePlayerResult> {
    const existing = await playerRepository.findByNickname(input.nickname);
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
