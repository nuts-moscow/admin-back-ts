import type { CreatePlayerInput, Player } from "../../domain/Player";
import { playerRepository } from "../../postgres";

export type CreatePlayerResult =
  | { ok: true; player: Player }
  | { ok: false; error: "duplicate_nickname" | "failed" };

export type UpdateSignAgreementResult =
  | { ok: true; player: Player }
  | { ok: false; error: "not_found" };

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

  async updateSignAgreement(
    playerId: string,
    signAgreement: boolean
  ): Promise<UpdateSignAgreementResult> {
    const player = await playerRepository.updateSignAgreement(playerId, signAgreement);
    if (!player) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, player };
  }
}
