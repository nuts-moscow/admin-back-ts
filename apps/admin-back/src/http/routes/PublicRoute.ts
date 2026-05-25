import type { BunRequest } from "bun";
import { maxPrizePlace, countPlayersForPlaceList, selectPlacesForDisplay } from "../../domain/publicRatingDistribution";
import { logger } from "../../logger";
import { tournamentRepository } from "../../postgres/TournamentRepository";
import { ratingTableRepository } from "../../postgres/RatingTableRepository";
import { InGameUserStateService } from "../services/InGameUserStateService";
import {
  buildPublicRatingPlaceRows,
  ratingParticipantCount,
} from "../services/tournamentRatingCompute";
import { TournamentService } from "../services/TournamentService";
import { tournamentClockService } from "../services/TournamentClockService";

export function publicRoutes() {
  const inGameService = new InGameUserStateService();
  const tournamentService = new TournamentService();

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
            lateRegistrationClosed: t.lateRegistrationClosed,
          })),
        });
      },
    },

    "/public/tournaments/:id/rating-points-distribution": {
      GET: async (
        req: BunRequest<"/public/tournaments/:id/rating-points-distribution"> & { params: { id: string } }
      ) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id < 1) {
          return new Response(JSON.stringify({ error: "Invalid tournament id" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const row = await tournamentRepository.findById(id);
        if (!row) {
          return new Response(JSON.stringify({ error: "Tournament not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const ratingTable = await ratingTableRepository.findById(row.ratingTableId);
        if (!ratingTable) {
          return new Response(JSON.stringify({ error: "Rating table not found" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const states = await inGameService.getAllByTournament(String(id));
        /** Field size for the rating matrix: players who joined (status other than Registered). */
        const ratingMatrixFieldSize = ratingParticipantCount(states);
        /** Drives which place rows we return (InGame-only when play started; see countPlayersForPlaceList). */
        const playersForPlaceList = countPlayersForPlaceList(states);
        /** Deepest place with base points > 0 for `ratingMatrixFieldSize` (matrix column / depth). */
        const matrixMaxPlaceWithPoints = maxPrizePlace(ratingTable, ratingMatrixFieldSize);
        /** Top 10 + bubble for the remaining field only (no rows beyond still-active count). */
        const placeNumbers = selectPlacesForDisplay(playersForPlaceList, playersForPlaceList);
        const places =
          playersForPlaceList === 0 || ratingMatrixFieldSize < 1
            ? []
            : buildPublicRatingPlaceRows(placeNumbers, ratingMatrixFieldSize, row, ratingTable);

        logger.info(
          {
            id,
            ratingMatrixFieldSize,
            playersForPlaceList,
            matrixMaxPlaceWithPoints,
            rows: places.length,
          },
          "[Public] GET /public/tournaments/:id/rating-points-distribution → 200"
        );

        return Response.json({
          tournamentId: id,
          playersInTournament: playersForPlaceList,
          ratingMatrixFieldSize,
          prizePlacesDepth: matrixMaxPlaceWithPoints,
          places,
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

        const tournament = await tournamentService.getTournament(id);
        if (!tournament) {
          return new Response(JSON.stringify({ error: "Tournament not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        logger.info({ id: tournament.id, status: tournament.status }, "[Public] GET /public/tournaments/:id → 200");
        // Same shape as GET /api/tournaments/:id (structure, blindsStructure, rating fields, date as ms)
        return Response.json(tournament);
      },
    },

    "/public/tournaments/:id/clock": {
      GET: async (req: BunRequest<"/public/tournaments/:id/clock"> & { params: { id: string } }) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id < 1) {
          return new Response(JSON.stringify({ error: "Invalid tournament id" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const tick = await tournamentClockService.getTick(id);
        if (!tick) {
          return new Response(JSON.stringify({ error: "Tournament not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        logger.info({ id }, "[Public] GET /public/tournaments/:id/clock → 200");
        return Response.json(tick);
      },
    },

    "/public/tournaments/:tournamentId/chip-pool-summary": {
      GET: async (
        req: BunRequest<"/public/tournaments/:tournamentId/chip-pool-summary"> & {
          params: { tournamentId: string };
        }
      ) => {
        const result = await inGameService.getTournamentChipPoolSummary(req.params.tournamentId);
        if (!result.ok) {
          if (result.error === "stack_size_unavailable") {
            return new Response(
              JSON.stringify({ error: "Stack size not available for this tournament" }),
              { status: 422, headers: { "Content-Type": "application/json" } }
            );
          }
          const msg =
            result.error === "structure_not_found"
              ? "Tournament structure not found"
              : "Tournament not found";
          return new Response(JSON.stringify({ error: msg }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        logger.info({ tournamentId: req.params.tournamentId }, "[Public] GET /public/tournaments/:id/chip-pool-summary → 200");
        return Response.json(result.summary);
      },
    },
  };
}
