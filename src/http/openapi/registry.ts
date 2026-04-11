import { z } from "zod";
import {
  AuthChangePasswordBodySchema,
  AuthLoginBodySchema,
  AuthMeResponseSchema,
  AuthSetupBodySchema,
  AuthUserResponseSchema,
  AddPlayerToTournamentBodySchema,
  BonusMutationBodySchema,
  BountyCountBodySchema,
  BountyRemoveBodySchema,
  BountyEliminateBodySchema,
  BountyEliminateResponseSchema,
  BountyEliminateUndoBodySchema,
  CashDeskResponseSchema,
  RebuyBurnedStackUndoBodySchema,
  CreatePlayerBodySchema,
  CustomBonusChipsBodySchema,
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
  PatchTournamentClockBodySchema,
  PlayerGameStartBodySchema,
  RatingManualAdjustmentBodySchema,
  PlayerSchema,
  RebuyCountResponseSchema,
  TournamentChipPoolSummarySchema,
  ReentryCountBodySchema,
  ReentryPaymentBodySchema,
  TableIdBodySchema,
  TournamentParamsSchema,
  TournamentPlayerParamsSchema,
  TournamentResponseSchema,
  TournamentStructureResponseSchema,
  TournamentClockTickSchema,
  TournamentRatingMatrixResponseSchema,
  TournamentWithStructureResponseSchema,
  UpdatePlayerBodySchema,
  UpdateTournamentBodySchema,
  UpdateTournamentStatusBodySchema,
} from "./schemas";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const openApiRegistry = new OpenAPIRegistry();

// ── Auth ──────────────────────────────────────────────────────────────────────

