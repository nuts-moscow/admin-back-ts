import { BountyKillsCache, InGameUserStateCache } from "../../cache";
import { logger } from "../../logger";
import type {
  BountyEliminationTypeValue,
  EntryPaymentMethod,
  InGameUserState,
  InGamePlayerStatus,
  PlayerId,
  TableId,
  TournamentId,
} from "../../domain/cache/InGameUserState";

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
   * 2. Increments bounty count for killer
   * 3. Stores kill record in Redis (killer -> eliminated)
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
