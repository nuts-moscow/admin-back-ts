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

  async getKillsByKiller(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId
  ): Promise<PlayerId[]> {
    return BountyKillsCache.getKillsByKiller(tournamentId, killerPlayerId);
  }

  async getEliminatedBy(
    tournamentId: TournamentId,
    victimPlayerId: PlayerId
  ): Promise<PlayerId[]> {
    return BountyKillsCache.getEliminatedBy(tournamentId, victimPlayerId);
  }

  /**
   * Removes a bounty: undoes one elimination.
   * 1. Removes victim from killer's kill list
   * 2. Decreases killer's bountyCount by 1
   * 3. Decreases victim's totalReentryCount by 1
   */
  async removeBounty(
    tournamentId: TournamentId,
    killerPlayerId: PlayerId,
    victimPlayerId: PlayerId
  ): Promise<{ ok: boolean; error?: string }> {
    const killRemoved = await BountyKillsCache.removeKill(
      tournamentId,
      killerPlayerId,
      victimPlayerId
    );
    if (!killRemoved) {
      return { ok: false, error: "Kill record not found" };
    }
    await BountyKillsCache.removeEliminatedBy(
      tournamentId,
      victimPlayerId,
      killerPlayerId
    );
    const killerState = await InGameUserStateCache.updateBountyCount(
      killerPlayerId,
      tournamentId,
      -1
    );
    if (!killerState) {
      return { ok: false, error: "Killer player not found" };
    }
    const victimState = await InGameUserStateCache.addReentryCount(
      victimPlayerId,
      tournamentId,
      -1
    );
    if (!victimState) {
      return { ok: false, error: "Victim player not found" };
    }
    return { ok: true };
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

  /**
   * Rollback game start: reverts player to Registered, clears entry payment and table.
   */
  async rollbackGameStart(
    tournamentId: TournamentId,
    playerId: PlayerId
  ): Promise<InGameUserState | null> {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) return null;
    const afterStatus = await InGameUserStateCache.updateStatus(
      playerId,
      tournamentId,
      InGamePlayerStatus.Registered
    );
    if (!afterStatus) return null;
    const afterPayment = await InGameUserStateCache.updateEntryPaymentMethod(
      playerId,
      tournamentId,
      null
    );
    if (!afterPayment) return null;
    return InGameUserStateCache.updateTableId(playerId, tournamentId, null);
  }

  /**
   * In-game payment: updates entry payment method and transitions InGameNotPaid -> InGamePaid.
   */
  async inGamePayment(
    tournamentId: TournamentId,
    playerId: PlayerId,
    entryPaymentMethod: EntryPaymentMethod
  ): Promise<
    { state: InGameUserState } | { error: "not_found" | "invalid_status" }
  > {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) return { error: "not_found" };
    if (state.status !== InGamePlayerStatus.InGameNotPaid) {
      return { error: "invalid_status" };
    }
    const afterPayment = await InGameUserStateCache.updateEntryPaymentMethod(
      playerId,
      tournamentId,
      entryPaymentMethod
    );
    if (!afterPayment) return { error: "not_found" };
    const finalState = await InGameUserStateCache.updateStatus(
      playerId,
      tournamentId,
      InGamePlayerStatus.InGamePaid
    );
    return finalState ? { state: finalState } : { error: "not_found" };
  }

  /**
   * Player game start: transitions from Registered to InGamePaid or InGameNotPaid.
   * Updates entry payment method if provided. Updates table if tableId provided.
   * @param entryPaymentMethod - If provided: update it and set status InGamePaid. If not: set status InGameNotPaid.
   * @param tableId - If provided: assign player to this table.
   */
  async playerGameStart(
    tournamentId: TournamentId,
    playerId: PlayerId,
    entryPaymentMethod?: EntryPaymentMethod,
    tableId?: TableId | null
  ): Promise<
    { state: InGameUserState } | { error: "not_found" | "invalid_status" }
  > {
    logger.info(
      { tournamentId, playerId, entryPaymentMethod, tableId },
      "[InGameUserStateService] playerGameStart entry"
    );
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) {
      logger.info({ tournamentId, playerId }, "[InGameUserStateService] playerGameStart result: not_found");
      return { error: "not_found" };
    }
    if (state.status !== InGamePlayerStatus.Registered) {
      logger.info(
        { tournamentId, playerId, currentStatus: state.status },
        "[InGameUserStateService] playerGameStart result: invalid_status"
      );
      return { error: "invalid_status" };
    }
    const newStatus =
      entryPaymentMethod != null
        ? InGamePlayerStatus.InGamePaid
        : InGamePlayerStatus.InGameNotPaid;
    let currentState: InGameUserState | null;
    if (entryPaymentMethod != null) {
      const afterPayment = await InGameUserStateCache.updateEntryPaymentMethod(
        playerId,
        tournamentId,
        entryPaymentMethod
      );
      if (!afterPayment) {
        logger.info({ tournamentId, playerId }, "[InGameUserStateService] playerGameStart result: not_found after payment update");
        return { error: "not_found" };
      }
      currentState = await InGameUserStateCache.updateStatus(
        playerId,
        tournamentId,
        newStatus
      );
    } else {
      currentState = await InGameUserStateCache.updateStatus(
        playerId,
        tournamentId,
        newStatus
      );
    }
    if (!currentState) {
      logger.info({ tournamentId, playerId }, "[InGameUserStateService] playerGameStart result: not_found");
      return { error: "not_found" };
    }
    if (tableId != null && tableId !== "") {
      const tableState = await InGameUserStateCache.updateTableId(
        playerId,
        tournamentId,
        tableId
      );
      if (!tableState) {
        logger.info({ tournamentId, playerId }, "[InGameUserStateService] playerGameStart result: not_found after table update");
        return { error: "not_found" };
      }
      logger.info(
        { tournamentId, playerId, status: tableState.status, tableId: tableState.tableId },
        "[InGameUserStateService] playerGameStart result"
      );
      return { state: tableState };
    }
    logger.info(
      { tournamentId, playerId, status: currentState.status },
      "[InGameUserStateService] playerGameStart result"
    );
    return { state: currentState };
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
   * 2. If type=Out: sets eliminated player status to Out
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
      // type === "Out": set status to Out
      const eliminatedState = await InGameUserStateCache.get(
        eliminatedPlayerId,
        tournamentId
      );
      if (!eliminatedState) {
        return { ok: false, error: "Eliminated player not found in tournament" };
      }
      const statusState = await InGameUserStateCache.updateStatus(
        eliminatedPlayerId,
        tournamentId,
        InGamePlayerStatus.Out
      );
      if (!statusState) {
        return { ok: false, error: "Failed to update eliminated player status" };
      }
      await InGameUserStateCache.updateTableId(
        eliminatedPlayerId,
        tournamentId,
        null
      );
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
    }
    await BountyKillsCache.addEliminatedBy(
      tournamentId,
      eliminatedPlayerId,
      killerPlayerId
    );

    return { ok: true };
  }
}
