import type { BunRequest } from "bun";
import { InGameUserStateCache } from "../../cache";
import { logger } from "../../logger";
import { PlayersService } from "../services/PlayersService";

function playerToJson(player: {
  id: number;
  nickname: string;
  name: string | null;
  phone: string | null;
  tg: string | null;
  notes: string | null;
  signAgreement: boolean;
  freeEntryCount?: number;
  freeReentryCount?: number;
  createdAt: Date;
}) {
  return {
    id: player.id,
    nickname: player.nickname,
    name: player.name,
    phone: player.phone,
    tg: player.tg,
    notes: player.notes,
    signAgreement: player.signAgreement,
    freeEntryCount: player.freeEntryCount ?? 0,
    freeReentryCount: player.freeReentryCount ?? 0,
    createdAt: player.createdAt.toISOString(),
  };
}

export function playersRoutes() {
  const service = new PlayersService();

  return {
    "/api/players": {
      GET: async (req: BunRequest<"/api/players">) => {
        const url = new URL(req.url);
        const offsetRaw = url.searchParams.get("offset");
        const limitRaw = url.searchParams.get("limit");
        const offset = offsetRaw != null ? parseInt(offsetRaw, 10) : undefined;
        const limit = limitRaw != null ? parseInt(limitRaw, 10) : undefined;
        if (offsetRaw != null) {
          const o = offset ?? NaN;
          if (Number.isNaN(o) || o < 0) {
            return new Response(
              JSON.stringify({ error: "offset must be a non-negative integer" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        if (limitRaw != null) {
          const l = limit ?? NaN;
          if (Number.isNaN(l) || l < 1 || l > 1000) {
            return new Response(
              JSON.stringify({ error: "limit must be an integer between 1 and 1000" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        }
        const players = await service.listPlayers(offset, limit);
        const body = players.map(playerToJson);
        logger.info(
          {
            count: body.length,
            offset,
            limit,
            ids: body.map((p) => p.id),
          },
          "[Players] GET /api/players → 200"
        );
        return Response.json({ players: body });
      },
    },
    "/api/players/create": {
      POST: async (req: BunRequest<"/api/players/create">) => {
        let body: { nickname: string; name?: string | null; phone?: string | null; tg?: string | null; notes?: string | null; sign_agreement?: boolean };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          body.nickname === undefined ||
          body.nickname === null ||
          typeof body.nickname !== "string" ||
          body.nickname.trim() === ""
        ) {
          return new Response(
            JSON.stringify({ error: "nickname is required and must be a non-empty string" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.createPlayer({
          nickname: body.nickname.trim(),
          name: body.name ?? null,
          phone: body.phone ?? null,
          tg: body.tg ?? null,
          notes: body.notes ?? null,
          signAgreement: body.sign_agreement,
        });
        if (!result.ok) {
          if (result.error === "duplicate_nickname") {
            return new Response(
              JSON.stringify({ error: "Player with this nickname already exists" }),
              { status: 409, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Failed to create player" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        const player = result.player;
        return Response.json(playerToJson(player), { status: 201 });
      },
    },
    "/api/players/:playerId": {
      GET: async (
        req: BunRequest<"/api/players/:playerId"> & { params: { playerId: string } }
      ) => {
        const playerId = req.params?.playerId;
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: "playerId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const player = await service.getPlayer(playerId);
        if (!player) {
          return new Response(
            JSON.stringify({ error: "Player not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return Response.json(playerToJson(player));
      },
      PATCH: async (
        req: BunRequest<"/api/players/:playerId"> & { params: { playerId: string } }
      ) => {
        const playerId = req.params?.playerId;
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: "playerId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: {
          nickname?: string;
          name?: string | null;
          phone?: string | null;
          tg?: string | null;
          notes?: string | null;
          sign_agreement?: boolean;
        };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const input = {
          nickname: body.nickname,
          name: body.name,
          phone: body.phone,
          tg: body.tg,
          notes: body.notes,
          signAgreement: body.sign_agreement,
        };
        const hasAnyField = Object.values(input).some((v) => v !== undefined);
        if (!hasAnyField) {
          return new Response(
            JSON.stringify({ error: "At least one field to update is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.updatePlayer(playerId, input);
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Player not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "duplicate_nickname") {
            return new Response(
              JSON.stringify({ error: "Player with this nickname already exists" }),
              { status: 409, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "nickname cannot be empty" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const player = result.player;
        return Response.json(playerToJson(player));
      },
      DELETE: async (
        req: BunRequest<"/api/players/:playerId"> & { params: { playerId: string } }
      ) => {
        const playerId = req.params?.playerId;
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: "playerId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.deletePlayer(playerId);
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Player not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Failed to delete player" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        logger.info({ playerId }, "[Players] DELETE /api/players/:playerId → 204");
        return new Response(null, { status: 204 });
      },
    },
    "/api/players/:playerId/free-entries": {
      PATCH: async (
        req: BunRequest<"/api/players/:playerId/free-entries"> & { params: { playerId: string } }
      ) => {
        const playerId = req.params?.playerId;
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: "playerId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
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
        const result = await service.updateFreeEntryCountByDelta(playerId, delta);
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: "Player not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        await InGameUserStateCache.syncPlayerFreeEntryCount(playerId, result.freeEntryCount);
        return Response.json({ freeEntryCount: result.freeEntryCount });
      },
    },
    "/api/players/:playerId/free-reentries": {
      PATCH: async (
        req: BunRequest<"/api/players/:playerId/free-reentries"> & { params: { playerId: string } }
      ) => {
        const playerId = req.params?.playerId;
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: "playerId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
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
        const result = await service.updateFreeReentryCountByDelta(playerId, delta);
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: "Player not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        await InGameUserStateCache.syncPlayerFreeReentryCount(playerId, result.freeReentryCount);
        return Response.json({ freeReentryCount: result.freeReentryCount });
      },
    },
  };
}
