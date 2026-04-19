import type { BlindType } from "../../domain/BlindType";
import { effectiveAllowedReentryCount } from "../../domain/tournamentReentryPolicy";
import type { TournamentStructure } from "../../domain/TournamentStructure";
import { tournamentStructureCache } from "../../cache";
import {
  playerTournamentRatingFactsRepository,
  tournamentResultRepository,
  tournamentStructureRepository,
  tournamentRepository,
  withTransaction,
} from "../../postgres";
import type { TournamentRow } from "../../postgres/TournamentRepository";
import { runTournamentCompletion } from "./TournamentCompletionService";
import type { InGameUserStateService } from "./InGameUserStateService";
import { tournamentClockService } from "./TournamentClockService";

export interface MakeTournamentStructureBody {
  name: string;
  playersLimit: number;
  stackSize: number;
  freezeOutEnabled: boolean;
  maxReentries: number;
  entryFreeOnly: boolean;
  blinds: BlindType[];
}

export interface MakeTournamentBody {
  name: string;
  date: number;
  structure: MakeTournamentStructureBody;
  ratingGuaranteeEnabled?: boolean;
  /** Bonus points for places 1–10 when guarantee is on; default 10 */
  ratingGuaranteeBonusPoints?: number;
  ratingPointsCoefficient?: number;
  ratingBountyCoefficient?: number;
  ratingTableId?: number;
}

export type TournamentApiSummary = {
  id: number;
  name: string;
  status: string;
  date: number;
  ratingGuaranteeEnabled: boolean;
  ratingGuaranteeBonusPoints: number;
  ratingPointsCoefficient: number;
  ratingBountyCoefficient: number;
  ratingTableId: number;
};

export function tournamentRowToApi(row: TournamentRow): TournamentApiSummary {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    date: row.date,
    ratingGuaranteeEnabled: row.ratingGuaranteeEnabled,
    ratingGuaranteeBonusPoints: row.ratingGuaranteeBonusPoints,
    ratingPointsCoefficient: row.ratingPointsCoefficient,
    ratingBountyCoefficient: row.ratingBountyCoefficient,
    ratingTableId: row.ratingTableId,
  };
}

export type CreateStructureResult =
  | { ok: true; structure: TournamentStructure }
  | { ok: false; error: "failed" };

export type UpdateStructureResult =
  | { ok: true; structure: TournamentStructure }
  | { ok: false; error: "not_found" | "failed" };

export type CreateTournamentResult =
  | { ok: true; tournament: TournamentApiSummary }
  | { ok: false; error: "failed" };

export type UpdateTournamentStructureResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "failed" };

export type UpdateTournamentResult =
  | { ok: true; tournament: TournamentApiSummary }
  | { ok: false; error: "not_found" | "failed" | "invalid_status" };

export type UpdateTournamentStatusResult =
  | { ok: true; tournament: TournamentApiSummary }
  | { ok: false; error: "not_found" | "failed" | "invalid_status" };

export type SetRatingManualAdjustmentResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_completed" | "failed" };

export class TournamentService {
  constructor(
    private inGameUserStateService?: InGameUserStateService
  ) {}

  async createStructure(
    input: MakeTournamentStructureBody
  ): Promise<CreateStructureResult> {
    const structure = await tournamentStructureRepository.create({
      name: input.name,
      playersLimit: input.playersLimit,
      stackSize: input.stackSize,
      freezeOutEnabled: input.freezeOutEnabled,
      maxReentries: input.maxReentries,
      entryFreeOnly: input.entryFreeOnly,
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
      maxReentries: input.maxReentries,
      entryFreeOnly: input.entryFreeOnly,
      blinds: input.blinds,
    });
    if (!structure) return { ok: false, error: "not_found" };
    return { ok: true, structure };
  }

  async createTournament(input: MakeTournamentBody): Promise<CreateTournamentResult> {
    const tournament = await tournamentRepository.create({
      name: input.name,
      date: input.date,
      ratingGuaranteeEnabled: input.ratingGuaranteeEnabled,
      ratingGuaranteeBonusPoints: input.ratingGuaranteeBonusPoints,
      ratingPointsCoefficient: input.ratingPointsCoefficient,
      ratingBountyCoefficient: input.ratingBountyCoefficient,
      ratingTableId: input.ratingTableId,
    });
    if (!tournament) return { ok: false, error: "failed" };

    const stored = await tournamentStructureCache.set(
      String(tournament.id),
      {
        name: input.structure.name,
        playersLimit: input.structure.playersLimit,
        stackSize: input.structure.stackSize,
        freezeOutEnabled: input.structure.freezeOutEnabled,
        maxReentries: input.structure.maxReentries,
        entryFreeOnly: input.structure.entryFreeOnly,
        blindsStructure: input.structure.blinds,
      }
    );
    if (!stored) {
      return { ok: false, error: "failed" };
    }

    return {
      ok: true,
      tournament: tournamentRowToApi(tournament),
    };
  }

  async listStructures(offset?: number, limit?: number) {
    return tournamentStructureRepository.list({ offset, limit });
  }

