import type { BlindType } from "../../domain/BlindType";
import type { TournamentStructure } from "../../domain/TournamentStructure";
import { tournamentStructureCache } from "../../cache";
import {
  tournamentStructureRepository,
  tournamentRepository,
} from "../../postgres";

export interface MakeTournamentStructureBody {
  name: string;
  playersLimit: number;
  stackSize: number;
  freezeOutEnabled: boolean;
  blinds: BlindType[];
}

export interface MakeTournamentBody {
  name: string;
  date: number;
  structure: MakeTournamentStructureBody;
}

export type CreateStructureResult =
  | { ok: true; structure: TournamentStructure }
  | { ok: false; error: "failed" };

export type UpdateStructureResult =
  | { ok: true; structure: TournamentStructure }
  | { ok: false; error: "not_found" | "failed" };

export type CreateTournamentResult =
  | { ok: true; tournament: { id: number; name: string; status: string; date: number } }
  | { ok: false; error: "failed" };

export type UpdateTournamentStructureResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "failed" };

export class TournamentService {
  async createStructure(
    input: MakeTournamentStructureBody
  ): Promise<CreateStructureResult> {
    const structure = await tournamentStructureRepository.create({
      name: input.name,
      playersLimit: input.playersLimit,
      stackSize: input.stackSize,
      freezeOutEnabled: input.freezeOutEnabled,
      blinds: input.blinds,
    });
    if (!structure) return { ok: false, error: "failed" };
    return { ok: true, structure };
  }

  async updateStructure(
    id: number,
    input: MakeTournamentStructureBody
  ): Promise<UpdateStructureResult> {
    const structure = await tournamentStructureRepository.update(id, {
      name: input.name,
      playersLimit: input.playersLimit,
      stackSize: input.stackSize,
      freezeOutEnabled: input.freezeOutEnabled,
      blinds: input.blinds,
    });
    if (!structure) return { ok: false, error: "not_found" };
    return { ok: true, structure };
  }

  async createTournament(input: MakeTournamentBody): Promise<CreateTournamentResult> {
    const tournament = await tournamentRepository.create({
      name: input.name,
      date: input.date,
    });
    if (!tournament) return { ok: false, error: "failed" };

    const stored = await tournamentStructureCache.set(
      String(tournament.id),
      {
        name: input.structure.name,
        playersLimit: input.structure.playersLimit,
        stackSize: input.structure.stackSize,
        freezeOutEnabled: input.structure.freezeOutEnabled,
        blindsStructure: input.structure.blinds,
      }
    );
    if (!stored) {
      return { ok: false, error: "failed" };
    }

    return {
      ok: true,
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        date: tournament.date,
      },
    };
  }

  async listStructures(offset?: number, limit?: number) {
    return tournamentStructureRepository.list({ offset, limit });
  }

  async listTournaments(offset?: number, limit?: number) {
    return tournamentRepository.list({ offset, limit });
  }

  async updateTournamentStructure(
    tournamentId: string,
    structure: MakeTournamentStructureBody
  ): Promise<UpdateTournamentStructureResult> {
    const id = parseInt(tournamentId, 10);
    if (Number.isNaN(id)) return { ok: false, error: "not_found" };

    const tournament = await tournamentRepository.findById(id);
    if (!tournament) return { ok: false, error: "not_found" };

    const stored = await tournamentStructureCache.set(tournamentId, {
      name: structure.name,
      playersLimit: structure.playersLimit,
      stackSize: structure.stackSize,
      freezeOutEnabled: structure.freezeOutEnabled,
      blindsStructure: structure.blinds,
    });
    if (!stored) return { ok: false, error: "failed" };
    return { ok: true };
  }
}
