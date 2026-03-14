import { z } from "zod";

/** In-game player status enum */
export const InGamePlayerStatusSchema = z
  .enum([
    "Registered",
    "InGamePaid",
    "InGameNotPaid",
    "Out",
  ])
  .openapi("InGamePlayerStatus");

/** Entry payment method enum */
export const EntryPaymentMethodSchema = z
  .enum(["Cache", "CreditCard", "Free"])
  .openapi("EntryPaymentMethod");

/** In-game bonus enum */
export const InGameBonusSchema = z
  .enum(["EarlyBird", "Hookah", "Diller"])
  .openapi("InGameBonus");

/** In-game user state */
export const InGameUserStateSchema = z
  .object({
    tournamentPlayerId: z
      .number()
      .openapi({ description: "Player ID within tournament, starts at 1", example: 1 }),
    playerId: z.string().openapi({ description: "Player ID", example: "player-123" }),
    playerName: z
      .string()
      .nullable()
      .openapi({ description: "Player name from Postgres players table", example: "john_doe" }),
    status: InGamePlayerStatusSchema,
    tableId: z.string().nullable().openapi({ description: "Table ID", example: "table-1" }),
    bountyCount: z.number().openapi({ description: "Bounty count", example: 0 }),
    entryPaymentMethod: EntryPaymentMethodSchema.nullable(),
    reentryByPaymentMethod: z
      .array(EntryPaymentMethodSchema)
      .nullable()
      .openapi({
        description: "Re-entry payments as flat list, e.g. [\"Cache\", \"Cache\", \"CreditCard\"]",
        example: ["Cache", "Cache", "CreditCard"],
      }),
    totalReentryCount: z.number().openapi({ description: "Total re-entry count", example: 0 }),
    unpaidReentryCount: z
      .number()
      .openapi({ description: "Re-entries not yet paid (total minus Cache+CreditCard)", example: 0 }),
    freeEntryCount: z.number().openapi({ description: "Free entry count", example: 0 }),
    freeReentryCount: z.number().openapi({ description: "Free re-entry count", example: 0 }),
    placement: z.number().nullable().openapi({ description: "Placement position" }),
    bonuses: z
      .array(InGameBonusSchema)
      .nullable()
      .openapi({
        description: "Bonuses as flat list, e.g. [\"EarlyBird\", \"EarlyBird\", \"Diller\"]",
        example: ["EarlyBird", "EarlyBird", "Diller"],
      }),
    bountyKills: z
      .array(z.string())
      .optional()
      .openapi({
        description: "List of player IDs this player eliminated (only in list endpoint)",
        example: ["123", "456"],
      }),
    eliminatedBy: z
      .array(z.string())
      .optional()
      .openapi({
        description: "List of player IDs who eliminated this player (only in list endpoint)",
        example: ["456"],
      }),
    signAgreement: z
      .boolean()
      .optional()
      .openapi({
        description: "Whether player signed agreement (only in list endpoint)",
        example: true,
      }),
  })
  .openapi("InGameUserState");

/** Path params for tournament and player */
export const TournamentPlayerParamsSchema = z
  .object({
    tournamentId: z.string().openapi({ description: "Tournament ID", example: "tournament-1" }),
    playerId: z.string().openapi({ description: "Player ID", example: "player-123" }),
  })
  .openapi("TournamentPlayerParams");

/** Path params for tournament only */
export const TournamentParamsSchema = z
  .object({
    tournamentId: z.string().openapi({ description: "Tournament ID", example: "tournament-1" }),
  })
  .openapi("TournamentParams");

/** Response: total rebuy count for tournament */
export const RebuyCountResponseSchema = z
  .object({
    rebuyCount: z
      .number()
      .openapi({ description: "Total rebuy count for tournament", example: 42 }),
  })
  .openapi("RebuyCountResponse");

/** Bounty elimination type enum */
export const BountyEliminationTypeSchema = z
  .enum(["Rebuy", "Out"])
  .openapi("BountyEliminationType");

/** Request body: remove bounty */
export const BountyRemoveBodySchema = z
  .object({
    killerPlayerId: z
      .string()
      .openapi({ description: "Player from whom we take the bounty", example: "456" }),
    victimPlayerId: z
      .string()
      .openapi({ description: "Player to remove from killer's list (eliminated player)", example: "123" }),
  })
  .openapi("BountyRemoveBody");

