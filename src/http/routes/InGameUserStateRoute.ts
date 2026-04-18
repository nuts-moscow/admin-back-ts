import type { BunRequest } from "bun";
import type { BountyEliminationEventRecord } from "../../cache/BountyEliminationEventsCache";
import { tournamentStructureCache } from "../../cache";
import { TournamentAuditEventType } from "../../domain/TournamentAuditEventType";
import {
  DEFAULT_MAX_REENTRIES,
  effectiveAllowedReentryCount,
} from "../../domain/tournamentReentryPolicy";
import {
  BountyEliminationType,
  EntryPaymentMethod,
  InGameBonus,
  type InGameUserState,
} from "../../domain/cache/InGameUserState";
import { playerRepository } from "../../postgres";
import { toApiResponse } from "../serializers/InGameUserStateSerializer";
import {
  eliminationEventsForPlayer,
  InGameUserStateService,
} from "../services/InGameUserStateService";
import { writeTournamentAuditLog } from "../services/tournamentAuditLog";

const VALID_ENTRY_PAYMENT_METHODS = new Set<string>(
  Object.values(EntryPaymentMethod)
);

/** Fixed bonuses only; Custom uses /bonuses/custom */
const VALID_PAIR_BONUSES = new Set<string>(
  Object.values(InGameBonus).filter((b) => b !== InGameBonus.Custom)
);

async function allowedReentryCountForTournament(tournamentId: string): Promise<number> {
  const structure = await tournamentStructureCache.get(tournamentId);
  if (!structure) {
    return effectiveAllowedReentryCount(false, DEFAULT_MAX_REENTRIES);
  }
  return effectiveAllowedReentryCount(
    structure.freezeOutEnabled,
    structure.maxReentries
  );
}

/** Parses EarlyBirdFlag / earlyBirdFlag / early_bird_flag from JSON body (boolean, string, or 1). */
function parseEarlyBirdFlagFromBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  const raw = o.EarlyBirdFlag ?? o.earlyBirdFlag ?? o.early_bird_flag;
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
  }
  if (typeof raw === "number" && raw === 1) return true;
  return false;
}

