import {
  BountyEliminationEventsCache,
  BountyKillsCache,
  InGameUserStateCache,
  tournamentStructureCache,
} from "../../cache";
import { DEFAULT_MAX_REENTRIES } from "../../domain/tournamentReentryPolicy";
import type { InGameUserState } from "../../domain/cache/InGameUserState";
import { InGamePlayerStatus } from "../../domain/cache/InGameUserState";
import { logger } from "../../logger";
import {
  playerRepository,
  tournamentCashSnapshotRepository,
  tournamentEliminationSnapshotRepository,
  tournamentResultRepository,
  tournamentRepository,
} from "../../postgres";
import type { CashDeskResponse } from "./InGameUserStateService";
import type { TournamentResultPlayerRow } from "../../postgres/TournamentResultRepository";

/**
 * Runs tournament completion: save cash snapshot, save results, update players' free counts, delete cache.
 * Call before updating tournament status to "completed".
 */
export async function runTournamentCompletion(
  tournamentId: number,
  inGameUserStateService: {
    getCashDesk(tournamentId: string): Promise<CashDeskResponse | null>;
    getAllByTournament(tournamentId: string): Promise<InGameUserState[]>;
    getKillsByKiller(tournamentId: string, killerPlayerId: string): Promise<string[]>;
    getEliminatedBy(tournamentId: string, victimPlayerId: string): Promise<string[]>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const tournamentIdStr = String(tournamentId);
  const tournament = await tournamentRepository.findById(tournamentId);
  if (!tournament) {
    return { ok: false, error: "tournament_not_found" };
  }

  const states = await InGameUserStateCache.getAllByTournament(tournamentIdStr);
  if (states.length === 0) {
    logger.info(
      { tournamentId },
      "[TournamentCompletion] No players in tournament, skipping snapshot"
    );
    await InGameUserStateCache.deleteAllForTournament(tournamentIdStr);
    await BountyKillsCache.deleteAllForTournament(tournamentIdStr);
    await BountyEliminationEventsCache.deleteAllForTournament(tournamentIdStr);
    await tournamentStructureCache.delete(tournamentIdStr);
    return { ok: true };
  }

  const eliminationEvents = await BountyEliminationEventsCache.listAll(
    tournamentIdStr
  );

  // Step 1: Save cash desk snapshot (merge stackSize from structure for later chip-pool API on completed tournaments)
  const cashDesk = await inGameUserStateService.getCashDesk(tournamentIdStr);
  if (!cashDesk) {
    return { ok: false, error: "cash_desk_compute_failed" };
  }
  const structure = await tournamentStructureCache.get(tournamentIdStr);
  const cashDeskWithStack: Record<string, unknown> = {
    ...(cashDesk as unknown as Record<string, unknown>),
    stackSize: structure?.stackSize ?? null,
    freezeOutEnabled: structure?.freezeOutEnabled ?? false,
    maxReentries: structure?.maxReentries ?? DEFAULT_MAX_REENTRIES,
  };
  const saved = await tournamentCashSnapshotRepository.save(
    tournamentId,
    cashDeskWithStack
  );
  if (!saved) {
    return { ok: false, error: "cash_snapshot_save_failed" };
  }

  // Step 2: Save results (with placement: 1 = winner, 2+ by elimination order)
  const N = states.length;
  const resultRows: TournamentResultPlayerRow[] = [];

  for (const state of states) {
    const [bountyKills, eliminatedBy] = await Promise.all([
      inGameUserStateService.getKillsByKiller(tournamentIdStr, state.playerId),
      inGameUserStateService.getEliminatedBy(tournamentIdStr, state.playerId),
    ]);

    // Placement: 1 = first out (worst), N = winner (best). Winner gets max, eliminated get elimination order.
    const placement =
      state.status !== InGamePlayerStatus.Out
        ? N
        : state.placement != null
          ? state.placement
          : null;

    resultRows.push({
      tournamentId,
      playerId: state.playerId,
      tournamentPlayerId: state.tournamentPlayerId,
      placement,
      status: state.status,
      entryPaymentMethod: state.entryPaymentMethod,
      entryPaidAmount: state.entryPaidAmount ?? null,
      reentryByPaymentMethod:
        state.reentryByPaymentMethod != null
          ? JSON.stringify(state.reentryByPaymentMethod)
          : null,
      reentryPaymentLines:
        state.reentryPaymentLines != null && state.reentryPaymentLines.length > 0
          ? JSON.stringify(state.reentryPaymentLines)
          : null,
      totalReentryCount: state.totalReentryCount,
      bountyCount: state.bountyCount,
      bonuses:
        state.bonuses != null ? JSON.stringify(state.bonuses) : null,
      customBonusChips:
        state.customBonusChips.length > 0
          ? JSON.stringify(state.customBonusChips)
          : null,
      bountyKills: JSON.stringify(bountyKills),
      eliminatedBy: JSON.stringify(eliminatedBy),
      burnedStackEvents:
        state.burnedStackEvents.length === 0
          ? "[]"
          : JSON.stringify(state.burnedStackEvents),
    });
  }

  const resultsSaved = await tournamentResultRepository.insertResults(
    tournamentId,
    resultRows
  );
  if (!resultsSaved) {
    return { ok: false, error: "results_save_failed" };
  }

  const eliminationSnapshotSaved =
    await tournamentEliminationSnapshotRepository.save(
      tournamentId,
      eliminationEvents
    );
  if (!eliminationSnapshotSaved) {
    return { ok: false, error: "elimination_snapshot_save_failed" };
  }

  // Step 3: Update players' free entry/reentry counts (deduct used)
  for (const state of states) {
    const usedFreeEntry =
      state.entryPaymentMethod === "Free" ? 1 : 0;
    const usedFreeReentry = countFreeInReentry(state.reentryByPaymentMethod);
    if (usedFreeEntry > 0) {
      await playerRepository.updateFreeEntryCountByDelta(
        state.playerId,
        -usedFreeEntry
      );
    }
    if (usedFreeReentry > 0) {
      await playerRepository.updateFreeReentryCountByDelta(
        state.playerId,
        -usedFreeReentry
      );
    }
  }

  // Step 4: Delete all cache for tournament
  await InGameUserStateCache.deleteAllForTournament(tournamentIdStr);
  await BountyKillsCache.deleteAllForTournament(tournamentIdStr);
  await BountyEliminationEventsCache.deleteAllForTournament(tournamentIdStr);
  await tournamentStructureCache.delete(tournamentIdStr);

  logger.info({ tournamentId, playerCount: states.length }, "[TournamentCompletion] done");
  return { ok: true };
}

function countFreeInReentry(
  pairs: InGameUserState["reentryByPaymentMethod"]
): number {
  if (!pairs || pairs.length === 0) return 0;
  let n = 0;
  for (const [method, count] of pairs) {
    if (method === "Free") n += count;
  }
  return n;
}