/** Request body: record bounty elimination */
export const BountyEliminateBodySchema = z
  .object({
    eliminatedPlayerId: z
      .string()
      .openapi({ description: "Player who was eliminated", example: "123" }),
    killerPlayerId: z
      .string()
      .openapi({ description: "Player who made the elimination", example: "456" }),
    type: BountyEliminationTypeSchema.openapi({
      description: "Rebuy = eliminated gets reentry, Out = no reentry",
      example: "Rebuy",
    }),
  })
  .openapi("BountyEliminateBody");

/** Request body: add bounty count */
export const BountyCountBodySchema = z
  .object({
    bountyCountToAdd: z.number().openapi({ description: "Bounty count to add", example: 1 }),
  })
  .openapi("BountyCountBody");

/** Request body: re-entry count */
export const ReentryCountBodySchema = z
  .object({
    count: z.number().openapi({ description: "Re-entry count to add", example: 1 }),
  })
  .openapi("ReentryCountBody");

/** Request body: entry payment method */
export const EntryPaymentBodySchema = z
  .object({
    entryPaymentMethod: EntryPaymentMethodSchema,
  })
  .openapi("EntryPaymentBody");

/** Request body: player game start (optional entry payment, optional table) */
export const PlayerGameStartBodySchema = z
  .object({
    entryPaymentMethod: EntryPaymentMethodSchema.optional().openapi({
      description: "If provided: sets payment method and status InGamePaid. If omitted: status InGameNotPaid",
      example: "Cache",
    }),
    tableId: z
      .string()
      .optional()
      .openapi({ description: "If provided: assigns player to this table", example: "table-1" }),
  })
  .openapi("PlayerGameStartBody");

/** Request body: update table ID */
export const TableIdBodySchema = z
  .object({
    tableId: z
      .string()
      .nullable()
      .openapi({ description: "Table ID; null or empty string to clear", example: "table-1" }),
  })
  .openapi("TableIdBody");

/** Request body: re-entry payments */
export const ReentryPaymentBodySchema = z
  .object({
    payments: z
      .array(EntryPaymentMethodSchema)
      .openapi({ description: "Payment methods for re-entry", example: ["Cache", "CreditCard"] }),
  })
  .openapi("ReentryPaymentBody");

/** Request body: create player */
export const CreatePlayerBodySchema = z
  .object({
    nickname: z.string().min(1).openapi({ description: "Player nickname", example: "john_doe" }),
    name: z.string().nullable().optional().openapi({ description: "Player name" }),
    phone: z.string().nullable().optional().openapi({ description: "Phone number" }),
    tg: z.string().nullable().optional().openapi({ description: "Telegram" }),
    notes: z.string().nullable().optional().openapi({ description: "Notes" }),
    sign_agreement: z.boolean().optional().openapi({ description: "Whether player signed agreement" }),
  })
  .openapi("CreatePlayerBody");

/** Request body: update player (all fields optional) */
export const UpdatePlayerBodySchema = z
  .object({
    nickname: z.string().min(1).optional().openapi({ description: "Player nickname" }),
    name: z.string().nullable().optional().openapi({ description: "Player name" }),
    phone: z.string().nullable().optional().openapi({ description: "Phone number" }),
    tg: z.string().nullable().optional().openapi({ description: "Telegram" }),
    notes: z.string().nullable().optional().openapi({ description: "Notes" }),
    sign_agreement: z.boolean().optional().openapi({ description: "Whether player signed agreement" }),
  })
  .openapi("UpdatePlayerBody");

/** Player response */
export const PlayerSchema = z
  .object({
    id: z.number().openapi({ description: "Player ID", example: 1 }),
    nickname: z.string().openapi({ description: "Nickname", example: "john_doe" }),
    name: z.string().nullable().openapi({ description: "Name" }),
    phone: z.string().nullable().openapi({ description: "Phone" }),
    tg: z.string().nullable().openapi({ description: "Telegram" }),
    notes: z.string().nullable().openapi({ description: "Notes" }),
    signAgreement: z.boolean().openapi({ description: "Whether player signed agreement" }),
    createdAt: z.string().openapi({ description: "Created at ISO8601", example: "2026-03-13T12:00:00.000Z" }),
  })
  .openapi("Player");

/** List players response */
export const ListPlayersResponseSchema = z
  .object({
    players: z.array(PlayerSchema).openapi({ description: "List of players" }),
  })
  .openapi("ListPlayersResponse");