  async listTournaments(offset?: number, limit?: number) {
    return tournamentRepository.list({ offset, limit });
  }

  async getTournament(id: number) {
    const tournament = await tournamentRepository.findById(id);
    if (!tournament) return null;
    const structure = await tournamentStructureCache.get(String(id));
    const structureOut =
      structure != null
        ? {
            ...structure,
            allowedReentryCount: effectiveAllowedReentryCount(
              structure.freezeOutEnabled,
              structure.maxReentries
            ),
          }
        : null;
    return {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      date: tournament.date,
      ratingGuaranteeEnabled: tournament.ratingGuaranteeEnabled,
      ratingGuaranteeBonusPoints: tournament.ratingGuaranteeBonusPoints,
      ratingPointsCoefficient: tournament.ratingPointsCoefficient,
      ratingBountyCoefficient: tournament.ratingBountyCoefficient,
      ratingTableId: tournament.ratingTableId,
      structure: structureOut,
    };
  }

  async updateTournamentStatus(
    id: number,
    status: string
  ): Promise<UpdateTournamentStatusResult> {
    const validStatuses = ["registration_open", "in_progress", "completed"];
    if (!validStatuses.includes(status)) {
      return { ok: false, error: "invalid_status" };
    }
    const current = await tournamentRepository.findById(id);
    if (!current) return { ok: false, error: "not_found" };
    if (
      status === "completed" &&
      current.status !== "completed" &&
      this.inGameUserStateService
    ) {
      const completion = await runTournamentCompletion(
        id,
        this.inGameUserStateService
      );
      if (!completion.ok) {
        return {
          ok: false,
          error: "invalid_status",
        };
      }
    }
    const tournament = await tournamentRepository.updateStatus(id, status);
    if (!tournament) return { ok: false, error: "not_found" };

    if (tournament.status === "in_progress") {
      await tournamentClockService.ensureStarted(tournament.id);
    }
    if (tournament.status === "completed") {
      await tournamentClockService.clearClock(tournament.id);
    }

    return { ok: true, tournament: tournamentRowToApi(tournament) };
  }

  async updateTournament(
    id: number,
    input: {
      name: string;
      date: number;
      status: string;
      ratingGuaranteeEnabled?: boolean;
      ratingGuaranteeBonusPoints?: number;
      ratingPointsCoefficient?: number;
      ratingBountyCoefficient?: number;
      ratingTableId?: number;
    }
  ): Promise<UpdateTournamentResult> {
    const validStatuses = ["registration_open", "in_progress", "completed"];
    if (!validStatuses.includes(input.status)) {
      return { ok: false, error: "invalid_status" };
    }
    const current = await tournamentRepository.findById(id);
    if (!current) return { ok: false, error: "not_found" };
    if (
      input.status === "completed" &&
      current.status !== "completed" &&
      this.inGameUserStateService
    ) {
      const completion = await runTournamentCompletion(
        id,
        this.inGameUserStateService
      );
      if (!completion.ok) {
        return {
          ok: false,
          error: "invalid_status",
        };
      }
    }
    const tournament = await tournamentRepository.update(id, {
      name: input.name,
      date: input.date,
      status: input.status,
      ratingGuaranteeEnabled: input.ratingGuaranteeEnabled ?? null,
      ratingGuaranteeBonusPoints: input.ratingGuaranteeBonusPoints ?? null,
      ratingPointsCoefficient: input.ratingPointsCoefficient ?? null,
      ratingBountyCoefficient: input.ratingBountyCoefficient ?? null,
      ratingTableId: input.ratingTableId ?? null,
    });
    if (!tournament) return { ok: false, error: "not_found" };

    if (tournament.status === "in_progress") {
      await tournamentClockService.ensureStarted(tournament.id);
    }
    if (tournament.status === "completed") {
      await tournamentClockService.clearClock(tournament.id);
    }

    return {
      ok: true,
      tournament: tournamentRowToApi(tournament),
    };
  }

  async setRatingManualAdjustment(
    tournamentId: number,
    playerId: string,
    manualAdjustment: number
  ): Promise<SetRatingManualAdjustmentResult> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) return { ok: false, error: "not_found" };
    if (t.status !== "completed") return { ok: false, error: "not_completed" };
    try {
      await withTransaction(async (c) => {
        const okResults =
          await tournamentResultRepository.updateRatingManualAdjustmentWithClient(
            c,
            tournamentId,
            playerId,
            manualAdjustment
          );
        if (!okResults) {
          throw new Error("result_update_failed");
        }
        const okFacts =
          await playerTournamentRatingFactsRepository.updateManualAdjustmentWithClient(
            c,
            tournamentId,
            playerId,
            manualAdjustment
          );
        if (!okFacts) {
          throw new Error("facts_update_failed");
        }
      });
    } catch {
      return { ok: false, error: "failed" };
    }
    return { ok: true };
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
      maxReentries: structure.maxReentries,
      entryFreeOnly: structure.entryFreeOnly,
      blindsStructure: structure.blinds,
    });
    if (!stored) return { ok: false, error: "failed" };
    await tournamentClockService.reconcileAfterStructureChange(id);
    return { ok: true };
  }
}