export function inGameUserStateRoutes() {
  const service = new InGameUserStateService();

  async function playerStateResponse(
    tournamentId: string,
    state: InGameUserState,
    playerName: string | null,
    preloaded?: BountyEliminationEventRecord[]
  ) {
    const events =
      preloaded ?? (await service.getBountyEliminationEvents(tournamentId));
    const allowedReentryCount = await allowedReentryCountForTournament(tournamentId);
    return toApiResponse(
      state,
      playerName,
      eliminationEventsForPlayer(state.playerId, events),
      allowedReentryCount
    );
  }

  const postReturnToGame = async (
    req: Request & { params: Record<string, string> }
  ) => {
    const tournamentId = req.params.tournamentId;
    const playerId = req.params.playerId;
    if (!tournamentId || !playerId) {
      return new Response(null, { status: 400 });
    }
    const result = await service.returnBustedPlayerToGame(tournamentId, playerId);
    if (!result.ok) {
      if (result.error === "not_found") {
        return new Response(
          JSON.stringify({ error: "Player not found in tournament" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      if (result.error === "invalid_status") {
        return new Response(
          "Player must be Out to return to game",
          { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      if (
        result.error === "reentries_not_allowed" ||
        result.error === "reentry_limit_reached"
      ) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "Failed to return player to game" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.ReturnToGame, {
      playerId,
    });
    const playerName = await playerRepository.getNicknameById(playerId);
    return Response.json(await playerStateResponse(tournamentId, result.state, playerName));
  };

  return {
    "/api/tournaments/:tournamentId/players/:playerId": {
      DELETE: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId">
      ) => {
        const { tournamentId, playerId } = req.params;
        const removed = await service.removePlayerFromTournament(
          playerId,
          tournamentId
        );
        if (!removed) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.PlayerRemoved, {
          playerId,
        });
        return new Response(null, { status: 204 });
      },
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId">
      ) => {
        const { tournamentId, playerId } = req.params;
        const ok = await service.addPlayerToTournament(playerId, tournamentId);
        if (!ok) {
          return new Response(
            JSON.stringify({ error: "Failed to add player to tournament" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.getUser(playerId, tournamentId);
        if (!state) {
          return new Response(
            JSON.stringify({ error: "Failed to get player state" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.PlayerAdded, {
          playerId,
        });
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(
          await playerStateResponse(tournamentId, state, playerName),
          { status: 201 }
        );
      },
      GET: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId">
      ) => {
        const { tournamentId, playerId } = req.params;
        const state = await service.getUser(playerId, tournamentId);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/bounty/eliminate": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/bounty/eliminate">
      ) => {
        const { tournamentId } = req.params;
        let body: {
          eliminatedPlayerId?: unknown;
          killerPlayerIds?: unknown;
          type?: unknown;
          burnedStack?: unknown;
          burnedChips?: unknown;
        };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const eliminatedPlayerId =
          typeof body.eliminatedPlayerId === "string" ? body.eliminatedPlayerId : "";
        const type = typeof body.type === "string" ? body.type : "";
        const burnedStack = body.burnedStack === true;
        const burnedChips = body.burnedChips;
        const killerPlayerIdsRaw = body.killerPlayerIds;
        if (!eliminatedPlayerId || !type) {
          return new Response(
            JSON.stringify({
              error: "eliminatedPlayerId and type are required",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          !Array.isArray(killerPlayerIdsRaw) ||
          !killerPlayerIdsRaw.every((id) => typeof id === "string")
        ) {
          return new Response(
            JSON.stringify({
              error: "killerPlayerIds must be an array of strings",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const killerPlayerIds = killerPlayerIdsRaw as string[];
        if (burnedStack) {
          if (
            typeof burnedChips !== "number" ||
            !Number.isInteger(burnedChips) ||
            burnedChips < 0
          ) {
            return new Response(
              JSON.stringify({
                error:
                  "burnedChips is required and must be a non-negative integer when burnedStack is true",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        } else if (killerPlayerIds.length === 0) {
          return new Response(
            JSON.stringify({
              error:
                "killerPlayerIds must contain at least one id when burnedStack is false",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const validTypes = new Set<string>(Object.values(BountyEliminationType));
        if (!validTypes.has(type)) {
          return new Response(
            JSON.stringify({
              error: `type must be one of: ${[...validTypes].join(", ")}`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const eliminationType = type as "Rebuy" | "Out";
        const result = await service.recordBountyElimination(
          tournamentId,
          eliminatedPlayerId,
          killerPlayerIds,
          eliminationType,
          burnedStack,
          burnedStack ? (burnedChips as number) : 0
        );
        if (!result.ok) {
          const msg = result.error ?? "Failed to record elimination";
          let status = 400;
          if (msg === "Failed to persist elimination event") status = 500;
          else if (msg.includes("not found")) status = 404;
          return new Response(JSON.stringify({ error: msg }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.BountyEliminationRecorded,
          {
            eliminatedPlayerId,
            killerPlayerIds,
            type: eliminationType,
            burnedStack,
            burnedChips: burnedStack ? (burnedChips as number) : undefined,
            eventId: result.eventId,
          }
        );
        return Response.json({ eventId: result.eventId });
      },
    },
    "/api/tournaments/:tournamentId/bounty/eliminate/undo": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/bounty/eliminate/undo">
      ) => {
        const { tournamentId } = req.params;
        let body: { eventId?: unknown };
        try {
          body = (await req.json()) as { eventId?: unknown };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof body.eventId !== "string" || !body.eventId) {
          return new Response(
            JSON.stringify({ error: "eventId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.undoBountyElimination(tournamentId, body.eventId);
        if (!result.ok) {
          const msg = result.error;
          const status = result.conflict
            ? 409
            : msg.includes("not found")
              ? 404
              : 400;
          return new Response(JSON.stringify({ error: msg }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.BountyEliminationUndo,
          { eventId: body.eventId }
        );
        return new Response(null, { status: 204 });
      },
    },
    "/api/tournaments/:tournamentId/bounty/rebuy-burned-stack/undo": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/bounty/rebuy-burned-stack/undo">
      ) => {
        const { tournamentId } = req.params;
        let body: { playerId?: unknown; burnedChips?: unknown };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const { playerId, burnedChips } = body;
        if (
          !playerId ||
          typeof playerId !== "string" ||
          typeof burnedChips !== "number" ||
          !Number.isInteger(burnedChips) ||
          burnedChips < 0
        ) {
          return new Response(
            JSON.stringify({
              error: "playerId (string) and burnedChips (non-negative integer) are required",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.undoRebuyBurnedStack(
          tournamentId,
          playerId,
          burnedChips
        );
        if (!result.ok) {
          const msg = result.error ?? "Failed to undo rebuy burned stack";
          const status = msg === "Player not found in tournament" ? 404 : 400;
          return new Response(JSON.stringify({ error: msg }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.BountyRebuyBurnedStackUndo,
          { playerId, burnedChips }
        );
        return new Response(null, { status: 204 });
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/bounty/update": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/bounty/update">
      ) => {
        const { tournamentId, playerId } = req.params;

        let body: { bountyCountToAdd: number };
        try {
          body = await req.json() as { bountyCountToAdd: number };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        if (
          body.bountyCountToAdd === undefined ||
          body.bountyCountToAdd === null ||
          typeof body.bountyCountToAdd !== "number"
        ) {
          return new Response(
            JSON.stringify({ error: "bountyCountToAdd is required and must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const state = await service.updateBountyCount(
          playerId,
          tournamentId,
          body.bountyCountToAdd
        );

        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.BountyCountUpdated,
          { playerId, bountyCountToAdd: body.bountyCountToAdd }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/bounty/remove": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/bounty/remove">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: {
          bountyCountToRemove?: unknown;
          reentryCountToRemove?: unknown;
        };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const result = await service.applyBountyReentryRemoval(
          playerId,
          tournamentId,
          {
            bountyCountToRemove:
              typeof body.bountyCountToRemove === "number"
                ? body.bountyCountToRemove
                : undefined,
            reentryCountToRemove:
              typeof body.reentryCountToRemove === "number"
                ? body.reentryCountToRemove
                : undefined,
          }
        );

        if (!result.ok) {
          const status =
            result.kind === "not_found"
              ? 404
              : result.kind === "conflict"
                ? 409
                : 400;
          return new Response(JSON.stringify({ error: result.error }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }

        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.BountyReentryRemovalApplied,
          {
            playerId,
            bountyCountToRemove:
              typeof body.bountyCountToRemove === "number"
                ? body.bountyCountToRemove
                : undefined,
            reentryCountToRemove:
              typeof body.reentryCountToRemove === "number"
                ? body.reentryCountToRemove
                : undefined,
          }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(
          await playerStateResponse(tournamentId, result.state, playerName)
        );
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/bonuses": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/bonuses">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { bonus?: string };
        try {
          body = (await req.json()) as { bonus?: string };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.bonus == null ||
          typeof body.bonus !== "string" ||
          !VALID_PAIR_BONUSES.has(body.bonus)
        ) {
          return new Response(
            JSON.stringify({
              error: `bonus is required and must be one of: ${[...VALID_PAIR_BONUSES].join(", ")} (use /bonuses/custom for Custom)`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const bonus = body.bonus as (typeof InGameBonus)[keyof typeof InGameBonus];
        const state = await service.addBonusOne(playerId, tournamentId, bonus);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.BonusAdded, {
          playerId,
          bonus,
        });
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/bonuses/remove": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/bonuses/remove">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { bonus?: string };
        try {
          body = (await req.json()) as { bonus?: string };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.bonus == null ||
          typeof body.bonus !== "string" ||
          !VALID_PAIR_BONUSES.has(body.bonus)
        ) {
          return new Response(
            JSON.stringify({
              error: `bonus is required and must be one of: ${[...VALID_PAIR_BONUSES].join(", ")} (use /bonuses/custom/remove for Custom)`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const bonus = body.bonus as (typeof InGameBonus)[keyof typeof InGameBonus];
        const state = await service.removeBonusOne(playerId, tournamentId, bonus);
        if (!state) {
          return new Response(
            JSON.stringify({
              error: "Player state not found or bonus count is already zero",
            }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.BonusRemoved, {
          playerId,
          bonus,
        });
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/bonuses/custom": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/bonuses/custom">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { chips?: unknown };
        try {
          body = (await req.json()) as { chips?: unknown };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const chips = body.chips;
        if (
          typeof chips !== "number" ||
          !Number.isInteger(chips) ||
          chips <= 0
        ) {
          return new Response(
            JSON.stringify({
              error: "chips is required and must be a positive integer",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.addCustomBonusChips(
          playerId,
          tournamentId,
          chips
        );
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.CustomBonusChipsAdded,
          { playerId, chips }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/bonuses/custom/remove": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/bonuses/custom/remove">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { chips?: unknown };
        try {
          body = (await req.json()) as { chips?: unknown };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const chips = body.chips;
        if (
          typeof chips !== "number" ||
          !Number.isInteger(chips) ||
          chips <= 0
        ) {
          return new Response(
            JSON.stringify({
              error: "chips is required and must be a positive integer",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.removeCustomBonusChipsOne(
          playerId,
          tournamentId,
          chips
        );
        if (!state) {
          return new Response(
            JSON.stringify({
              error:
                "Player state not found or no custom bonus grant with this chips value",
            }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.CustomBonusChipsRemoved,
          { playerId, chips }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/rebuy-count": {
      GET: async (
        req: BunRequest<"/api/tournaments/:tournamentId/rebuy-count">
      ) => {
        const { tournamentId } = req.params;
        const rebuyCount = await service.getTotalRebuyCount(tournamentId);
        return Response.json({ rebuyCount });
      },
    },
    "/api/tournaments/:tournamentId/chip-pool-summary": {
      GET: async (
        req: BunRequest<"/api/tournaments/:tournamentId/chip-pool-summary">
      ) => {
        const { tournamentId } = req.params;
        const result = await service.getTournamentChipPoolSummary(tournamentId);
        if (!result.ok) {
          if (result.error === "stack_size_unavailable") {
            return new Response(
              JSON.stringify({
                error:
                  "Stack size not available for this completed tournament (re-save snapshot or backfill stackSize)",
              }),
              { status: 422, headers: { "Content-Type": "application/json" } }
            );
          }
          const msg =
            result.error === "structure_not_found"
              ? "Tournament structure not found in cache"
              : "Tournament not found";
          return new Response(JSON.stringify({ error: msg }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json(result.summary);
      },
    },
    "/api/tournaments/:tournamentId/cash-desk": {
      GET: async (
        req: BunRequest<"/api/tournaments/:tournamentId/cash-desk">
      ) => {
        const { tournamentId } = req.params;
        const cashDesk = await service.getCashDesk(tournamentId);
        if (!cashDesk) {
          return new Response(
            JSON.stringify({ error: "Tournament not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return Response.json(cashDesk);
      },
    },
    "/api/tournaments/:tournamentId/players": {
      GET: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players">
      ) => {
        const { tournamentId } = req.params;
        const resultPlayers = await service.getTournamentResultPlayers(tournamentId);
        if (resultPlayers !== null) {
          return Response.json(resultPlayers);
        }
        const states = await service.getAllByTournament(tournamentId);
        const eliminationEvents = await service.getBountyEliminationEvents(tournamentId);
        const allowedReentryCount = await allowedReentryCountForTournament(tournamentId);
        const enriched = await Promise.all(
          states.map(async (s) => {
            const [player, bountyKills] = await Promise.all([
              playerRepository.findById(s.playerId),
              service.getKillsByKiller(tournamentId, s.playerId),
            ]);
            return {
              ...toApiResponse(
                s,
                player?.nickname ?? null,
                eliminationEventsForPlayer(s.playerId, eliminationEvents),
                allowedReentryCount
              ),
              signAgreement: player?.signAgreement ?? false,
              bountyKills,
            };
          })
        );
        return Response.json(enriched);
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/reentry": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/reentry">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { count: number };
        try {
          body = (await req.json()) as { count: number };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.count === undefined ||
          body.count === null ||
          typeof body.count !== "number"
        ) {
          return new Response(
            JSON.stringify({ error: "count is required and must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.addReentryCount(
          playerId,
          tournamentId,
          body.count
        );
        if (state && typeof state === "object" && "error" in state) {
          return new Response(JSON.stringify({ error: state.error }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.ReentryCountAdded,
          { playerId, count: body.count }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/game-start": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/game-start">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: {
          entryPaymentMethod?: string;
          tableId?: string | null;
          entryPaidAmount?: unknown;
        } = {};
        let earlyBirdFlag = false;
        try {
          const raw = await req.json();
          body = (raw ?? {}) as typeof body;
          earlyBirdFlag = parseEarlyBirdFlagFromBody(raw);
        } catch {
          // No body or invalid JSON - treat as no payment method
        }
        const entryPaymentMethod =
          body.entryPaymentMethod != null &&
            typeof body.entryPaymentMethod === "string" &&
            VALID_ENTRY_PAYMENT_METHODS.has(body.entryPaymentMethod)
            ? (body.entryPaymentMethod as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod])
            : undefined;
        const entryPaidAmountParsed =
          typeof body.entryPaidAmount === "number" && Number.isInteger(body.entryPaidAmount)
            ? body.entryPaidAmount
            : undefined;
        const tableId =
          body.tableId != null && typeof body.tableId === "string" && body.tableId !== ""
            ? body.tableId
            : undefined;
        if (tableId != null) {
          const playersAtTable = await service.getPlayerCountAtTable(
            tournamentId,
            tableId,
            playerId
          );
          const effectiveCount = playersAtTable + 1;
          if (effectiveCount > 10) {
            return new Response(
              JSON.stringify({
                error: "Table has too many players",
                detail: `Cannot add player: table would have ${effectiveCount} players (max 10)`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        const result = await service.playerGameStart(
          tournamentId,
          playerId,
          entryPaymentMethod,
          tableId,
          entryPaidAmountParsed
        );
        if ("error" in result) {
          if (result.error === "invalid_status") {
            return new Response(
              JSON.stringify({
                error: "Player must be in Registered status to start game",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "invalid_amount") {
            return new Response(
              JSON.stringify({
                error: "entryPaidAmount must be between 0 and tournament entry price",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "insufficient_free_entries") {
            return new Response(
              JSON.stringify({
                error: "Insufficient free entries to start with Free payment",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "paid_entry_not_allowed") {
            return new Response(
              JSON.stringify({
                error:
                  "This tournament requires a free initial entry; Cache and CreditCard are not allowed for the buy-in",
                code: "paid_entry_not_allowed",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(null, { status: 404 });
        }
        let stateForResponse = result.state;
        if (earlyBirdFlag) {
          const withBird = await service.ensureEarlyBirdBonusIfMissing(
            playerId,
            tournamentId
          );
          if (withBird) stateForResponse = withBird;
        }
        await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.GameStart, {
          playerId,
          entryPaymentMethod: entryPaymentMethod ?? null,
          tableId: tableId ?? null,
          entryPaidAmount: entryPaidAmountParsed ?? null,
          earlyBirdFlag,
        });
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(
          await playerStateResponse(tournamentId, stateForResponse, playerName)
        );
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/return-to-game": {
      POST: postReturnToGame,
    },
    "/v2/api/tournaments/:tournamentId/players/:playerId/return-to-game": {
      POST: postReturnToGame,
    },
    "/api/tournaments/:tournamentId/players/:playerId/rollback-game-start": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/rollback-game-start">
      ) => {
        const { tournamentId, playerId } = req.params;
        const state = await service.rollbackGameStart(tournamentId, playerId);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(tournamentId, TournamentAuditEventType.RollbackGameStart, {
          playerId,
        });
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/in-game-payment": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/in-game-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { entryPaymentMethod: string; entryPaidAmount?: unknown };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.entryPaymentMethod == null ||
          typeof body.entryPaymentMethod !== "string" ||
          !VALID_ENTRY_PAYMENT_METHODS.has(body.entryPaymentMethod)
        ) {
          return new Response(
            JSON.stringify({
              error:
                "entryPaymentMethod is required and must be Cache, CreditCard, or Free",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const inGameEntryPaid =
          typeof body.entryPaidAmount === "number" && Number.isInteger(body.entryPaidAmount)
            ? body.entryPaidAmount
            : undefined;
        const result = await service.inGamePayment(
          tournamentId,
          playerId,
          body.entryPaymentMethod as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod],
          inGameEntryPaid
        );
        if ("error" in result) {
          if (result.error === "invalid_status") {
            return new Response(
              JSON.stringify({
                error:
                  "Player must be InGameNotPaid, InGamePaid, or Out for in-game payment",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "insufficient_free_entries") {
            return new Response(
              JSON.stringify({
                error: "Insufficient free entries to pay entry with Free",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "invalid_entry_amount") {
            return new Response(
              JSON.stringify({
                error: "entryPaidAmount must be between 0 and tournament entry price",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "paid_entry_not_allowed") {
            return new Response(
              JSON.stringify({
                error:
                  "This tournament requires a free initial entry; Cache and CreditCard are not allowed for the buy-in",
                code: "paid_entry_not_allowed",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.InGameEntryPayment,
          {
            playerId,
            entryPaymentMethod: body.entryPaymentMethod,
            entryPaidAmount: inGameEntryPaid ?? null,
          }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(
          await playerStateResponse(tournamentId, result.state, playerName)
        );
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/entry-payment": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/entry-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { entryPaymentMethod: string; entryPaidAmount?: unknown };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.entryPaymentMethod === undefined ||
          body.entryPaymentMethod === null ||
          typeof body.entryPaymentMethod !== "string" ||
          !VALID_ENTRY_PAYMENT_METHODS.has(body.entryPaymentMethod)
        ) {
          return new Response(
            JSON.stringify({
              error:
                "entryPaymentMethod is required and must be a valid EntryPaymentMethod",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const entryPaidPatch =
          typeof body.entryPaidAmount === "number" && Number.isInteger(body.entryPaidAmount)
            ? body.entryPaidAmount
            : undefined;
        const state = await service.updateEntryPaymentMethod(
          playerId,
          tournamentId,
          body.entryPaymentMethod as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod],
          entryPaidPatch
        );
        if (state && "error" in state) {
          if (state.error === "invalid_entry_amount") {
            return new Response(
              JSON.stringify({
                error: "entryPaidAmount must be between 0 and tournament entry price",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (state.error === "paid_entry_not_allowed") {
            return new Response(
              JSON.stringify({
                error:
                  "This tournament requires a free initial entry; Cache and CreditCard are not allowed for the buy-in",
                code: "paid_entry_not_allowed",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({
              error: "Insufficient free entries to pay entry with Free",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.EntryPaymentUpdated,
          {
            playerId,
            entryPaymentMethod: body.entryPaymentMethod,
            entryPaidAmount: entryPaidPatch ?? null,
          }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/table": {
      DELETE: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/table">
      ) => {
        const { tournamentId, playerId } = req.params;
        const state = await service.updateTableId(playerId, tournamentId, null);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.TableAssignmentUpdated,
          { playerId, tableId: null }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/table">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { tableId: string | null };
        try {
          body = (await req.json()) as { tableId: string | null };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (body.tableId !== undefined && body.tableId !== null && typeof body.tableId !== "string") {
          return new Response(
            JSON.stringify({ error: "tableId must be a string or null" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const tableId = body.tableId === undefined || body.tableId === null || body.tableId === ""
          ? null
          : body.tableId;
        if (tableId !== null) {
          const playersAtTable = await service.getPlayerCountAtTable(
            tournamentId,
            tableId,
            playerId
          );
          const effectiveCount = playersAtTable + 1;
          if (effectiveCount > 10) {
            return new Response(
              JSON.stringify({
                error: "Table has too many players",
                detail: `Cannot add player: table would have ${effectiveCount} players (max 10)`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        const state = await service.updateTableId(playerId, tournamentId, tableId);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.TableAssignmentUpdated,
          { playerId, tableId }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/reentry-payment": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/reentry-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { payments: string[]; paidAmounts?: unknown };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.payments === undefined ||
          body.payments === null ||
          !Array.isArray(body.payments)
        ) {
          return new Response(
            JSON.stringify({ error: "payments is required and must be an array" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        for (const p of body.payments) {
          if (
            typeof p !== "string" ||
            !VALID_ENTRY_PAYMENT_METHODS.has(p)
          ) {
            return new Response(
              JSON.stringify({
                error: `Invalid payment method '${p}'. Must be one of: Cache, CreditCard, Free`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        let postPaidAmounts: number[] | undefined;
        if (body.paidAmounts !== undefined) {
          if (!Array.isArray(body.paidAmounts)) {
            return new Response(
              JSON.stringify({ error: "paidAmounts must be an array of integers" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.paidAmounts.length !== body.payments.length) {
            return new Response(
              JSON.stringify({
                error: "paidAmounts length must match payments length",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          for (const a of body.paidAmounts) {
            if (typeof a !== "number" || !Number.isInteger(a)) {
              return new Response(
                JSON.stringify({ error: "each paidAmounts item must be an integer" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }
          }
          postPaidAmounts = body.paidAmounts as number[];
        }
        const state = await service.addReentryPayment(
          playerId,
          tournamentId,
          body.payments as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod][],
          postPaidAmounts
        );
        if (state && "error" in state) {
          if (state.error === "invalid_reentry_amount") {
            return new Response(
              JSON.stringify({
                error:
                  "Each paid amount must be between 0 and tournament re-entry price (0 for Free)",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (state.error === "paid_amounts_length") {
            return new Response(
              JSON.stringify({ error: "paidAmounts length must match payments length" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({
              error:
                "Not enough free re-entry grants for the requested Free payment(s)",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.ReentryPaymentAppended,
          {
            playerId,
            payments: body.payments,
            paidAmounts: postPaidAmounts ?? null,
          }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
      PUT: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/reentry-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { payments: string[]; paidAmounts?: unknown };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.payments === undefined ||
          body.payments === null ||
          !Array.isArray(body.payments)
        ) {
          return new Response(
            JSON.stringify({ error: "payments is required and must be an array" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        for (const p of body.payments) {
          if (
            typeof p !== "string" ||
            !VALID_ENTRY_PAYMENT_METHODS.has(p)
          ) {
            return new Response(
              JSON.stringify({
                error: `Invalid payment method '${p}'. Must be one of: Cache, CreditCard, Free`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        let putPaidAmounts: number[] | undefined;
        if (body.paidAmounts !== undefined) {
          if (!Array.isArray(body.paidAmounts)) {
            return new Response(
              JSON.stringify({ error: "paidAmounts must be an array of integers" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.paidAmounts.length !== body.payments.length) {
            return new Response(
              JSON.stringify({
                error: "paidAmounts length must match payments length",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          for (const a of body.paidAmounts) {
            if (typeof a !== "number" || !Number.isInteger(a)) {
              return new Response(
                JSON.stringify({ error: "each paidAmounts item must be an integer" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }
          }
          putPaidAmounts = body.paidAmounts as number[];
        }
        const putState = await service.setReentryPaymentMethods(
          playerId,
          tournamentId,
          body.payments as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod][],
          putPaidAmounts
        );
        if (putState && "error" in putState) {
          if (putState.error === "invalid_length") {
            return new Response(
              JSON.stringify({
                error:
                  "payments length must equal player totalReentryCount",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (putState.error === "invalid_reentry_amount") {
            return new Response(
              JSON.stringify({
                error:
                  "Each paid amount must be between 0 and tournament re-entry price (0 for Free)",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          if (putState.error === "paid_amounts_length") {
            return new Response(
              JSON.stringify({ error: "paidAmounts length must match payments length" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({
              error:
                "Not enough free re-entry grants for the requested Free payment(s)",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!putState) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.ReentryPaymentReplaced,
          {
            playerId,
            payments: body.payments,
            paidAmounts: putPaidAmounts ?? null,
          }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(
          await playerStateResponse(tournamentId, putState, playerName)
        );
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/rating-non-placement": {
      PATCH: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/rating-non-placement">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { delta?: number };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const delta = body.delta;
        if (delta === undefined || delta === null || typeof delta !== "number") {
          return new Response(
            JSON.stringify({ error: "delta is required and must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!Number.isFinite(delta)) {
          return new Response(
            JSON.stringify({ error: "delta must be a finite number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.adjustRatingNonPlacementAccrued(playerId, tournamentId, delta);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.RatingNonPlacementAccruedAdjusted,
          { playerId, delta }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/free-entries": {
      PATCH: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/free-entries">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { delta?: number };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const delta = body.delta;
        if (delta === undefined || delta === null || typeof delta !== "number") {
          return new Response(
            JSON.stringify({ error: "delta is required and must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.addTournamentFreeEntries(playerId, tournamentId, delta);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.TournamentFreeEntriesAdjusted,
          { playerId, delta }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/free-reentries": {
      PATCH: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/free-reentries">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { delta?: number };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const delta = body.delta;
        if (delta === undefined || delta === null || typeof delta !== "number") {
          return new Response(
            JSON.stringify({ error: "delta is required and must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.addTournamentFreeReentries(playerId, tournamentId, delta);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        await writeTournamentAuditLog(
          tournamentId,
          TournamentAuditEventType.TournamentFreeReentriesAdjusted,
          { playerId, delta }
        );
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(await playerStateResponse(tournamentId, state, playerName));
      },
    },
  };
}
