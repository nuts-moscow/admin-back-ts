import { z } from "zod";
import {
  AddPlayerToTournamentBodySchema,
  BountyCountBodySchema,
  BountyEliminateBodySchema,
  CashDeskResponseSchema,
  BountyRemoveBodySchema,
  CreatePlayerBodySchema,
  EntryPaymentBodySchema,
  FreeCountDeltaBodySchema,
  FreeEntryCountResponseSchema,
  FreeReentryCountResponseSchema,
  InGameUserStateSchema,
  ListPlayersQuerySchema,
  ListPlayersResponseSchema,
  ListTournamentStructuresQuerySchema,
  ListTournamentStructuresResponseSchema,
  ListTournamentsQuerySchema,
  ListTournamentsResponseSchema,
  MakeTournamentBodySchema,
  MakeTournamentStructureBodySchema,
  PlayerGameStartBodySchema,
  PlayerSchema,
  RebuyCountResponseSchema,
  ReentryCountBodySchema,
  ReentryPaymentBodySchema,
  TableIdBodySchema,
  TournamentParamsSchema,
  TournamentPlayerParamsSchema,
  TournamentResponseSchema,
  TournamentStructureResponseSchema,
  TournamentWithStructureResponseSchema,
  UpdatePlayerBodySchema,
  UpdateTournamentBodySchema,
  UpdateTournamentStatusBodySchema,
} from "./schemas";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const openApiRegistry = new OpenAPIRegistry();

const basePath = "/api/tournaments/{tournamentId}";

