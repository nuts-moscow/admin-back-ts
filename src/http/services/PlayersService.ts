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
}
