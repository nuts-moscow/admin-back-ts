import { BountyKillsCache, InGameUserStateCache } from "../../cache";
import {
  playerRepository,
  tournamentCashSnapshotRepository,
  tournamentRepository,
  tournamentResultRepository,
} from "../../postgres";
import { logger } from "../../logger";
import {
  EntryPaymentMethod,
  InGamePlayerStatus,
  type BountyEliminationTypeValue,
  type InGameUserState,
  type PlayerId,
  type ReentryByPaymentMethod,
  type TableId,
  type TournamentId,
} from "../../domain/cache/InGameUserState";

function countFreeInReentryByPaymentMethod(
  pairs: ReentryByPaymentMethod | null
): number {
  if (!pairs) return 0;
  let n = 0;
  for (const [method, count] of pairs) {
    if (method === EntryPaymentMethod.Free) n += count;
  }
  return n;
}

function parseJsonStringArray(json: string | null): string[] | null {
  if (json == null || json === "") return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

export interface CashDeskLine {
  quantity: number;
  amount: number;
}

export interface CashDeskCategory {
  total: CashDeskLine;
  entries: CashDeskLine;
  rebuys: CashDeskLine;
}

export interface CashDeskResponse {
  cash: CashDeskCategory;
  card: CashDeskCategory;
  free: CashDeskCategory;
  grandTotal: CashDeskCategory;
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

  async getCashDesk(tournamentId: TournamentId): Promise<CashDeskResponse | null> {
    const tournament = await tournamentRepository.findById(parseInt(tournamentId, 10));
    if (!tournament) return null;

    if (tournament.status === "completed") {
      const snapshot = await tournamentCashSnapshotRepository.findByTournamentId(
        parseInt(tournamentId, 10)
      );
      if (snapshot) return snapshot as unknown as CashDeskResponse;
      return null;
    }

    const states = await InGameUserStateCache.getAllByTournament(tournamentId);
    const entryPrice = tournament.entryPrice;
    const reentryPrice = tournament.reentryPrice;

    const emptyLine = (): CashDeskLine => ({ quantity: 0, amount: 0 });
    const emptyCategory = (): CashDeskCategory => ({
      total: emptyLine(),
      entries: emptyLine(),
      rebuys: emptyLine(),
    });

    const cash = emptyCategory();
    const card = emptyCategory();
    const free = emptyCategory();

    for (const state of states) {
      if (state.entryPaymentMethod) {
        const method = state.entryPaymentMethod;
        const amount = method === EntryPaymentMethod.Free ? 0 : entryPrice;
        if (method === EntryPaymentMethod.Cache) {
          cash.entries.quantity += 1;
          cash.entries.amount += amount;
        } else if (method === EntryPaymentMethod.CreditCard) {
          card.entries.quantity += 1;
          card.entries.amount += amount;
        } else {
          free.entries.quantity += 1;
          free.entries.amount += 0;
        }
      }

      const reentryPairs = state.reentryByPaymentMethod as ReentryByPaymentMethod | null;
      if (reentryPairs) {
        for (const [method, count] of reentryPairs) {
          const amount = method === EntryPaymentMethod.Free ? 0 : count * reentryPrice;
          if (method === EntryPaymentMethod.Cache) {
            cash.rebuys.quantity += count;
            cash.rebuys.amount += amount;
          } else if (method === EntryPaymentMethod.CreditCard) {
            card.rebuys.quantity += count;
            card.rebuys.amount += amount;
          } else {
            free.rebuys.quantity += count;
            free.rebuys.amount += 0;
          }
        }
      }
    }

    for (const cat of [cash, card, free]) {
      cat.total.quantity = cat.entries.quantity + cat.rebuys.quantity;
      cat.total.amount = cat.entries.amount + cat.rebuys.amount;
    }

    const grandTotal: CashDeskCategory = {
      total: { quantity: 0, amount: 0 },
      entries: { quantity: 0, amount: 0 },
      rebuys: { quantity: 0, amount: 0 },
    };
    for (const cat of [cash, card, free]) {
      grandTotal.entries.quantity += cat.entries.quantity;
      grandTotal.entries.amount += cat.entries.amount;
      grandTotal.rebuys.quantity += cat.rebuys.quantity;
      grandTotal.rebuys.amount += cat.rebuys.amount;
    }
    grandTotal.total.quantity = grandTotal.entries.quantity + grandTotal.rebuys.quantity;
    grandTotal.total.amount = grandTotal.entries.amount + grandTotal.rebuys.amount;

    return { cash, card, free, grandTotal };
  }

  /**
   * Returns list of players for a completed tournament from tournament_result_players.
   * Same response shape as GET /api/tournaments/:tournamentId/players (cache path).
   * Returns null if tournament is not completed or not found.
   */
  async getTournamentResultPlayers(
    tournamentId: TournamentId
  ): Promise<
    Array<{
      tournamentPlayerId: number;
      playerId: string;
      status: string;
      tableId: string | null;
      bountyCount: number;
      entryPaymentMethod: string | null;
      reentryByPaymentMethod: string[] | null;
      totalReentryCount: number;
      freeEntryCount: number;
      freeReentryCount: number;
      tournamentFreeEntryCount: number;
      tournamentFreeReentryCount: number;
      placement: number | null;
      bonuses: string[] | null;
      playerName: string | null;
      unpaidReentryCount: number;
      signAgreement: boolean;
      bountyKills: string[];
      eliminatedBy: string[];
    }> | null
  > {
    const id = parseInt(tournamentId, 10);
    if (Number.isNaN(id)) return null;
    const tournament = await tournamentRepository.findById(id);
    if (!tournament || tournament.status !== "completed") return null;

    const rows = await tournamentResultRepository.findByTournamentId(id);
    const N = rows.length;
    // Reverse placement when reading: DB has 1=winner, 2=second... → API returns 1=first out, N=winner
    const result = await Promise.all(
      rows.map(async (row) => {
        const player = await playerRepository.findById(row.playerId);
        const bountyKills = parseJsonStringArray(row.bountyKills);
        const eliminatedBy = parseJsonStringArray(row.eliminatedBy);
        const reentryByPaymentMethod = parseJsonStringArray(row.reentryByPaymentMethod);
        const bonuses = parseJsonStringArray(row.bonuses);
        const paidReentry = reentryByPaymentMethod
          ? reentryByPaymentMethod.filter(
              (m) => m === EntryPaymentMethod.Cache || m === EntryPaymentMethod.CreditCard
            ).length
          : 0;
        const unpaidReentryCount = Math.max(
          0,
          row.totalReentryCount - paidReentry
        );
        const placement =
          row.placement != null ? N - row.placement + 1 : null;
        return {
          tournamentPlayerId: row.tournamentPlayerId,
          playerId: row.playerId,
          status: row.status,
          tableId: null,
          bountyCount: row.bountyCount,
          entryPaymentMethod: row.entryPaymentMethod,
          reentryByPaymentMethod,
          totalReentryCount: row.totalReentryCount,
          freeEntryCount: 0,
          freeReentryCount: 0,
          tournamentFreeEntryCount: 0,
          tournamentFreeReentryCount: 0,
          placement,
          bonuses,
          playerName: player?.nickname ?? null,
          unpaidReentryCount,
          signAgreement: player?.signAgreement ?? false,
          bountyKills: bountyKills ?? [],
          eliminatedBy: eliminatedBy ?? [],
        };
      })
    );
    return result;
  }

  async addPlayerToTournament(
    playerId: PlayerId,
    tournamentId: TournamentId,
    earlyBirdFlag: boolean
  ): Promise<boolean> {
    const player = await playerRepository.findById(playerId);
    if (!player) return false;
    const freeEntryCount = player.freeEntryCount ?? 0;
    const freeReentryCount = player.freeReentryCount ?? 0;
    return InGameUserStateCache.addPlayerToTournament(
      playerId,
      tournamentId,
      earlyBirdFlag,
      freeEntryCount,
      freeReentryCount
    );
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
    entryPaymentMethod: EntryPaymentMethod | null
  ): Promise<
    InGameUserState | null | { error: "insufficient_free_entries" }
  > {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) return null;
    const previousFree = state.entryPaymentMethod === EntryPaymentMethod.Free;

    if (entryPaymentMethod === EntryPaymentMethod.Free) {
      const available =
        state.freeEntryCount + (state.tournamentFreeEntryCount ?? 0);
      if (available < 1) return { error: "insufficient_free_entries" };
      await InGameUserStateCache.updateEntryPaymentMethod(
        playerId,
        tournamentId,
        EntryPaymentMethod.Free
      );
      const after = await InGameUserStateCache.deductOneFreeEntry(
        playerId,
        tournamentId
      );
      return after;
    }

    if (previousFree) {
      await InGameUserStateCache.updateEntryPaymentMethod(
        playerId,
        tournamentId,
        entryPaymentMethod
      );
      const after = await InGameUserStateCache.addBackOneFreeEntry(
        playerId,
        tournamentId
      );
      return after;
    }

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
    const afterPayment = await this.updateEntryPaymentMethod(
      playerId,
      tournamentId,
      null
    );
    if (!afterPayment || (typeof afterPayment === "object" && "error" in afterPayment)) return null;
    return InGameUserStateCache.updateTableId(playerId, tournamentId, null);
  }

  /**
   * In-game payment: updates entry payment method.
   * If InGameNotPaid: also transitions to InGamePaid.
   * If Out (e.g. eliminated but never paid): only updates entry payment method, status stays Out.
   */
  async inGamePayment(
    tournamentId: TournamentId,
    playerId: PlayerId,
    entryPaymentMethod: EntryPaymentMethod
  ): Promise<
    | { state: InGameUserState }
    | { error: "not_found" | "invalid_status" | "insufficient_free_entries" }
  > {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) return { error: "not_found" };
    const allowedForPayment = new Set<InGamePlayerStatus>([
      InGamePlayerStatus.InGameNotPaid,
      InGamePlayerStatus.Out,
    ]);
    if (!allowedForPayment.has(state.status)) {
      return { error: "invalid_status" };
    }
    const afterPayment = await this.updateEntryPaymentMethod(
      playerId,
      tournamentId,
      entryPaymentMethod
    );
    if (afterPayment && "error" in afterPayment) {
      return { error: "insufficient_free_entries" };
    }
    if (!afterPayment) return { error: "not_found" };
    if (state.status === InGamePlayerStatus.InGameNotPaid) {
      const finalState = await InGameUserStateCache.updateStatus(
        playerId,
        tournamentId,
        InGamePlayerStatus.InGamePaid
      );
      return finalState ? { state: finalState } : { error: "not_found" };
    }
    return { state: afterPayment };
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
  ): Promise<
    InGameUserState | null | { error: "insufficient_free_reentries" }
  > {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) return null;
    const currentFree = countFreeInReentryByPaymentMethod(
      state.reentryByPaymentMethod
    );
    const newFree = payments.filter((p) => p === EntryPaymentMethod.Free).length;
    const available =
      state.freeReentryCount + (state.tournamentFreeReentryCount ?? 0);
    if (currentFree + newFree > available) {
      return { error: "insufficient_free_reentries" };
    }
    return InGameUserStateCache.addReentryPayment(
      playerId,
      tournamentId,
      payments
    );
  }

  async setReentryPaymentMethods(
    playerId: PlayerId,
    tournamentId: TournamentId,
    payments: EntryPaymentMethod[]
  ): Promise<
    InGameUserState | null | { error: "insufficient_free_reentries" | "invalid_length" }
  > {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) return null;
    if (payments.length !== state.totalReentryCount) {
      return { error: "invalid_length" };
    }
    const freeCount = payments.filter((p) => p === EntryPaymentMethod.Free).length;
    const available =
      state.freeReentryCount + (state.tournamentFreeReentryCount ?? 0);
    if (freeCount > available) {
      return { error: "insufficient_free_reentries" };
    }
    return InGameUserStateCache.setReentryPaymentMethods(
      playerId,
      tournamentId,
      payments
    );
  }

  /** Applies delta to tournament-only free entry count (state only). Returns updated state or null. */
  async addTournamentFreeEntries(
    playerId: PlayerId,
    tournamentId: TournamentId,
    delta: number
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.addTournamentFreeEntries(playerId, tournamentId, delta);
  }

  /** Applies delta to tournament-only free reentry count (state only). Returns updated state or null. */
  async addTournamentFreeReentries(
    playerId: PlayerId,
    tournamentId: TournamentId,
    delta: number
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.addTournamentFreeReentries(playerId, tournamentId, delta);
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
   * 3. If !burnedStack && killerPlayerId: increments bounty count for killer, stores kill record
   */
  async recordBountyElimination(
    tournamentId: TournamentId,
    eliminatedPlayerId: PlayerId,
    killerPlayerId: PlayerId | undefined,
    type: BountyEliminationTypeValue,
    burnedStack: boolean
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
      // type === "Out": set status to Out and placement (elimination order)
      const eliminatedState = await InGameUserStateCache.get(
        eliminatedPlayerId,
        tournamentId
      );
      if (!eliminatedState) {
        return { ok: false, error: "Eliminated player not found in tournament" };
      }
      const allStates = await InGameUserStateCache.getAllByTournament(tournamentId);
      const outCount = allStates.filter((s) => s.status === InGamePlayerStatus.Out).length;
      const nextPlacement = outCount + 1;
      const statusState = await InGameUserStateCache.updateStatusAndPlacement(
        eliminatedPlayerId,
        tournamentId,
        InGamePlayerStatus.Out,
        nextPlacement
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

    if (!burnedStack && killerPlayerId) {
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
    }

    return { ok: true };
  }
}
