import type { BunRequest } from "bun";
import { PlayersService } from "../services/PlayersService";

export function playersRoutes() {
  const service = new PlayersService();

  return {
    "/api/players/create": {
      POST: async (req: BunRequest<"/api/players/create">) => {
        let body: { nickname: string; name?: string | null; phone?: string | null; tg?: string | null; notes?: string | null };
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
        return Response.json(
          {
            id: player.id,
            nickname: player.nickname,
            name: player.name,
            phone: player.phone,
            tg: player.tg,
            notes: player.notes,
            createdAt: player.createdAt.toISOString(),
          },
          { status: 201 }
        );
      },
    },
  };
}