/** List players query params */
export const ListPlayersQuerySchema = z
  .object({
    offset: z.string().optional().openapi({ description: "Number of players to skip (non-negative integer)", example: "0" }),
    limit: z.string().optional().openapi({ description: "Max players to return, 1-1000 (default 100)", example: "20" }),
  })
  .openapi("ListPlayersQuery");

/** Blind level in structure */
export const BlindSchema = z
  .object({
    type: z.literal("Blind"),
    level: z.number(),
    id: z.number(),
    smallBlind: z.number(),
    bigBlind: z.number(),
    ante: z.boolean(),
    duration: z.number(),
  })
  .openapi("Blind");

/** Break between blind levels */
export const BreakSchema = z
  .object({
    type: z.literal("Break"),
    id: z.number(),
    duration: z.number(),
  })
  .openapi("Break");

/** Blind or Break */
export const BlindTypeSchema = z.union([BlindSchema, BreakSchema]).openapi("BlindType");

/** Request body: create/update tournament structure */
export const MakeTournamentStructureBodySchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Structure name" }),
    playersLimit: z.number().min(1).openapi({ description: "Max players" }),
    stackSize: z.number().min(1).openapi({ description: "Starting stack in chips" }),
    freezeOutEnabled: z.boolean().openapi({ description: "Freeze-out mode" }),
    blinds: z.array(BlindTypeSchema).openapi({ description: "Blinds and breaks" }),
  })
  .openapi("MakeTournamentStructureBody");

/** Request body: create tournament */
export const MakeTournamentBodySchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Tournament name" }),
    date: z.number().min(0).openapi({ description: "Unix timestamp" }),
    structure: MakeTournamentStructureBodySchema,
  })
  .openapi("MakeTournamentBody");

/** Response: tournament structure */
export const TournamentStructureResponseSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    playersLimit: z.number(),
    stackSize: z.number(),
    freezeOutEnabled: z.boolean(),
    blindsStructure: z.array(BlindTypeSchema),
  })
  .openapi("TournamentStructureResponse");

/** Response: tournament (created) */
export const TournamentResponseSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    date: z.number(),
  })
  .openapi("TournamentResponse");

/** Structure without id (from cache) */
const TournamentStructureDataSchema = z
  .object({
    name: z.string(),
    playersLimit: z.number(),
    stackSize: z.number(),
    freezeOutEnabled: z.boolean(),
    blindsStructure: z.array(BlindTypeSchema),
  })
  .openapi("TournamentStructureData");

/** Response: tournament with structure (get by id) */
export const TournamentWithStructureResponseSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    date: z.number(),
    structure: TournamentStructureDataSchema.nullable(),
  })
  .openapi("TournamentWithStructureResponse");

/** List structures query params */
export const ListTournamentStructuresQuerySchema = z
  .object({
    offset: z.string().optional().openapi({ description: "Skip N structures", example: "0" }),
    limit: z.string().optional().openapi({ description: "Max structures to return (1-1000)", example: "20" }),
  })
  .openapi("ListTournamentStructuresQuery");

/** List structures response */
export const ListTournamentStructuresResponseSchema = z
  .object({
    structures: z.array(TournamentStructureResponseSchema),
  })
  .openapi("ListTournamentStructuresResponse");

/** List tournaments query params */
export const ListTournamentsQuerySchema = z
  .object({
    offset: z.string().optional().openapi({ description: "Skip N tournaments", example: "0" }),
    limit: z.string().optional().openapi({ description: "Max tournaments to return (1-1000)", example: "20" }),
  })
  .openapi("ListTournamentsQuery");

/** List tournaments response */
export const ListTournamentsResponseSchema = z
  .object({
    tournaments: z.array(TournamentResponseSchema),
  })
  .openapi("ListTournamentsResponse");

/** Tournament status enum */
export const TournamentStatusSchema = z
  .enum(["registration_open", "in_progress", "completed"])
  .openapi("TournamentStatus");

/** Request body: update tournament */
export const UpdateTournamentBodySchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Tournament name" }),
    date: z.number().min(0).openapi({ description: "Unix timestamp" }),
    status: TournamentStatusSchema.openapi({ description: "Tournament status" }),
  })
  .openapi("UpdateTournamentBody");

/** Request body: update tournament status only */
export const UpdateTournamentStatusBodySchema = z
  .object({
    status: TournamentStatusSchema.openapi({ description: "Tournament status" }),
  })
  .openapi("UpdateTournamentStatusBody");
