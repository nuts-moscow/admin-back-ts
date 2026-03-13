import type { CreatePlayerInput, Player } from "../../domain/Player";
import { playerRepository } from "../../postgres";

export type CreatePlayerResult =
  | { ok: true; player: Player }
  | { ok: false; error: "duplicate_nickname" | "failed" };

export class PlayersService {
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
}
