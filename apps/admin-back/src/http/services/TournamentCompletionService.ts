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
  playerTournamentRatingFactsRepository,
  ratingTableRepository,
  tournamentCashSnapshotRepository,
  tournamentEliminationSnapshotRepository,
  tournamentResultRepository,
  tournamentRepository,
  withTransaction,
} from "../../postgres";
import type { PlayerTournamentRatingFactInsert } from "../../postgres/PlayerTournamentRatingFactsRepository";
import { TournamentAuditEventType } from "../../domain/TournamentAuditEventType";
import type { CashDeskResponse } from "./InGameUserStateService";
import type { TournamentResultPlayerRow } from "../../postgres/TournamentResultRepository";
import { writeTournamentAuditLog } from "./tournamentAuditLog";
import {
  applyNonPlacementAccrued,
  computeTournamentPlayerRating,
  matrixFinishPlaceFromEliminationSlot,
  ratingParticipantCount,
} from "./tournamentRatingCompute";
import { normalizeTournamentRatingBreakdown } from "../../domain/TournamentRatingBreakdown";

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

  const ratingTable = tournament.ratingEnabled
    ? await ratingTableRepository.findById(tournament.ratingTableId)
    : null;
  if (tournament.ratingEnabled && !ratingTable) {
    return { ok: false, error: "rating_table_not_found" };
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
    await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.TournamentCompleted, {
      playerCount: 0,
    });
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
    entryFreeOnly: structure?.entryFreeOnly ?? false,
  };
  const saved = await tournamentCashSnapshotRepository.save(
    tournamentId,
    cashDeskWithStack
  );
  if (!saved) {
    return { ok: false, error: "cash_snapshot_save_failed" };
  }

  // Step 2: Save results (with placement: 1 = first out, N = winner among full Redis roster)
  const N = states.length;
  const nRating = ratingParticipantCount(states);
  const resultRows: TournamentResultPlayerRow[] = [];
  const ratingFactRows: PlayerTournamentRatingFactInsert[] = [];

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

    let ratingPersisted: ReturnType<typeof applyNonPlacementAccrued>;

    if (tournament.ratingEnabled && ratingTable) {
      const elimPlForRating =
        state.status === InGamePlayerStatus.Registered
          ? null
          : state.status === InGamePlayerStatus.Out
            ? state.placement
            : nRating >= 1
              ? nRating
              : null;
      const finishPlaceForRating = matrixFinishPlaceFromEliminationSlot(
        nRating,
        elimPlForRating
      );
      const baseRating =
        state.status === InGamePlayerStatus.Out && state.ratingSnapshot != null
          ? normalizeTournamentRatingBreakdown(state.ratingSnapshot)
          : computeTournamentPlayerRating(
              nRating,
              finishPlaceForRating,
              state.bountyCount,
              0,
              tournament,
              ratingTable
            );
      ratingPersisted = applyNonPlacementAccrued(
        baseRating,
        state.ratingNonPlacementAccrued ?? 0
      );

      ratingFactRows.push({
        playerId: state.playerId,
        tournamentPlayerId: state.tournamentPlayerId,
        tournamentDateMs: tournament.date,
        ratingTableId: tournament.ratingTableId,
        ratingFieldSize: nRating,
        playerStatus: state.status,
        placement,
        breakdown: ratingPersisted,
        ratingSeasonYear: tournament.ratingSeasonYear,
        ratingSeasonMonth: tournament.ratingSeasonMonth,
      });
    } else {
      ratingPersisted = {
        basePoints: 0,
        guaranteeBonus: 0,
        pointsCoefficient: 1,
        fromTableAfterCoefficient: 0,
        bountyCount: 0,
        bountyPoints: 0,
        bountyCoefficient: 1,
        nonPlacementAccrued: 0,
        manualAdjustment: 0,
        totalPoints: 0,
      };
    }

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
      ratingManualAdjustment: 0,
      ratingPersisted,
    });
  }

  try {
    await withTransaction(async (c) => {
      const inserted = await tournamentResultRepository.insertResultsWithClient(
        c,
        tournamentId,
        resultRows
      );
      if (!inserted) {
        throw new Error("insert_results_failed");
      }
      if (tournament.ratingEnabled && ratingFactRows.length > 0) {
        const factsOk = await playerTournamentRatingFactsRepository.replaceForTournamentWithClient(
          c,
          tournamentId,
          ratingFactRows
        );
        if (!factsOk) {
          throw new Error("replace_rating_facts_failed");
        }
      }
    });
  } catch (err) {
    logger.info(
      { err, tournamentId },
      "[TournamentCompletion] results + rating facts transaction failed"
    );
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

  // Step 3: Update players' profile free counts — only what was consumed from permanent
  // buckets (profile). Tournament grants are spent in Redis first; DB still holds pre-tournament
  // profile values until we deduct the difference: dbCount - state.free*Count (capped by used Free lines).
  for (const state of states) {
    const player = await playerRepository.findById(state.playerId);
    if (!player) continue;

    const usedFreeEntry = state.entryPaymentMethod === "Free" ? 1 : 0;
    const usedFreeReentry = countFreeInReentry(state.reentryByPaymentMethod);

    if (usedFreeEntry > 0) {
      const consumedFromProfile = Math.min(
        usedFreeEntry,
        Math.max(0, player.freeEntryCount - state.freeEntryCount)
      );
      if (consumedFromProfile > 0) {
        await playerRepository.updateFreeEntryCountByDelta(
          state.playerId,
          -consumedFromProfile
        );
      }
    }

    if (usedFreeReentry > 0) {
      const consumedFromProfile = Math.min(
        usedFreeReentry,
        Math.max(0, player.freeReentryCount - state.freeReentryCount)
      );
      if (consumedFromProfile > 0) {
        await playerRepository.updateFreeReentryCountByDelta(
          state.playerId,
          -consumedFromProfile
        );
      }
    }
  }

  await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.TournamentCompleted, {
    playerCount: states.length,
  });

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
