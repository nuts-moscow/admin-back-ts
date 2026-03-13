import { BountyKillsCache, InGameUserStateCache } from "../../cache";
import { logger } from "../../logger";
import {
  EntryPaymentMethod,
  InGamePlayerStatus,
  type BountyEliminationTypeValue,
  type InGameUserState,
  type PlayerId,
  type TableId,
  type TournamentId,
} from "../../domain/cache/InGameUserState";

function paidReentryCount(
  pairs: [EntryPaymentMethod, number][] | null
): number {
  if (!pairs || pairs.length === 0) return 0;
  let sum = 0;
  for (const [method, count] of pairs) {
    if (
      method === EntryPaymentMethod.Cache ||
      method === EntryPaymentMethod.CreditCard
    ) {
      sum += count;
    }
  }
  return sum;
}

export class InGameUserStateService {
  async getUser(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.get(playerId, tournamentId);
  }

  async updateBountyCount(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bountyCountToAdd: number
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.updateBountyCount(
      playerId,
      tournamentId,
      bountyCountToAdd
    );
  }

  async getAllByTournament(tournamentId: TournamentId): Promise<InGameUserState[]> {
    return InGameUserStateCache.getAllByTournament(tournamentId);
  }

  /** Returns count of players at table (excluding playerId if they're moving to another table) */
  async getPlayerCountAtTable(
    tournamentId: TournamentId,
    tableId: TableId,
    excludePlayerId?: PlayerId
  ): Promise<number> {
    const states = await InGameUserStateCache.getAllByTournament(tournamentId);
    return states.filter(
      (s) => s.tableId === tableId && s.playerId !== excludePlayerId
    ).length;
  }

  async getTotalRebuyCount(tournamentId: TournamentId): Promise<number> {
    const states = await InGameUserStateCache.getAllByTournament(tournamentId);
    const rebuyCount = states.reduce((sum, s) => sum + s.totalReentryCount, 0);
    logger.info({ tournamentId, rebuyCount }, "[InGameUserStateService] getTotalRebuyCount result");
    return rebuyCount;
  }

  async addPlayerToTournament(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<boolean> {
    return InGameUserStateCache.addPlayerToTournament(playerId, tournamentId);
  }

  async removePlayerFromTournament(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<boolean> {
    return InGameUserStateCache.removePlayerFromTournament(playerId, tournamentId);
  }

  async addReentryCount(
    playerId: PlayerId,
    tournamentId: TournamentId,
    count: number
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.addReentryCount(playerId, tournamentId, count);
  }

  async updateStatus(
    playerId: PlayerId,
    tournamentId: TournamentId,
    status: InGamePlayerStatus
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.updateStatus(playerId, tournamentId, status);
  }

  async updateEntryPaymentMethod(
    playerId: PlayerId,
    tournamentId: TournamentId,
    entryPaymentMethod: EntryPaymentMethod
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.updateEntryPaymentMethod(
      playerId,
      tournamentId,
      entryPaymentMethod
    );
  }

  async addReentryPayment(
    playerId: PlayerId,
    tournamentId: TournamentId,
    payments: EntryPaymentMethod[]
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.addReentryPayment(
      playerId,
      tournamentId,
      payments
    );
  }

  async updateTableId(
    playerId: PlayerId,
    tournamentId: TournamentId,
    tableId: TableId | null
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.updateTableId(playerId, tournamentId, tableId);
  }

  /**
   * Records a bounty elimination: who eliminated whom and type (Rebuy/Out).
   * 1. If type=Rebuy: increments reentry count for eliminated player
   * 2. If type=Out: sets eliminated player status to Out or OutNotPaid (if unpaid reentries)
   * 3. Increments bounty count for killer
   * 4. Stores kill record in Redis (killer -> eliminated)
   */
  async recordBountyElimination(
    tournamentId: TournamentId,
    eliminatedPlayerId: PlayerId,
    killerPlayerId: PlayerId,
    type: BountyEliminationTypeValue
  ): Promise<{ ok: boolean; error?: string }> {
    if (type === "Rebuy") {
      const reentryState = await InGameUserStateCache.addReentryCount(
        eliminatedPlayerId,
        tournamentId,
        1
      );
      if (!reentryState) {
        return { ok: false, error: "Eliminated player not found in tournament" };
      }
    } else {
      // type === "Out": set status to Out or OutNotPaid
      const eliminatedState = await InGameUserStateCache.get(
        eliminatedPlayerId,
        tournamentId
      );
      if (!eliminatedState) {
        return { ok: false, error: "Eliminated player not found in tournament" };
      }
      const paid = paidReentryCount(eliminatedState.reentryByPaymentMethod);
      const unpaidReentryCount = Math.max(
        0,
        eliminatedState.totalReentryCount - paid
      );
      const newStatus: InGamePlayerStatus =
        unpaidReentryCount > 0
          ? InGamePlayerStatus.OutNotPaid
          : InGamePlayerStatus.Out;
      const statusState = await InGameUserStateCache.updateStatus(
        eliminatedPlayerId,
        tournamentId,
        newStatus
      );
      if (!statusState) {
        return { ok: false, error: "Failed to update eliminated player status" };
      }
    }

    const bountyState = await InGameUserStateCache.updateBountyCount(
      killerPlayerId,
      tournamentId,
      1
    );
    if (!bountyState) {
      return { ok: false, error: "Killer player not found in tournament" };
    }

    const killStored = await BountyKillsCache.addKill(
      tournamentId,
      killerPlayerId,
      eliminatedPlayerId
    );
    if (!killStored) {
      logger.info(
        { tournamentId, killerPlayerId, eliminatedPlayerId },
        "[InGameUserStateService] recordBountyElimination: kill record failed to store"
      );
      // Bounty and reentry were updated; kill record failed - partial success
    }

    return { ok: true };
  }
}
