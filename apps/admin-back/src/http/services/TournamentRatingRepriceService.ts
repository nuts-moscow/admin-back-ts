import { InGameUserStateCache } from "../../cache";
import { InGamePlayerStatus } from "../../domain/cache/InGameUserState";
import {
  normalizeTournamentRatingBreakdown,
  ratingWithManualAdjustment,
} from "../../domain/TournamentRatingBreakdown";
import { logger } from "../../logger";
import {
  playerTournamentRatingFactsRepository,
  ratingTableRepository,
  tournamentRepository,
  tournamentResultRepository,
  withTransaction,
} from "../../postgres";
import type { PlayerTournamentRatingFactInsert } from "../../postgres/PlayerTournamentRatingFactsRepository";
import {
  applyNonPlacementAccrued,
  computeTournamentPlayerRating,
  matrixFinishPlaceFromEliminationSlot,
} from "./tournamentRatingCompute";

/**
 * Reprices a tournament's rating after its rating settings changed, so stored
 * numbers always reflect the settings the admin sees.
 *
 * - completed: rebuilds rating facts and results' rating_persisted from the
 *   durable result rows (placement/bounty/manual adjustment survive; the
 *   non-placement accrual is carried over from the old breakdown).
 * - in_progress: re-freezes the rating snapshots of already-eliminated
 *   players (they were priced with the settings as of their bust-out).
 */
export async function repriceTournamentRating(
  tournamentId: number
): Promise<{ ok: boolean; error?: string; repriced: number }> {
  const tournament = await tournamentRepository.findById(tournamentId);
  if (!tournament) return { ok: false, error: "tournament_not_found", repriced: 0 };
  if (!tournament.ratingEnabled) return { ok: true, repriced: 0 };
  const ratingTable = await ratingTableRepository.findById(tournament.ratingTableId);
  if (!ratingTable) return { ok: false, error: "rating_table_not_found", repriced: 0 };

  if (tournament.status === "completed") {
    const rows = await tournamentResultRepository.findByTournamentId(tournamentId);
    if (rows.length === 0) return { ok: true, repriced: 0 };
    const nRating = rows.filter((r) => r.status !== InGamePlayerStatus.Registered).length;

    const factRows: PlayerTournamentRatingFactInsert[] = [];
    const persistedByPlayer = new Map<string, ReturnType<typeof applyNonPlacementAccrued>>();
    for (const row of rows) {
      // Mirrors completion: raw elimination slot for Out players, the full
      // rated field for the winner/still-standing, none for no-shows.
      const elimPlForRating =
        row.status === InGamePlayerStatus.Registered
          ? null
          : row.status === InGamePlayerStatus.Out
            ? row.placement
            : nRating >= 1
              ? nRating
              : null;
      const finishPlace = matrixFinishPlaceFromEliminationSlot(nRating, elimPlForRating);
      const oldAccrued =
        row.ratingPersisted != null
          ? normalizeTournamentRatingBreakdown(row.ratingPersisted).nonPlacementAccrued
          : 0;
      // rating_persisted keeps manualAdjustment=0 by contract; the manual
      // correction lives in its own column and rides on top for facts.
      const persisted = applyNonPlacementAccrued(
        computeTournamentPlayerRating(
          nRating,
          finishPlace,
          row.bountyCount,
          0,
          tournament,
          ratingTable
        ),
        oldAccrued
      );
      persistedByPlayer.set(row.playerId, persisted);
      factRows.push({
        playerId: row.playerId,
        tournamentPlayerId: row.tournamentPlayerId,
        tournamentDateMs: tournament.date,
        ratingTableId: tournament.ratingTableId,
        ratingFieldSize: nRating,
        playerStatus: row.status,
        placement: row.placement,
        breakdown: ratingWithManualAdjustment(persisted, row.ratingManualAdjustment),
        ratingSeasonYear: tournament.ratingSeasonYear,
        ratingSeasonMonth: tournament.ratingSeasonMonth,
      });
    }

    try {
      await withTransaction(async (c) => {
        const ok = await playerTournamentRatingFactsRepository.replaceForTournamentWithClient(
          c,
          tournamentId,
          factRows
        );
        if (!ok) throw new Error("facts_replace_failed");
        for (const row of rows) {
          const persisted = persistedByPlayer.get(row.playerId);
          if (!persisted) continue;
          const updated = await tournamentResultRepository.updateRatingPersistedWithClient(
            c,
            tournamentId,
            row.playerId,
            persisted
          );
          if (!updated) throw new Error("result_reprice_failed");
        }
      });
    } catch (err) {
      logger.info({ err, tournamentId }, "[TournamentRatingReprice] completed reprice failed");
      return { ok: false, error: "reprice_failed", repriced: 0 };
    }
    return { ok: true, repriced: rows.length };
  }

  // Live tournament: re-freeze snapshots of players already eliminated.
  const states = await InGameUserStateCache.getAllByTournament(String(tournamentId));
  const nRating = states.filter((s) => s.status !== InGamePlayerStatus.Registered).length;
  let repriced = 0;
  for (const state of states) {
    if (state.status !== InGamePlayerStatus.Out || state.ratingSnapshot == null) continue;
    const finishPlace = matrixFinishPlaceFromEliminationSlot(nRating, state.placement);
    if (finishPlace == null) continue;
    const breakdown = applyNonPlacementAccrued(
      computeTournamentPlayerRating(
        nRating,
        finishPlace,
        state.bountyCount,
        0,
        tournament,
        ratingTable
      ),
      state.ratingNonPlacementAccrued ?? 0
    );
    await InGameUserStateCache.updateRatingSnapshot(
      state.playerId,
      String(tournamentId),
      breakdown
    );
    repriced += 1;
  }
  return { ok: true, repriced };
}
