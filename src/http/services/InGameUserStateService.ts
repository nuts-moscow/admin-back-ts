import {
  BountyEliminationEventsCache,
  type BountyEliminationEventRecord,
  BountyKillsCache,
  InGameUserStateCache,
  tournamentStructureCache,
} from "../../cache";
import {
  playerRepository,
  tournamentCashSnapshotRepository,
  tournamentRepository,
  tournamentResultRepository,
} from "../../postgres";
import { logger } from "../../logger";
import {
  aggregateCustomBonusChipsForBreakdown,
  breakdownFromMergedCounts,
  mergeBonusesIntoCounts,
  type BonusChipBreakdownLine,
  parseStoredBonusesJson,
  parseStoredCustomBonusChipsJson,
} from "../../domain/cache/inGameBonusChips";
import {
  EntryPaymentMethod,
  InGameBonus,
  InGamePlayerStatus,
  type BountyEliminationTypeValue,
  type BurnedStackEvent,
  type InGameUserState,
  type PlayerId,
  type ReentryByPaymentMethod,
  type TableId,
  type TournamentId,
  parseBurnedStackEventsFromJson,
  sumBurnedStackChips,
} from "../../domain/cache/InGameUserState";
import {
  flattenReentryPairsForApi,
  parseReentryByPaymentMethodStoredJson,
  recordedReentryCountFromPairs,
} from "../serializers/InGameUserStateSerializer";

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

export interface TournamentChipPoolSummary {
  playersArrived: number;
  playersActive: number;
  rebuyCount: number;
  /** totalChips ÷ playersActive when playersActive > 0 (игроки в игре: не Registered и не Out). */
  averageStack: number | null;
  stackSize: number;
  entryUnits: number;
  baseChips: number;
  bonuses: BonusChipBreakdownLine[];
  bonusChipsTotal: number;
  /** Sum of burnedStackChipsTotal across players (chips removed from play). */
  burnedStackChipsTotal: number;
  totalChips: number;
}

export type TournamentChipPoolSummaryError =
  | "tournament_not_found"
  | "structure_not_found"
  | "stack_size_unavailable";

export type TournamentChipPoolSummaryResult =
  | { ok: true; summary: TournamentChipPoolSummary }
  | { ok: false; error: TournamentChipPoolSummaryError };

export class InGameUserStateService {
  async getUser(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.get(playerId, tournamentId);
  }

