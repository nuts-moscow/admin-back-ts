import type { BunRequest } from "bun";
import {
  BountyEliminationType,
  EntryPaymentMethod,
  InGameBonus,
} from "../../domain/cache/InGameUserState";
import { playerRepository } from "../../postgres";
import { toApiResponse } from "../serializers/InGameUserStateSerializer";
import { InGameUserStateService } from "../services/InGameUserStateService";

const VALID_ENTRY_PAYMENT_METHODS = new Set<string>(
  Object.values(EntryPaymentMethod)
);

const VALID_IN_GAME_BONUSES = new Set<string>(Object.values(InGameBonus));

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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName), { status: 201 });
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
        return Response.json(toApiResponse(state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/bounty/eliminate": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/bounty/eliminate">
      ) => {
        const { tournamentId } = req.params;
        let body: {
          eliminatedPlayerId: string;
          killerPlayerId?: string;
          type: string;
          burnedStack?: boolean;
        };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const { eliminatedPlayerId, killerPlayerId, type, burnedStack } = body;
        if (
          !eliminatedPlayerId ||
          !type ||
          typeof eliminatedPlayerId !== "string" ||
          typeof type !== "string"
        ) {
          return new Response(
            JSON.stringify({
              error: "eliminatedPlayerId and type are required strings",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const isBurnedStack = burnedStack === true;
        if (!isBurnedStack && (!killerPlayerId || typeof killerPlayerId !== "string")) {
          return new Response(
            JSON.stringify({
              error: "killerPlayerId is required when burnedStack is false",
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
          killerPlayerId,
          eliminationType,
          isBurnedStack
        );
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: result.error ?? "Failed to record elimination" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      },
    },
    "/api/tournaments/:tournamentId/bounty/remove": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/bounty/remove">
      ) => {
        const { tournamentId } = req.params;
        let body: { killerPlayerId: string; victimPlayerId: string };
        try {
          body = (await req.json()) as { killerPlayerId: string; victimPlayerId: string };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const { killerPlayerId, victimPlayerId } = body;
        if (
          !killerPlayerId ||
          !victimPlayerId ||
          typeof killerPlayerId !== "string" ||
          typeof victimPlayerId !== "string"
        ) {
          return new Response(
            JSON.stringify({
              error: "killerPlayerId and victimPlayerId are required strings",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.removeBounty(
          tournamentId,
          killerPlayerId,
          victimPlayerId
        );
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: result.error ?? "Failed to remove bounty" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
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
          !VALID_IN_GAME_BONUSES.has(body.bonus)
        ) {
          return new Response(
            JSON.stringify({
              error: `bonus is required and must be one of: ${[...VALID_IN_GAME_BONUSES].join(", ")}`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const bonus = body.bonus as (typeof InGameBonus)[keyof typeof InGameBonus];
        const state = await service.addBonusOne(playerId, tournamentId, bonus);
        if (!state) {
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
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
          !VALID_IN_GAME_BONUSES.has(body.bonus)
        ) {
          return new Response(
            JSON.stringify({
              error: `bonus is required and must be one of: ${[...VALID_IN_GAME_BONUSES].join(", ")}`,
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
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
        const enriched = await Promise.all(
          states.map(async (s) => {
            const [player, bountyKills, eliminatedBy] = await Promise.all([
              playerRepository.findById(s.playerId),
              service.getKillsByKiller(tournamentId, s.playerId),
              service.getEliminatedBy(tournamentId, s.playerId),
            ]);
            return {
              ...toApiResponse(s, player?.nickname ?? null),
              signAgreement: player?.signAgreement ?? false,
              bountyKills,
              eliminatedBy,
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
        if (!state) {
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/game-start": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/game-start">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { entryPaymentMethod?: string; tableId?: string | null } = {};
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
          tableId
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(stateForResponse, playerName));
      },
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/in-game-payment": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/in-game-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { entryPaymentMethod: string };
        try {
          body = (await req.json()) as { entryPaymentMethod: string };
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
        const result = await service.inGamePayment(
          tournamentId,
          playerId,
          body.entryPaymentMethod as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod]
        );
        if ("error" in result) {
          if (result.error === "invalid_status") {
            return new Response(
              JSON.stringify({
                error:
                  "Player must be in InGameNotPaid or Out status for in-game payment",
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
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(result.state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/entry-payment": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/entry-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { entryPaymentMethod: string };
        try {
          body = (await req.json()) as { entryPaymentMethod: string };
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
        const state = await service.updateEntryPaymentMethod(
          playerId,
          tournamentId,
          body.entryPaymentMethod as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod]
        );
        if (state && "error" in state) {
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
      },
    },
    "/api/tournaments/:tournamentId/players/:playerId/reentry-payment": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/reentry-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { payments: string[] };
        try {
          body = (await req.json()) as { payments: string[] };
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
        const state = await service.addReentryPayment(
          playerId,
          tournamentId,
          body.payments as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod][]
        );
        if (state && "error" in state) {
          return new Response(
            JSON.stringify({
              error: "Insufficient free re-entries to add reentry payment with Free",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!state) {
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
      },
      PUT: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/reentry-payment">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { payments: string[] };
        try {
          body = (await req.json()) as { payments: string[] };
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
        const putState = await service.setReentryPaymentMethods(
          playerId,
          tournamentId,
          body.payments as (typeof EntryPaymentMethod)[keyof typeof EntryPaymentMethod][]
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
          return new Response(
            JSON.stringify({
              error: "Insufficient free re-entries for the number of Free in payments",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!putState) {
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(putState, playerName));
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
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
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
      },
    },
  };
}