openApiRegistry.registerPath({
  method: "get",
  path: "/api/players",
  tags: ["Players"],
  operationId: "listPlayers",
  summary: "List players",
  description: "Returns all players from the players table with optional offset/limit pagination",
  request: {
    query: ListPlayersQuerySchema,
  },
  responses: {
    200: {
      description: "List of players",
      content: {
        "application/json": { schema: ListPlayersResponseSchema },
      },
    },
    400: {
      description: "Invalid query params",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/players/create",
  tags: ["Players"],
  operationId: "createPlayer",
  summary: "Create player",
  description: "Creates a new player in the players table",
  request: {
    body: {
      content: {
        "application/json": { schema: CreatePlayerBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Player created",
      content: {
        "application/json": { schema: PlayerSchema },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    409: {
      description: "Player with this nickname already exists",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    500: {
      description: "Failed to create player",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

const PlayerIdParamSchema = z.object({ playerId: z.string().openapi({ description: "Player ID" }) }).openapi("PlayerIdParam");

const TournamentStructureIdParamSchema = z.object({ id: z.string().openapi({ description: "Structure ID" }) }).openapi("TournamentStructureIdParam");
const TournamentIdParamSchema = z.object({ id: z.string().openapi({ description: "Tournament ID" }) }).openapi("TournamentIdParam");

openApiRegistry.registerPath({
  method: "get",
  path: "/api/tournament-structures",
  tags: ["Tournament Structures"],
  operationId: "listTournamentStructures",
  summary: "List structure templates",
  description: "Returns all saved tournament structure templates with optional offset/limit",
  request: {
    query: ListTournamentStructuresQuerySchema,
  },
  responses: {
    200: {
      description: "List of structures",
      content: {
        "application/json": { schema: ListTournamentStructuresResponseSchema },
      },
    },
    400: { description: "Invalid query params" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/tournament-structures",
  tags: ["Tournament Structures"],
  operationId: "createTournamentStructure",
  summary: "Create structure template",
  description: "Creates a tournament structure template in the database",
  request: {
    body: {
      content: {
        "application/json": { schema: MakeTournamentStructureBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Structure created",
      content: {
        "application/json": { schema: TournamentStructureResponseSchema },
      },
    },
    400: { description: "Invalid request body" },
    500: { description: "Failed to create structure" },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/tournament-structures/{id}",
  tags: ["Tournament Structures"],
  operationId: "updateTournamentStructure",
  summary: "Update structure template",
  description: "Updates a tournament structure template in the database",
  request: {
    params: TournamentStructureIdParamSchema,
    body: {
      content: {
        "application/json": { schema: MakeTournamentStructureBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Structure updated",
      content: {
        "application/json": { schema: TournamentStructureResponseSchema },
      },
    },
    400: { description: "Invalid request body" },
    404: { description: "Structure not found" },
    500: { description: "Failed to update structure" },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/api/tournaments",
  tags: ["Tournaments"],
  operationId: "listTournaments",
  summary: "List tournaments",
  description: "Returns all created tournaments with optional offset/limit",
  request: {
    query: ListTournamentsQuerySchema,
  },
  responses: {
    200: {
      description: "List of tournaments",
      content: {
        "application/json": { schema: ListTournamentsResponseSchema },
      },
    },
    400: { description: "Invalid query params" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/tournaments",
  tags: ["Tournaments"],
  operationId: "createTournament",
  summary: "Create tournament",
  description: "Creates a tournament in the database and stores its structure in Redis cache",
  request: {
    body: {
      content: {
        "application/json": { schema: MakeTournamentBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Tournament created",
      content: {
        "application/json": { schema: TournamentResponseSchema },
      },
    },
    400: { description: "Invalid request body" },
    500: { description: "Failed to create tournament" },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/api/tournaments/{id}",
  tags: ["Tournaments"],
  operationId: "getTournament",
  summary: "Get tournament by ID",
  description: "Returns tournament with its structure from cache (structure may be null if not set)",
  request: {
    params: TournamentIdParamSchema,
  },
  responses: {
    200: {
      description: "Tournament with structure",
      content: {
        "application/json": { schema: TournamentWithStructureResponseSchema },
      },
    },
    404: { description: "Tournament not found" },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/tournaments/{id}",
  tags: ["Tournaments"],
  operationId: "updateTournament",
  summary: "Update tournament",
  description: "Updates tournament name, date, and status",
  request: {
    params: TournamentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: UpdateTournamentBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Tournament updated",
      content: {
        "application/json": { schema: TournamentResponseSchema },
      },
    },
    400: { description: "Invalid request body or status" },
    404: { description: "Tournament not found" },
    500: { description: "Failed to update tournament" },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/tournaments/{id}/status",
  tags: ["Tournaments"],
  operationId: "updateTournamentStatus",
  summary: "Update tournament status",
  description: "Updates only the tournament status",
  request: {
    params: TournamentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: UpdateTournamentStatusBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Tournament status updated",
      content: {
        "application/json": { schema: TournamentResponseSchema },
      },
    },
    400: { description: "Invalid status" },
    404: { description: "Tournament not found" },
    500: { description: "Failed to update status" },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/tournaments/{id}/structure",
  tags: ["Tournaments"],
  operationId: "updateTournamentStructureCache",
  summary: "Update tournament structure",
  description: "Updates the linked structure for a tournament in Redis cache only",
  request: {
    params: TournamentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: MakeTournamentStructureBodySchema },
      },
    },
  },
  responses: {
    204: { description: "Structure updated" },
    400: { description: "Invalid request body" },
    404: { description: "Tournament not found" },
    500: { description: "Failed to update structure" },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/api/players/{playerId}",
  tags: ["Players"],
  operationId: "getPlayer",
  summary: "Get player by ID",
  description: "Returns player by id including freeEntryCount and freeReentryCount.",
  request: {
    params: PlayerIdParamSchema,
  },
  responses: {
    200: {
      description: "Player",
      content: {
        "application/json": { schema: PlayerSchema },
      },
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/players/{playerId}",
  tags: ["Players"],
  operationId: "updatePlayer",
  summary: "Update player",
  description: "Updates player fields by id. Only provided fields are updated. At least one field required.",
  request: {
    params: PlayerIdParamSchema,
    body: {
      content: {
        "application/json": { schema: UpdatePlayerBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Player updated",
      content: {
        "application/json": { schema: PlayerSchema },
      },
    },
    400: {
      description: "Invalid request body or empty nickname",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    409: {
      description: "Player with this nickname already exists",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/players/{playerId}/free-entries",
  tags: ["Players"],
  operationId: "updatePlayerFreeEntries",
  summary: "Update free entry count",
  description: "Add or subtract free entries for the player. Body: { delta: number }. Result is clamped to 0 (cannot go negative).",
  request: {
    params: PlayerIdParamSchema,
    body: {
      content: {
        "application/json": { schema: FreeCountDeltaBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Free entry count updated",
      content: {
        "application/json": { schema: FreeEntryCountResponseSchema },
      },
    },
    400: {
      description: "Invalid body (delta required and must be a number)",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/players/{playerId}/free-reentries",
  tags: ["Players"],
  operationId: "updatePlayerFreeReentries",
  summary: "Update free reentry count",
  description: "Add or subtract free reentries for the player. Body: { delta: number }. Result is clamped to 0. Also syncs freeReentryCount in all tournament states for this player.",
  request: {
    params: PlayerIdParamSchema,
    body: {
      content: {
        "application/json": { schema: FreeCountDeltaBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Free reentry count updated",
      content: {
        "application/json": { schema: FreeReentryCountResponseSchema },
      },
    },
    400: {
      description: "Invalid body (delta required and must be a number)",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}`,
  tags: ["Tournament Players"],
  operationId: "addPlayerToTournament",
  summary: "Add player to tournament",
  description: "Adds a player to a tournament and returns the initial in-game state. EarlyBird is applied via POST .../game-start with EarlyBirdFlag, not at registration.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: AddPlayerToTournamentBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Player added successfully",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    500: {
      description: "Failed to add player to tournament",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "delete",
  path: `${basePath}/players/{playerId}`,
  tags: ["Tournament Players"],
  operationId: "removePlayerFromTournament",
  summary: "Remove player from tournament",
  description: "Removes a player from a tournament (deletes their in-game state)",
  request: {
    params: TournamentPlayerParamsSchema,
  },
  responses: {
    204: {
      description: "Player removed successfully",
    },
    404: {
      description: "Player not found in tournament",
    },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: `${basePath}/players/{playerId}`,
  tags: ["Tournament Players"],
  operationId: "getPlayerState",
  summary: "Get player state",
  description: "Returns the in-game state for a player in a tournament",
  request: {
    params: TournamentPlayerParamsSchema,
  },
  responses: {
    200: {
      description: "Player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/bounty/eliminate`,
  tags: ["Tournament Players"],
  operationId: "recordBountyElimination",
  summary: "Record bounty elimination",
  description:
    "Records who eliminated whom. If type=Rebuy: adds reentry to eliminated player. If type=Out: sets status Out. If burnedStack=false (default): killerPlayerId required, adds bounty to killer, stores kill record. If burnedStack=true: killerPlayerId optional, only rebuy/Out, no bounty recorded.",
  request: {
    params: TournamentParamsSchema,
    body: {
      content: {
        "application/json": { schema: BountyEliminateBodySchema },
      },
    },
  },
  responses: {
    204: {
      description: "Elimination recorded successfully",
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Eliminated or killer player not found in tournament",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/bounty/remove`,
  tags: ["Tournament Players"],
  operationId: "removeBounty",
  summary: "Remove bounty",
  description:
    "Undoes an elimination: removes victim from killer's list, decreases killer's bountyCount by 1, decreases victim's totalReentryCount by 1",
  request: {
    params: TournamentParamsSchema,
    body: {
      content: {
        "application/json": { schema: BountyRemoveBodySchema },
      },
    },
  },
  responses: {
    204: {
      description: "Bounty removed successfully",
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Kill record or player not found",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/bounty/update`,
  tags: ["Tournament Players"],
  operationId: "updateBountyCount",
  summary: "Update bounty count",
  description: "Adds bounty count to a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: BountyCountBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: `${basePath}/rebuy-count`,
  tags: ["Tournament Players"],
  operationId: "getTotalRebuyCount",
  summary: "Get total rebuy count",
  description: "Returns the total number of rebuys for a tournament",
  request: {
    params: TournamentParamsSchema,
  },
  responses: {
    200: {
      description: "Total rebuy count for the tournament",
      content: {
        "application/json": { schema: RebuyCountResponseSchema },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: `${basePath}/cash-desk`,
  tags: ["Tournament Players"],
  operationId: "getCashDesk",
  summary: "Get cash desk",
  description: "Returns cash desk summary for tournament: cash, card, free, grand total with entries and rebuys",
  request: {
    params: TournamentParamsSchema,
  },
  responses: {
    200: {
      description: "Cash desk summary",
      content: {
        "application/json": { schema: CashDeskResponseSchema },
      },
    },
    404: { description: "Tournament not found" },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: `${basePath}/players`,
  tags: ["Tournament Players"],
  operationId: "listPlayers",
  summary: "List players in tournament",
  description: "Returns all in-game player states for a tournament",
  request: {
    params: TournamentParamsSchema,
  },
  responses: {
    200: {
      description: "List of player states",
      content: {
        "application/json": {
          schema: z.array(InGameUserStateSchema),
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/reentry`,
  tags: ["Tournament Players"],
  operationId: "addReentryCount",
  summary: "Add re-entry count",
  description: "Adds re-entry count to a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: ReentryCountBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/game-start`,
  tags: ["Tournament Players"],
  operationId: "playerGameStart",
  summary: "Player game start",
  description:
    "Transitions player from Registered to InGamePaid (if entry payment provided) or InGameNotPaid (if not). Updates entry payment method and table if provided. Optional EarlyBirdFlag: if true, adds EarlyBird bonus after success.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: PlayerGameStartBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state (includes bonuses if EarlyBirdFlag was applied)",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description:
        "Player must be in Registered status, or table has too many players (max 10)",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: { type: "string" },
              detail: { type: "string" },
            },
          },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/rollback-game-start`,
  tags: ["Tournament Players"],
  operationId: "rollbackGameStart",
  summary: "Rollback game start",
  description:
    "Reverts player to Registered status, clears entry payment method and table",
  request: {
    params: TournamentPlayerParamsSchema,
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/in-game-payment`,
  tags: ["Tournament Players"],
  operationId: "inGamePayment",
  summary: "In-game payment",
  description:
    "Updates entry payment method. Allowed when player is InGameNotPaid (then transitions to InGamePaid) or Out (e.g. eliminated but unpaid; only updates payment, status stays Out).",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: EntryPaymentBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid body or player must be in InGameNotPaid or Out status",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/entry-payment`,
  tags: ["Tournament Players"],
  operationId: "updateEntryPaymentMethod",
  summary: "Update entry payment method",
  description: "Sets the entry payment method for a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: EntryPaymentBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid entry payment method",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "delete",
  path: `${basePath}/players/{playerId}/table`,
  tags: ["Tournament Players"],
  operationId: "removePlayerFromTable",
  summary: "Remove player from table",
  description: "Removes a player from their current table (sets tableId to null)",
  request: {
    params: TournamentPlayerParamsSchema,
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/table`,
  tags: ["Tournament Players"],
  operationId: "updatePlayerTable",
  summary: "Update player table",
  description: "Updates the table ID assigned to a player. Pass null or empty string to clear.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: TableIdBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description:
        "Invalid request body, or table has too many players (max 10)",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: { type: "string" },
              detail: { type: "string" },
            },
          },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/reentry-payment`,
  tags: ["Tournament Players"],
  operationId: "addReentryPayments",
  summary: "Add re-entry payments",
  description: "Adds re-entry payment methods for a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: ReentryPaymentBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid payment methods",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});