openApiRegistry.registerPath({
  method: "post",
  path: "/api/auth/setup",
  tags: ["Auth"],
  operationId: "authSetup",
  summary: "Create first admin user",
  description: "One-time setup endpoint. Creates the first admin user. Returns 409 if an admin user already exists.",
  request: {
    body: {
      content: { "application/json": { schema: AuthSetupBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Admin user created",
      content: { "application/json": { schema: AuthUserResponseSchema } },
    },
    400: { description: "Validation error (missing fields or password too short)" },
    409: { description: "Admin user already exists" },
    415: { description: "Content-Type must be application/json" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  operationId: "authLogin",
  summary: "Login",
  description: "Authenticates admin user. On success sets an httpOnly session cookie (admin_session / __Host-admin_session in production).",
  request: {
    body: {
      content: { "application/json": { schema: AuthLoginBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Login successful. Set-Cookie header contains session cookie.",
      content: { "application/json": { schema: AuthUserResponseSchema } },
    },
    400: { description: "Missing or invalid fields" },
    401: { description: "Invalid credentials" },
    415: { description: "Content-Type must be application/json" },
    429: { description: "Too many login attempts. Retry-After: 900" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  tags: ["Auth"],
  operationId: "authLogout",
  summary: "Logout",
  description: "Invalidates the current session and clears the session cookie. Requires valid session cookie.",
  responses: {
    204: { description: "Session invalidated" },
    401: { description: "Not authenticated" },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/api/auth/me",
  tags: ["Auth"],
  operationId: "authMe",
  summary: "Get current user",
  description: "Returns the currently authenticated admin user. Requires valid session cookie.",
  responses: {
    200: {
      description: "Current user",
      content: { "application/json": { schema: AuthMeResponseSchema } },
    },
    401: { description: "Not authenticated" },
    404: { description: "User not found" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/auth/change-password",
  tags: ["Auth"],
  operationId: "authChangePassword",
  summary: "Change password",
  description: "Changes the admin password. Invalidates all existing sessions (including the current one). Requires valid session cookie.",
  request: {
    body: {
      content: { "application/json": { schema: AuthChangePasswordBodySchema } },
    },
  },
  responses: {
    204: { description: "Password changed. All sessions invalidated." },
    400: { description: "Invalid current password or new password too short" },
    401: { description: "Not authenticated" },
    415: { description: "Content-Type must be application/json" },
  },
});

// ── Tournaments ───────────────────────────────────────────────────────────────

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

const TournamentRatingPlayerParamsSchema = z
  .object({
    id: z.string().openapi({ description: "Tournament ID" }),
    playerId: z.string().openapi({ description: "Player ID" }),
  })
  .openapi("TournamentRatingPlayerParams");

openApiRegistry.registerPath({
  method: "get",
  path: "/api/tournament-rating-matrix",
  tags: ["Tournaments"],
  operationId: "getTournamentRatingMatrix",
  summary: "Base rating points matrix",
  description:
    "Read-only table: columns = participant count ranges 20–21 … 70–71, rows = finishing place 1–35. Same data as used for rating calculation.",
  responses: {
    200: {
      description: "Matrix for admin display",
      content: {
        "application/json": { schema: TournamentRatingMatrixResponseSchema },
      },
    },
  },
});

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
  method: "patch",
  path: "/api/tournaments/{id}/players/{playerId}/rating-manual-adjustment",
  tags: ["Tournaments"],
  operationId: "patchTournamentPlayerRatingManualAdjustment",
  summary: "Manual rating adjustment",
  description:
    "Sets additive manual rating points for a player in tournament results. Allowed only when tournament status is completed.",
  request: {
    params: TournamentRatingPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: RatingManualAdjustmentBodySchema },
      },
    },
  },
  responses: {
    204: { description: "Updated" },
    400: { description: "Invalid body" },
    404: { description: "Tournament not found or player not in results" },
    409: { description: "Tournament not completed" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/tournaments",
  tags: ["Tournaments"],
  operationId: "createTournament",
  summary: "Create tournament",
  description:
    "Creates a tournament in the database and stores its structure in Redis cache. Optional ratingGuaranteeEnabled and coefficient fields default to false and 1.",
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
  description:
    "Returns tournament with its structure from cache (structure may be null if not set). Structure includes maxReentries, allowedReentryCount, and entryFreeOnly when present.",
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
  description:
    "Updates tournament name, date, status, and optionally rating guarantee / coefficients (omit rating fields to leave unchanged)",
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
  path: "/api/tournaments/{id}/clock",
  tags: ["Tournament clock"],
  operationId: "getTournamentClockTick",
  summary: "Current tournament blind clock snapshot",
  description:
    "Returns the same JSON shape as WebSocket ticks (one-shot). For live updates use WebSocket `/ws/tournaments/{id}/clock`.",
  request: {
    params: TournamentIdParamSchema,
  },
  responses: {
    200: {
      description: "Current clock tick",
      content: {
        "application/json": { schema: TournamentClockTickSchema },
      },
    },
    404: { description: "Tournament not found" },
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/api/tournaments/{id}/clock",
  tags: ["Tournament clock"],
  operationId: "patchTournamentClock",
  summary: "Pause, resume, or extend current blind clock",
  description:
    "Updates tournament blind clock in Redis: pause freezes countdown and blocks blind/break stepping until resume; resume shifts segment end; extendCurrentLevelSec adds seconds to the current step. Requires tournament in_progress and existing clock state (after first in_progress). Background ~1 Hz `getTick` runs only for DB `in_progress` (Redis advances when not paused; no stepping during pause). WebSocket `/ws/tournaments/{tournamentId}/clock` streams the same `TournamentClockTick` JSON (~1 Hz + snapshot on connect; other statuses for subscribers get inactive ticks).",
  request: {
    params: TournamentIdParamSchema,
    body: {
      content: {
        "application/json": { schema: PatchTournamentClockBodySchema },
      },
    },
  },
  responses: {
    204: { description: "Clock updated" },
    400: {
      description: "Invalid body or bad request for current clock state",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: { description: "Tournament not found" },
    500: { description: "Failed to persist clock" },
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
  description:
    "Add or subtract free entries for the player. Body: { delta: number }. Result is clamped to 0 (cannot go negative). Also syncs freeEntryCount in all tournament states for this player.",
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
    "Elimination / bounty. type=Rebuy: adds reentry count (rejected with 400 if tournament is freeze-out or player would exceed allowedReentryCount); type=Out: status Out + placement. burnedStack=false: killerPlayerIds required (min 1); one full bounty is split 1/N across listed killers (fractional bountyCount). burnedStack=true: killerPlayerIds may be empty; no bounty; burnedChips required. Stores an event; use eventId with POST .../bounty/eliminate/undo for full rollback.",
  request: {
    params: TournamentParamsSchema,
    body: {
      content: {
        "application/json": { schema: BountyEliminateBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Elimination recorded; save eventId for undo",
      content: {
        "application/json": { schema: BountyEliminateResponseSchema },
      },
    },
    400: {
      description:
        "Invalid request body, reentries_not_allowed (freeze-out), or reentry_limit_reached (structure max)",
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
    500: {
      description: "Failed to persist elimination event after applying state",
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
  path: `${basePath}/bounty/eliminate/undo`,
  tags: ["Tournament Players"],
  operationId: "undoBountyElimination",
  summary: "Undo bounty elimination",
  description:
    "Fully reverses one POST .../bounty/eliminate using the returned eventId: bounty shares, kill lists, burned stack if any, Rebuy reentry or Out+placement.",
  request: {
    params: TournamentParamsSchema,
    body: {
      content: {
        "application/json": { schema: BountyEliminateUndoBodySchema },
      },
    },
  },
  responses: {
    204: { description: "Undo applied" },
    400: {
      description: "Cannot undo (validation failed)",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Event or victim not found",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    409: {
      description: "Conflict with current player state (e.g. victim no longer Out)",
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
  path: `${basePath}/bounty/rebuy-burned-stack/undo`,
  tags: ["Tournament Players"],
  operationId: "undoRebuyBurnedStack",
  summary: "Undo rebuy with burned stack",
  description:
    "Removes the last burnedStackEvents entry with source=Rebuy and chips=burnedChips (LIFO if the same chips appear multiple times), then decrements totalReentryCount by 1. Out-sourced burns are never removed by this call. Active tournaments only.",
  request: {
    params: TournamentParamsSchema,
    body: {
      content: {
        "application/json": { schema: RebuyBurnedStackUndoBodySchema },
      },
    },
  },
  responses: {
    204: { description: "Undo applied" },
    400: {
      description: "Invalid body or no matching Rebuy burn / cannot decrement reentry",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not in tournament",
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
  method: "post",
  path: `${basePath}/players/{playerId}/bounty/remove`,
  tags: ["Tournament Players"],
  operationId: "removeBountyAndOrReentry",
  summary: "Remove bounty and/or re-entry count (admin)",
  description:
    "Subtracts bountyCount and/or totalReentryCount for corrections. Does not modify bountyKills, elimination event history, or reentryByPaymentMethod. If recorded re-entry payments sum equals totalReentryCount, decrease payments first or the request returns 409. Full consistency with eliminations: use POST .../bounty/eliminate/undo with eventId.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: BountyRemoveBodySchema },
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
      description: "Invalid request body (missing or invalid deltas)",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not in tournament",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    409: {
      description:
        "Would make bountyCount or totalReentryCount inconsistent (e.g. bounty too low, or re-entries below recorded payments)",
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
  path: `${basePath}/players/{playerId}/bonuses`,
  tags: ["Tournament Players"],
  operationId: "addPlayerBonusOne",
  summary: "Add one in-game bonus instance",
  description:
    "Increments the count for the given bonus on the player's tournament state. Custom chips: POST .../bonuses/custom.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: BonusMutationBodySchema },
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
      description: "Invalid bonus or body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not in tournament (no state)",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/bonuses/remove`,
  tags: ["Tournament Players"],
  operationId: "removePlayerBonusOne",
  summary: "Remove one in-game bonus instance",
  description:
    "Decrements the count for the given bonus by one. If several instances exist, only one is removed.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: BonusMutationBodySchema },
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
      description: "Invalid bonus or body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "No state or bonus count already zero",
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
  path: `${basePath}/players/{playerId}/bonuses/custom`,
  tags: ["Tournament Players"],
  operationId: "addPlayerCustomBonusChips",
  summary: "Add custom bonus chips",
  description:
    "Appends one grant with the given chip amount to customBonusChips (variable-size bonus).",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: CustomBonusChipsBodySchema },
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
      description: "Invalid body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: { description: "Player not in tournament" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/bonuses/custom/remove`,
  tags: ["Tournament Players"],
  operationId: "removePlayerCustomBonusChipsOne",
  summary: "Remove one custom bonus grant",
  description:
    "Removes one entry equal to chips, searching from the end of customBonusChips.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: CustomBonusChipsBodySchema },
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
      description: "Invalid body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "No state or no matching custom grant",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
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
  path: `${basePath}/chip-pool-summary`,
  tags: ["Tournament Players"],
  operationId: "getTournamentChipPoolSummary",
  summary: "Chip pool and player summary",
  description:
    "Arrived/active counts, rebuys, stackSize, baseChips (entries+rebuys × stack), bonus breakdown (non-Registered), burnedStackChipsTotal (sum of players' burned stacks), totalChips = baseChips + bonusChipsTotal − burnedStackChipsTotal (min 0). averageStack = totalChips ÷ playersActive. Completed tournaments need stackSize on cash snapshot.",
  request: {
    params: TournamentParamsSchema,
  },
  responses: {
    200: {
      description: "Chip pool summary",
      content: {
        "application/json": { schema: TournamentChipPoolSummarySchema },
      },
    },
    404: {
      description: "Tournament not found or live tournament has no cached structure",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    422: {
      description: "Completed tournament: stack size missing from cash snapshot",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
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
  description:
    "Returns all in-game player states for a tournament. Each item includes allowedReentryCount (0 if freeze-out, else structure maxReentries, default 5). For live tournaments, eliminated (Out) players include `rating` frozen at elimination; it is recalculated when placements shift (e.g. return-to-game). For completed tournaments, responses use DB `rating_persisted` plus manual adjustment.",
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
  description:
    "Adds re-entry count to a player. Returns 400 with error reentries_not_allowed (freeze-out) or reentry_limit_reached (exceeds structure maxReentries) when the tournament structure is present in cache.",
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
      description:
        "Invalid request body, reentries_not_allowed, or reentry_limit_reached",
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
    "Transitions player from Registered to InGamePaid (if entry payment provided) or InGameNotPaid (if not). Updates entry payment method and table if provided. Optional entryPaidAmount: actual charge when recording a paid method (0–entry_price); if omitted, server uses tournament entry_price. Optional EarlyBirdFlag: if true, adds EarlyBird bonus after success.",
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
        "Player must be in Registered status, invalid entryPaidAmount, insufficient free entries for Free, or table has too many players (max 10)",
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
  path: "/v2/api/tournaments/{tournamentId}/players/{playerId}/return-to-game",
  tags: ["Tournament Players"],
  operationId: "returnPlayerToGame",
  summary: "Return busted player to game",
  description:
    "Return busted player (Out) to in-game without a table: status InGamePaid or InGameNotPaid by entry payment, +1 unpaid rebuy, clear tableId and placement; placements of later bust-outs are decremented on the server. Returns 400 JSON { error: reentries_not_allowed | reentry_limit_reached } when re-entry is blocked.",
  request: {
    params: TournamentPlayerParamsSchema,
  },
  responses: {
    200: {
      description: "Updated player state for the returning player",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description:
        "Invalid status (plain text), re-entry blocked (JSON error: reentries_not_allowed | reentry_limit_reached), or other business rules",
      content: {
        "text/plain": {
          schema: z.string(),
        },
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    404: {
      description: "Player not found in tournament",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Update failed",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
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
    "Updates entry payment method. InGameNotPaid: transitions to InGamePaid after recording payment. InGamePaid: correction only (e.g. CreditCard to Cache), status unchanged; optional entryPaidAmount. Out: records payment for eliminated unpaid player, status stays Out. Optional entryPaidAmount for discount; omit to keep stored amount or use tournament entry_price when first recording paid method.",
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
      description:
        "Invalid body, invalid entryPaidAmount, or player status not InGameNotPaid, InGamePaid, or Out",
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
  description:
    "Sets the entry payment method for a player. Optional entryPaidAmount when recording a paid method; omit to use tournament entry_price.",
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
      description: "Invalid entry payment method or entryPaidAmount",
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
  description:
    "Appends re-entry payment methods (one per new re-entry). Optional paidAmounts (same length as payments): per-slot charge 0–reentry_price (0 for Free). Omit paidAmounts to use full tournament reentry_price for non-Free methods.",
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
      description:
        "Invalid payment methods, paid amounts, length mismatch, or not enough free re-entry grants for requested Free payment(s)",
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
  method: "put",
  path: `${basePath}/players/{playerId}/reentry-payment`,
  tags: ["Tournament Players"],
  operationId: "setReentryPayments",
  summary: "Replace all re-entry payments",
  description:
    "Replaces the full list of re-entry payment methods; length must equal totalReentryCount. Optional paidAmounts (same length as payments). Omit paidAmounts to use full tournament reentry_price for each non-Free slot.",
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
      description:
        "Invalid payment methods, paid amounts, length mismatches, or not enough free re-entry grants for requested Free payment(s)",
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
