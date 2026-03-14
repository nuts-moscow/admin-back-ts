import type { BunRequest } from "bun";
import { PlayersService } from "../services/PlayersService";

function playerToJson(player: {
  id: number;
  nickname: string;
  name: string | null;
  phone: string | null;
  tg: string | null;
  notes: string | null;
  signAgreement: boolean;
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
        if (offsetRaw != null && (Number.isNaN(offset) || offset < 0)) {
          return new Response(
            JSON.stringify({ error: "offset must be a non-negative integer" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (limitRaw != null && (Number.isNaN(limit) || limit < 1 || limit > 1000)) {
          return new Response(
            JSON.stringify({ error: "limit must be an integer between 1 and 1000" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const players = await service.listPlayers(offset, limit);
        return Response.json({ players: players.map(playerToJson) });
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
    "/api/players/:playerId/sign-agreement": {
      PATCH: async (
        req: BunRequest<"/api/players/:playerId/sign-agreement"> & { params: { playerId: string } }
      ) => {
        const playerId = req.params?.playerId;
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: "playerId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: { sign_agreement?: boolean };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof body.sign_agreement !== "boolean") {
          return new Response(
            JSON.stringify({ error: "sign_agreement must be a boolean" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.updateSignAgreement(playerId, body.sign_agreement);
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: "Player not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        const player = result.player;
        return Response.json(playerToJson(player));
      },
    },
  };
}