  /** Adds one instance of the given bonus to the player's tournament state (counts stack). */
  async addBonusOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bonus: InGameBonus
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.addBonusOne(playerId, tournamentId, bonus);
  }

  /** Removes one instance of the given bonus (decrements count by 1). */
  async removeBonusOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    bonus: InGameBonus
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.removeBonusOne(playerId, tournamentId, bonus);
  }

  async addCustomBonusChips(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.addCustomBonusChips(
      playerId,
      tournamentId,
      chips
    );
  }

  async removeCustomBonusChipsOne(
    playerId: PlayerId,
    tournamentId: TournamentId,
    chips: number
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.removeCustomBonusChipsOne(
      playerId,
      tournamentId,
      chips
    );
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

  /** Pending bounty elimination records (Redis); sorted by eventId. */
  async getBountyEliminationEvents(
    tournamentId: TournamentId
  ): Promise<BountyEliminationEventRecord[]> {
    return BountyEliminationEventsCache.listAll(tournamentId);
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

  /**
   * Single payload: player counts, rebuy total, chip pool, averageStack = totalChips / playersActive.
   * Completed tournaments need stackSize stored on cash snapshot at completion.
   */
  async getTournamentChipPoolSummary(
    tournamentId: TournamentId
  ): Promise<TournamentChipPoolSummaryResult> {
    const id = parseInt(tournamentId, 10);
    if (Number.isNaN(id)) {
      return { ok: false, error: "tournament_not_found" };
    }

    const tournament = await tournamentRepository.findById(id);
    if (!tournament) {
      return { ok: false, error: "tournament_not_found" };
    }

    if (tournament.status === "completed") {
      const rows = await tournamentResultRepository.findByTournamentId(id);
      const snap = await tournamentCashSnapshotRepository.findByTournamentId(id);
      const rawStack = snap?.stackSize;
      const stackSize =
        typeof rawStack === "number" && !Number.isNaN(rawStack) ? rawStack : null;
      if (stackSize == null) {
        return { ok: false, error: "stack_size_unavailable" };
      }

      let playersArrived = 0;
      let playersActive = 0;
      let rebuyCount = 0;
      let burnedStackChipsTotal = 0;
      const bonusCounts = new Map<InGameBonus, number>();
      const customArrays: number[][] = [];

      for (const row of rows) {
        rebuyCount += row.totalReentryCount;
        burnedStackChipsTotal += sumBurnedStackChips(
          parseBurnedStackEventsFromJson(row.burnedStackEvents)
        );
        if (row.status !== InGamePlayerStatus.Registered) {
          playersArrived += 1;
        }
        if (
          row.status === InGamePlayerStatus.InGamePaid ||
          row.status === InGamePlayerStatus.InGameNotPaid
        ) {
          playersActive += 1;
        }
        if (row.status !== InGamePlayerStatus.Registered) {
          mergeBonusesIntoCounts(bonusCounts, parseStoredBonusesJson(row.bonuses));
          customArrays.push(
            parseStoredCustomBonusChipsJson(row.customBonusChips)
          );
        }
      }

      const entryUnits = playersArrived;
      const baseChips = (entryUnits + rebuyCount) * stackSize;
      const { lines: baseBonusLines, bonusChipsTotal: baseBonusTotal } =
        breakdownFromMergedCounts(bonusCounts);
      const { line: customLine, totalChips: customBonusTotal } =
        aggregateCustomBonusChipsForBreakdown(customArrays);
      const bonusChipsTotal = baseBonusTotal + customBonusTotal;
      const bonuses = [...baseBonusLines];
      if (customLine) bonuses.push(customLine);
      bonuses.sort((a, b) => a.bonus.localeCompare(b.bonus));
      const totalChips = Math.max(
        0,
        baseChips + bonusChipsTotal - burnedStackChipsTotal
      );
      const averageStack =
        playersActive === 0 ? null : totalChips / playersActive;

      return {
        ok: true,
        summary: {
          playersArrived,
          playersActive,
          rebuyCount,
          averageStack,
          stackSize,
          entryUnits,
          baseChips,
          bonuses,
          bonusChipsTotal,
          burnedStackChipsTotal,
          totalChips,
        },
      };
    }

    const structure = await tournamentStructureCache.get(tournamentId);
    if (!structure) {
      return { ok: false, error: "structure_not_found" };
    }

    const states = await InGameUserStateCache.getAllByTournament(tournamentId);
    let playersArrived = 0;
    let playersActive = 0;
    let rebuyCount = 0;
    let burnedStackChipsTotal = 0;
    const bonusCounts = new Map<InGameBonus, number>();
    const customArrays: number[][] = [];

    for (const state of states) {
      rebuyCount += state.totalReentryCount;
      burnedStackChipsTotal += sumBurnedStackChips(state.burnedStackEvents);
      if (state.status !== InGamePlayerStatus.Registered) {
        playersArrived += 1;
      }
      if (
        state.status === InGamePlayerStatus.InGamePaid ||
        state.status === InGamePlayerStatus.InGameNotPaid
      ) {
        playersActive += 1;
      }
      if (state.status !== InGamePlayerStatus.Registered) {
        mergeBonusesIntoCounts(bonusCounts, state.bonuses);
        customArrays.push([...state.customBonusChips]);
      }
    }

    const stackSize = structure.stackSize;
    const entryUnits = playersArrived;
    const baseChips = (entryUnits + rebuyCount) * stackSize;
    const { lines: baseBonusLines, bonusChipsTotal: baseBonusTotal } =
      breakdownFromMergedCounts(bonusCounts);
    const { line: customLine, totalChips: customBonusTotal } =
      aggregateCustomBonusChipsForBreakdown(customArrays);
    const bonusChipsTotal = baseBonusTotal + customBonusTotal;
    const bonuses = [...baseBonusLines];
    if (customLine) bonuses.push(customLine);
    bonuses.sort((a, b) => a.bonus.localeCompare(b.bonus));
    const totalChips = Math.max(
      0,
      baseChips + bonusChipsTotal - burnedStackChipsTotal
    );
    const averageStack =
      playersActive === 0 ? null : totalChips / playersActive;

    return {
      ok: true,
      summary: {
        playersArrived,
        playersActive,
        rebuyCount,
        averageStack,
        stackSize,
        entryUnits,
        baseChips,
        bonuses,
        bonusChipsTotal,
        burnedStackChipsTotal,
        totalChips,
      },
    };
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
      customBonusChips: number[];
      burnedStackEvents: BurnedStackEvent[];
      burnedStackChipsTotal: number;
      playerName: string | null;
      unpaidReentryCount: number;
      signAgreement: boolean;
      bountyKills: string[];
      eliminatedBy: string[];
      bountyEliminationEventIds: string[];
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
        const reentryPairs = parseReentryByPaymentMethodStoredJson(
          row.reentryByPaymentMethod
        );
        const reentryByPaymentMethod = flattenReentryPairsForApi(reentryPairs);
        const bonuses = parseJsonStringArray(row.bonuses);
        const customBonusChips = parseStoredCustomBonusChipsJson(
          row.customBonusChips
        );
        const recordedReentry = recordedReentryCountFromPairs(reentryPairs);
        const unpaidReentryCount = Math.max(
          0,
          row.totalReentryCount - recordedReentry
        );
        const placement =
          row.placement != null ? N - row.placement + 1 : null;
        const burnedStackEvents = parseBurnedStackEventsFromJson(
          row.burnedStackEvents
        );
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
          customBonusChips,
          burnedStackEvents,
          burnedStackChipsTotal: sumBurnedStackChips(burnedStackEvents),
          playerName: player?.nickname ?? null,
          unpaidReentryCount,
          signAgreement: player?.signAgreement ?? false,
          bountyKills: bountyKills ?? [],
          eliminatedBy: eliminatedBy ?? [],
          bountyEliminationEventIds: [],
        };
      })
    );
    return result;
  }

  async addPlayerToTournament(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<boolean> {
    const player = await playerRepository.findById(playerId);
    if (!player) return false;
    const freeEntryCount = player.freeEntryCount ?? 0;
    const freeReentryCount = player.freeReentryCount ?? 0;
    return InGameUserStateCache.addPlayerToTournament(
      playerId,
      tournamentId,
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

  /** Adds EarlyBird bonus if not already present (game-start with EarlyBirdFlag). */
  async ensureEarlyBirdBonusIfMissing(
    playerId: PlayerId,
    tournamentId: TournamentId
  ): Promise<InGameUserState | null> {
    return InGameUserStateCache.ensureEarlyBirdBonusIfMissing(playerId, tournamentId);
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
   * 3. If burnedStack: appends { chips: burnedChips, source } on eliminated player (Rebuy vs Out)
   * 4. If !burnedStack && killerPlayerIds.length > 0: bounty share 1/N per killer + kill records
   * Persists an elimination event and returns eventId for POST .../bounty/eliminate/undo.
   */
  async recordBountyElimination(
    tournamentId: TournamentId,
    eliminatedPlayerId: PlayerId,
    killerPlayerIds: PlayerId[],
    type: BountyEliminationTypeValue,
    burnedStack: boolean,
    burnedChips: number
  ): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
    const normalizedKillers = [
      ...new Set(killerPlayerIds.filter((id) => typeof id === "string" && id.length > 0)),
    ];

    if (!burnedStack && normalizedKillers.length === 0) {
      return {
        ok: false,
        error: "killerPlayerIds must contain at least one id when burnedStack is false",
      };
    }

    for (const kid of normalizedKillers) {
      if (kid === eliminatedPlayerId) {
        return { ok: false, error: "Eliminated player cannot be listed as killer" };
      }
      const ks = await InGameUserStateCache.get(kid, tournamentId);
      if (!ks) {
        return { ok: false, error: "Killer player not found in tournament" };
      }
    }

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

    if (burnedStack) {
      const burnSource = type === "Rebuy" ? "Rebuy" : "Out";
      const afterBurn = await InGameUserStateCache.appendBurnedStackEvent(
        eliminatedPlayerId,
        tournamentId,
        burnedChips,
        burnSource
      );
      if (!afterBurn) {
        return { ok: false, error: "Failed to record burned stack event" };
      }
    }

    const n = normalizedKillers.length;
    const recordedBounty = !burnedStack && n > 0;
    const bountyShare = recordedBounty ? 1 / n : 0;

    if (recordedBounty) {
      for (const killerPlayerId of normalizedKillers) {
        const bountyState = await InGameUserStateCache.updateBountyCount(
          killerPlayerId,
          tournamentId,
          bountyShare
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
    }

    const eventId = crypto.randomUUID();
    const record: BountyEliminationEventRecord = {
      eventId,
      eliminatedPlayerId,
      killerPlayerIds: [...normalizedKillers],
      type,
      burnedStack,
      burnedChips: burnedStack ? burnedChips : 0,
      recordedBounty,
      bountyShare,
    };
    const saved = await BountyEliminationEventsCache.save(record, tournamentId);
    if (!saved) {
      return { ok: false, error: "Failed to persist elimination event" };
    }

    return { ok: true, eventId };
  }

  /**
   * Full undo of one POST /bounty/eliminate via stored event (bounty shares, kill lists, burn, Rebuy or Out).
   */
  async undoBountyElimination(
    tournamentId: TournamentId,
    eventId: string
  ): Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }> {
    const event = await BountyEliminationEventsCache.get(tournamentId, eventId);
    if (!event) {
      return { ok: false, error: "Elimination event not found" };
    }

    const victim = await InGameUserStateCache.get(event.eliminatedPlayerId, tournamentId);
    if (!victim) {
      return { ok: false, error: "Victim not found in tournament" };
    }

    if (event.type === "Rebuy") {
      if (victim.totalReentryCount < 1) {
        return {
          ok: false,
          error: "Cannot undo: victim has no reentry to remove",
          conflict: true,
        };
      }
    } else if (victim.status !== InGamePlayerStatus.Out) {
      return {
        ok: false,
        error: "Cannot undo Out elimination: victim is not Out",
        conflict: true,
      };
    }

    if (event.burnedStack) {
      const burnSource = event.type === "Rebuy" ? "Rebuy" : "Out";
      if (
        !InGameUserStateService.lastBurnedStackMatches(
          victim,
          event.burnedChips,
          burnSource
        )
      ) {
        return {
          ok: false,
          error: "No matching burned stack event to undo (LIFO)",
          conflict: true,
        };
      }
    }

    if (event.recordedBounty) {
      for (const kid of event.killerPlayerIds) {
        const kills = await BountyKillsCache.getKillsByKiller(tournamentId, kid);
        if (!kills.includes(event.eliminatedPlayerId)) {
          return { ok: false, error: "Kill record not found for undo" };
        }
      }
    }

    const bountyRollback: { playerId: PlayerId; amount: number }[] = [];
    const killersKillRemoved: PlayerId[] = [];

    if (event.recordedBounty) {
      for (const kid of event.killerPlayerIds) {
        const st = await InGameUserStateCache.updateBountyCount(
          kid,
          tournamentId,
          -event.bountyShare
        );
        if (!st) {
          for (const r of bountyRollback) {
            await InGameUserStateCache.updateBountyCount(r.playerId, tournamentId, r.amount);
          }
          for (const k of killersKillRemoved) {
            await BountyKillsCache.addKill(tournamentId, k, event.eliminatedPlayerId);
            await BountyKillsCache.addEliminatedBy(
              tournamentId,
              event.eliminatedPlayerId,
              k
            );
          }
          return { ok: false, error: "Failed to decrement killer bounty" };
        }
        bountyRollback.push({ playerId: kid, amount: event.bountyShare });

        const removed = await BountyKillsCache.removeKill(
          tournamentId,
          kid,
          event.eliminatedPlayerId
        );
        if (!removed) {
          for (const r of bountyRollback) {
            await InGameUserStateCache.updateBountyCount(r.playerId, tournamentId, r.amount);
          }
          for (const k of killersKillRemoved) {
            await BountyKillsCache.addKill(tournamentId, k, event.eliminatedPlayerId);
            await BountyKillsCache.addEliminatedBy(
              tournamentId,
              event.eliminatedPlayerId,
              k
            );
          }
          return { ok: false, error: "Failed to remove kill record" };
        }
        await BountyKillsCache.removeEliminatedBy(
          tournamentId,
          event.eliminatedPlayerId,
          kid
        );
        killersKillRemoved.push(kid);
      }
    }

    if (event.burnedStack) {
      const burnSource = event.type === "Rebuy" ? "Rebuy" : "Out";
      const afterBurn = await InGameUserStateCache.removeLastBurnedStackEventMatching(
        event.eliminatedPlayerId,
        tournamentId,
        event.burnedChips,
        burnSource
      );
      if (!afterBurn) {
        if (event.recordedBounty) {
          for (const kid of event.killerPlayerIds) {
            await BountyKillsCache.addKill(
              tournamentId,
              kid,
              event.eliminatedPlayerId
            );
            await BountyKillsCache.addEliminatedBy(
              tournamentId,
              event.eliminatedPlayerId,
              kid
            );
            await InGameUserStateCache.updateBountyCount(
              kid,
              tournamentId,
              event.bountyShare
            );
          }
        }
        return { ok: false, error: "Failed to remove burned stack event" };
      }
    }

    if (event.type === "Rebuy") {
      const afterRe = await InGameUserStateCache.addReentryCount(
        event.eliminatedPlayerId,
        tournamentId,
        -1
      );
      if (!afterRe) {
        if (event.burnedStack) {
          const burnSource = event.type === "Rebuy" ? "Rebuy" : "Out";
          await InGameUserStateCache.appendBurnedStackEvent(
            event.eliminatedPlayerId,
            tournamentId,
            event.burnedChips,
            burnSource
          );
        }
        if (event.recordedBounty) {
          for (const kid of event.killerPlayerIds) {
            await BountyKillsCache.addKill(
              tournamentId,
              kid,
              event.eliminatedPlayerId
            );
            await BountyKillsCache.addEliminatedBy(
              tournamentId,
              event.eliminatedPlayerId,
              kid
            );
            await InGameUserStateCache.updateBountyCount(
              kid,
              tournamentId,
              event.bountyShare
            );
          }
        }
        return { ok: false, error: "Failed to decrement victim reentry" };
      }
    } else {
      const outUndo = await this.undoOutEliminationForVictim(
        tournamentId,
        event.eliminatedPlayerId,
        victim
      );
      if (!outUndo.ok) {
        if (event.burnedStack) {
          const burnSource = "Out";
          await InGameUserStateCache.appendBurnedStackEvent(
            event.eliminatedPlayerId,
            tournamentId,
            event.burnedChips,
            burnSource
          );
        }
        if (event.recordedBounty) {
          for (const kid of event.killerPlayerIds) {
            await BountyKillsCache.addKill(
              tournamentId,
              kid,
              event.eliminatedPlayerId
            );
            await BountyKillsCache.addEliminatedBy(
              tournamentId,
              event.eliminatedPlayerId,
              kid
            );
            await InGameUserStateCache.updateBountyCount(
              kid,
              tournamentId,
              event.bountyShare
            );
          }
        }
        return { ok: false, error: outUndo.error };
      }
    }

    await BountyEliminationEventsCache.delete(tournamentId, eventId);
    return { ok: true };
  }

  private static lastBurnedStackMatches(
    victim: InGameUserState,
    chips: number,
    source: "Rebuy" | "Out"
  ): boolean {
    for (let i = victim.burnedStackEvents.length - 1; i >= 0; i--) {
      const e = victim.burnedStackEvents[i];
      if (e != null && e.source === source && e.chips === chips) return true;
    }
    return false;
  }

  /** Restores victim from Out to in-game and shifts other Out placements down (inverse of elimination). */
  private async undoOutEliminationForVictim(
    tournamentId: TournamentId,
    victimId: PlayerId,
    victimState: InGameUserState
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const oldPlacement = victimState.placement;
    const shifted: { playerId: PlayerId; fromPlacement: number }[] = [];

    if (oldPlacement !== null) {
      const allStates = await InGameUserStateCache.getAllByTournament(tournamentId);
      const toShift = allStates.filter(
        (s) =>
          s.playerId !== victimId &&
          s.status === InGamePlayerStatus.Out &&
          s.placement != null &&
          s.placement > oldPlacement
      );
      toShift.sort((a, b) => (b.placement ?? 0) - (a.placement ?? 0));

      for (const s of toShift) {
        const from = s.placement as number;
        const to = from - 1;
        const updated = await InGameUserStateCache.updateStatusAndPlacement(
          s.playerId,
          tournamentId,
          InGamePlayerStatus.Out,
          to
        );
        if (!updated) {
          for (let i = shifted.length - 1; i >= 0; i--) {
            const u = shifted[i]!;
            await InGameUserStateCache.updateStatusAndPlacement(
              u.playerId,
              tournamentId,
              InGamePlayerStatus.Out,
              u.fromPlacement
            );
          }
          return { ok: false, error: "Failed to shift placements" };
        }
        shifted.push({ playerId: s.playerId, fromPlacement: from });
      }
    }

    const newStatus =
      victimState.entryPaymentMethod != null
        ? InGamePlayerStatus.InGamePaid
        : InGamePlayerStatus.InGameNotPaid;

    const afterStatus = await InGameUserStateCache.updateStatusAndPlacement(
      victimId,
      tournamentId,
      newStatus,
      null
    );
    if (!afterStatus) {
      for (let i = shifted.length - 1; i >= 0; i--) {
        const u = shifted[i]!;
        await InGameUserStateCache.updateStatusAndPlacement(
          u.playerId,
          tournamentId,
          InGamePlayerStatus.Out,
          u.fromPlacement
        );
      }
      return { ok: false, error: "Failed to restore victim status" };
    }

    await InGameUserStateCache.updateTableId(victimId, tournamentId, null);
    return { ok: true };
  }

  /**
   * Returns a busted player (Out) to in-game without a table: InGamePaid if entry was paid else
   * InGameNotPaid, +1 unpaid rebuy (totalReentryCount), placement and tableId cleared.
   * Out players who had a higher elimination placement get placement decremented by 1.
   */
  async returnBustedPlayerToGame(
    tournamentId: TournamentId,
    playerId: PlayerId
  ): Promise<
    | { ok: true; state: InGameUserState }
    | { ok: false; error: "not_found" | "invalid_status" | "internal" }
  > {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) {
      return { ok: false, error: "not_found" };
    }
    if (state.status !== InGamePlayerStatus.Out) {
      return { ok: false, error: "invalid_status" };
    }

    const oldPlacement = state.placement;
    const shifted: { playerId: PlayerId; fromPlacement: number }[] = [];

    if (oldPlacement !== null) {
      const allStates = await InGameUserStateCache.getAllByTournament(tournamentId);
      const toShift = allStates.filter(
        (s) =>
          s.playerId !== playerId &&
          s.status === InGamePlayerStatus.Out &&
          s.placement != null &&
          s.placement > oldPlacement
      );
      toShift.sort((a, b) => (b.placement ?? 0) - (a.placement ?? 0));

      for (const s of toShift) {
        const from = s.placement as number;
        const to = from - 1;
        const updated = await InGameUserStateCache.updateStatusAndPlacement(
          s.playerId,
          tournamentId,
          InGamePlayerStatus.Out,
          to
        );
        if (!updated) {
          for (let i = shifted.length - 1; i >= 0; i--) {
            const u = shifted[i]!;
            await InGameUserStateCache.updateStatusAndPlacement(
              u.playerId,
              tournamentId,
              InGamePlayerStatus.Out,
              u.fromPlacement
            );
          }
          return { ok: false, error: "internal" };
        }
        shifted.push({ playerId: s.playerId, fromPlacement: from });
      }
    }

    const afterReentry = await InGameUserStateCache.addReentryCount(
      playerId,
      tournamentId,
      1
    );
    if (!afterReentry) {
      for (let i = shifted.length - 1; i >= 0; i--) {
        const u = shifted[i]!;
        await InGameUserStateCache.updateStatusAndPlacement(
          u.playerId,
          tournamentId,
          InGamePlayerStatus.Out,
          u.fromPlacement
        );
      }
      return { ok: false, error: "internal" };
    }

    const newStatus =
      state.entryPaymentMethod != null
        ? InGamePlayerStatus.InGamePaid
        : InGamePlayerStatus.InGameNotPaid;

    const afterStatus = await InGameUserStateCache.updateStatusAndPlacement(
      playerId,
      tournamentId,
      newStatus,
      null
    );
    if (!afterStatus) {
      await InGameUserStateCache.addReentryCount(playerId, tournamentId, -1);
      for (let i = shifted.length - 1; i >= 0; i--) {
        const u = shifted[i]!;
        await InGameUserStateCache.updateStatusAndPlacement(
          u.playerId,
          tournamentId,
          InGamePlayerStatus.Out,
          u.fromPlacement
        );
      }
      return { ok: false, error: "internal" };
    }

    const final = await InGameUserStateCache.updateTableId(
      playerId,
      tournamentId,
      null
    );
    if (!final) {
      await InGameUserStateCache.updateStatusAndPlacement(
        playerId,
        tournamentId,
        InGamePlayerStatus.Out,
        oldPlacement
      );
      await InGameUserStateCache.addReentryCount(playerId, tournamentId, -1);
      for (let i = shifted.length - 1; i >= 0; i--) {
        const u = shifted[i]!;
        await InGameUserStateCache.updateStatusAndPlacement(
          u.playerId,
          tournamentId,
          InGamePlayerStatus.Out,
          u.fromPlacement
        );
      }
      return { ok: false, error: "internal" };
    }

    return { ok: true, state: final };
  }

  /**
   * Undoes one "Rebuy + burned stack" event: −1 totalReentryCount and removes the last matching
   * Rebuy-only burnedStackEvents entry with given chips (LIFO). Does not alter Out-sourced burns.
   */
  async undoRebuyBurnedStack(
    tournamentId: TournamentId,
    playerId: PlayerId,
    burnedChips: number
  ): Promise<{ ok: boolean; error?: string }> {
    const state = await InGameUserStateCache.get(playerId, tournamentId);
    if (!state) {
      return { ok: false, error: "Player not found in tournament" };
    }
    if (state.totalReentryCount < 1) {
      return { ok: false, error: "Cannot undo rebuy: totalReentryCount is already 0" };
    }
    const afterRemove = await InGameUserStateCache.removeLastRebuyBurnedStackEventMatching(
      playerId,
      tournamentId,
      burnedChips
    );
    if (!afterRemove) {
      return { ok: false, error: "No matching Rebuy burned-stack event" };
    }
    const afterReentry = await InGameUserStateCache.addReentryCount(
      playerId,
      tournamentId,
      -1
    );
    if (!afterReentry) {
      await InGameUserStateCache.appendBurnedStackEvent(
        playerId,
        tournamentId,
        burnedChips,
        "Rebuy"
      );
      return { ok: false, error: "Failed to decrement reentry count" };
    }
    return { ok: true };
  }
}

/** Event IDs for POST .../bounty/eliminate/undo involving this player (victim or killer). */
export function eliminationEventIdsForPlayer(
  playerId: PlayerId,
  events: BountyEliminationEventRecord[]
): string[] {
  return events
    .filter(
      (e) =>
        e.eliminatedPlayerId === playerId ||
        e.killerPlayerIds.includes(playerId)
    )
    .map((e) => e.eventId)
    .sort((a, b) => a.localeCompare(b));
}
