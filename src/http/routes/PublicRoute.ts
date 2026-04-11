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
  };
}
