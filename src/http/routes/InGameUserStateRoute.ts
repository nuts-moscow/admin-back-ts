import type { BunRequest } from "bun";
import {
  BountyEliminationType,
  EntryPaymentMethod,
  InGamePlayerStatus,
} from "../../domain/cache/InGameUserState";
import { playerRepository } from "../../postgres";
import { toApiResponse } from "../serializers/InGameUserStateSerializer";
import { InGameUserStateService } from "../services/InGameUserStateService";

const VALID_STATUSES = new Set<string>(Object.values(InGamePlayerStatus));
const VALID_ENTRY_PAYMENT_METHODS = new Set<string>(
  Object.values(EntryPaymentMethod)
);

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
          killerPlayerId: string;
          type: string;
        };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const { eliminatedPlayerId, killerPlayerId, type } = body;
        if (
          !eliminatedPlayerId ||
          !killerPlayerId ||
          !type ||
          typeof eliminatedPlayerId !== "string" ||
          typeof killerPlayerId !== "string" ||
          typeof type !== "string"
        ) {
          return new Response(
            JSON.stringify({
              error:
                "eliminatedPlayerId, killerPlayerId and type are required strings",
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
          eliminationType
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
    "/api/tournaments/:tournamentId/rebuy-count": {
      GET: async (
        req: BunRequest<"/api/tournaments/:tournamentId/rebuy-count">
      ) => {
        const { tournamentId } = req.params;
        const rebuyCount = await service.getTotalRebuyCount(tournamentId);
        return Response.json({ rebuyCount });
      },
    },
    "/api/tournaments/:tournamentId/players": {
      GET: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players">
      ) => {
        const { tournamentId } = req.params;
        const states = await service.getAllByTournament(tournamentId);
        const enriched = await Promise.all(
          states.map(async (s) => {
            const playerName = await playerRepository.getNicknameById(s.playerId);
            return toApiResponse(s, playerName);
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
    "/api/tournaments/:tournamentId/players/:playerId/status": {
      POST: async (
        req: BunRequest<"/api/tournaments/:tournamentId/players/:playerId/status">
      ) => {
        const { tournamentId, playerId } = req.params;
        let body: { status: string };
        try {
          body = (await req.json()) as { status: string };
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.status === undefined ||
          body.status === null ||
          typeof body.status !== "string" ||
          !VALID_STATUSES.has(body.status)
        ) {
          return new Response(
            JSON.stringify({
              error: "status is required and must be a valid InGamePlayerStatus",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const state = await service.updateStatus(
          playerId,
          tournamentId,
          body.status as (typeof InGamePlayerStatus)[keyof typeof InGamePlayerStatus]
        );
        if (!state) {
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
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
        if (!state) {
          return new Response(null, { status: 404 });
        }
        const playerName = await playerRepository.getNicknameById(playerId);
        return Response.json(toApiResponse(state, playerName));
      },
    },
  };
}
