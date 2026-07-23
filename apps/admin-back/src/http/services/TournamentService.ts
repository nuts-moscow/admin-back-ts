import type { BlindType } from "../../domain/BlindType";
import { InGamePlayerStatus } from "../../domain/cache/InGameUserState";
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
import type { SeasonalRatingEntry } from "../../postgres";
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
  ratingEnabled?: boolean;
  ratingSeasonYear?: number | null;
  ratingSeasonMonth?: number | null;
  /** Create the tournament as a month final (invite-only); default false. */
  monthFinal?: boolean;
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
  ratingEnabled: boolean;
  ratingSeasonYear: number | null;
  ratingSeasonMonth: number | null;
  lateRegistrationClosed: boolean;
  monthFinal: boolean;
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
    ratingEnabled: row.ratingEnabled,
    ratingSeasonYear: row.ratingSeasonYear,
    ratingSeasonMonth: row.ratingSeasonMonth,
    lateRegistrationClosed: row.lateRegistrationClosed,
    monthFinal: row.monthFinal,
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

export type GetSeasonalRatingResult = SeasonalRatingEntry[];

export type SetLateRegistrationClosedResult =
  | { ok: true; tournament: TournamentApiSummary }
  | { ok: false; error: "not_found" | "failed" };

export type SetMonthFinalResult =
  | { ok: true; tournament: TournamentApiSummary; droppedCount: number }
  | { ok: false; error: "not_found" | "failed" };

/** The reason stamped on a self-registration cleared by a month-final flip. */
export const MONTH_FINAL_DROP_REASON = "снят: турнир стал финалом месяца";

/**
 * Which roster entries a month-final flip should clear: only self-registrations
 * (status Registered) when the flag goes on; nothing when it goes off. Origin
 * (self vs admin-added) is not tracked yet — admin-added rosters land later, so
 * for now every Registered entry is a self-registration.
 */
export function planMonthFinalFlip(
  states: ReadonlyArray<{ playerId: string | number; status: string }>,
  monthFinal: boolean
): { toRemove: string[] } {
  if (!monthFinal) return { toRemove: [] };
  return {
    toRemove: states
      .filter((s) => s.status === InGamePlayerStatus.Registered)
      .map((s) => String(s.playerId)),
  };
}

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
    const ratingEnabled = input.ratingEnabled ?? true;
    const tournament = await tournamentRepository.create({
      name: input.name,
      date: input.date,
      ratingGuaranteeEnabled: input.ratingGuaranteeEnabled,
      ratingGuaranteeBonusPoints: input.ratingGuaranteeBonusPoints,
      ratingPointsCoefficient: input.ratingPointsCoefficient,
      ratingBountyCoefficient: input.ratingBountyCoefficient,
      ratingTableId: input.ratingTableId,
      ratingEnabled,
      ratingSeasonYear: ratingEnabled ? (input.ratingSeasonYear ?? null) : null,
      ratingSeasonMonth: ratingEnabled ? (input.ratingSeasonMonth ?? null) : null,
      monthFinal: input.monthFinal ?? false,
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
      ratingEnabled: tournament.ratingEnabled,
      ratingSeasonYear: tournament.ratingSeasonYear,
      ratingSeasonMonth: tournament.ratingSeasonMonth,
      lateRegistrationClosed: tournament.lateRegistrationClosed,
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
      ratingEnabled?: boolean;
      ratingSeasonYear?: number | null;
      ratingSeasonMonth?: number | null;
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

    const ratingEnabledInput = input.ratingEnabled ?? null;
    // Effective ratingEnabled after the update (use new value if provided, else keep current)
    const effectiveRatingEnabled = ratingEnabledInput !== null ? ratingEnabledInput : current.ratingEnabled;
    // Season fields: if disabling rating force null; if provided use them; else keep current
    const seasonProvided = input.ratingSeasonYear !== undefined || input.ratingSeasonMonth !== undefined;
    const newSeasonYear = !effectiveRatingEnabled
      ? null
      : seasonProvided
        ? (input.ratingSeasonYear ?? null)
        : current.ratingSeasonYear;
    const newSeasonMonth = !effectiveRatingEnabled
      ? null
      : seasonProvided
        ? (input.ratingSeasonMonth ?? null)
        : current.ratingSeasonMonth;

    const seasonChanged =
      newSeasonYear !== current.ratingSeasonYear || newSeasonMonth !== current.ratingSeasonMonth;

    let tournament = await tournamentRepository.update(id, {
      name: input.name,
      date: input.date,
      status: input.status,
      ratingGuaranteeEnabled: input.ratingGuaranteeEnabled ?? null,
      ratingGuaranteeBonusPoints: input.ratingGuaranteeBonusPoints ?? null,
      ratingPointsCoefficient: input.ratingPointsCoefficient ?? null,
      ratingBountyCoefficient: input.ratingBountyCoefficient ?? null,
      ratingTableId: input.ratingTableId ?? null,
      ratingEnabled: ratingEnabledInput,
    });
    if (!tournament) return { ok: false, error: "not_found" };

    // Sync season on tournament + facts in one transaction when season changes
    if (seasonChanged) {
      try {
        await withTransaction(async (c) => {
          const updated = await tournamentRepository.updateSeasonWithClient(
            c,
            id,
            newSeasonYear,
            newSeasonMonth
          );
          if (!updated) throw new Error("tournament_season_update_failed");
          tournament = updated;
          const factsOk = await playerTournamentRatingFactsRepository.updateSeasonForTournamentWithClient(
            c,
            id,
            newSeasonYear,
            newSeasonMonth
          );
          if (!factsOk) throw new Error("facts_season_update_failed");
        });
      } catch {
        return { ok: false, error: "failed" };
      }
    }

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

  async getSeasonalRating(year: number, month: number): Promise<GetSeasonalRatingResult> {
    return playerTournamentRatingFactsRepository.getSeasonalRating(year, month);
  }

  async setLateRegistrationClosed(
    tournamentId: number,
    closed: boolean
  ): Promise<SetLateRegistrationClosedResult> {
    const row = await tournamentRepository.updateLateRegistrationClosed(tournamentId, closed);
    if (!row) return { ok: false, error: "not_found" };
    return { ok: true, tournament: tournamentRowToApi(row) };
  }

  /**
   * Set the month-final flag. When turning it on, clear the self-registered
   * roster and leave each dropped player a pull-based drop reason (they read it
   * on next open — no push). Admin-added / in-game entries are left in place.
   */
  async setMonthFinal(
    tournamentId: number,
    monthFinal: boolean
  ): Promise<SetMonthFinalResult> {
    const row = await tournamentRepository.updateMonthFinal(tournamentId, monthFinal);
    if (!row) return { ok: false, error: "not_found" };

    let droppedCount = 0;
    if (monthFinal && this.inGameUserStateService) {
      const states = await this.inGameUserStateService.getAllByTournament(String(tournamentId));
      const { toRemove } = planMonthFinalFlip(states, monthFinal);
      for (const playerId of toRemove) {
        const removed = await this.inGameUserStateService.removePlayerFromTournament(
          playerId,
          String(tournamentId)
        );
        if (removed) {
          await tournamentRepository.addDropNotice(tournamentId, playerId, MONTH_FINAL_DROP_REASON);
          droppedCount++;
        }
      }
    }
    return { ok: true, tournament: tournamentRowToApi(row), droppedCount };
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
