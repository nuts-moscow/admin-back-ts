import type { BunRequest } from "bun";
import { logger } from "../../logger";
import { tournamentRepository } from "../../postgres/TournamentRepository";

export function publicRoutes() {
  return {
    "/public/tournaments": {
      GET: async (_req: BunRequest<"/public/tournaments">) => {
        const tournaments = await tournamentRepository.listActive();
        logger.info({ count: tournaments.length }, "[Public] GET /public/tournaments → 200");
        return Response.json({
          tournaments: tournaments.map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            date: new Date(t.date).toISOString(),
          })),
        });
      },
    },

    "/public/tournaments/:id": {
      GET: async (req: BunRequest<"/public/tournaments/:id"> & { params: { id: string } }) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id < 1) {
          return new Response(JSON.stringify({ error: "Invalid tournament id" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const tournament = await tournamentRepository.findById(id);
        if (!tournament) {
          return new Response(JSON.stringify({ error: "Tournament not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        logger.info({ id: tournament.id, status: tournament.status }, "[Public] GET /public/tournaments/:id → 200");
        return Response.json({
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          date: new Date(tournament.date).toISOString(),
        });
      },
    },
  };
}
