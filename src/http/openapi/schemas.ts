import { z } from "zod";

/** In-game player status enum */
export const InGamePlayerStatusSchema = z
  .enum([
    "Registered",
    "InGamePaid",
    "InGameNotPaid",
    "OutNotPaid",
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
  })
  .openapi("CreatePlayerBody");

/** Player response */
export const PlayerSchema = z
  .object({
    id: z.number().openapi({ description: "Player ID", example: 1 }),
    nickname: z.string().openapi({ description: "Nickname", example: "john_doe" }),
    name: z.string().nullable().openapi({ description: "Name" }),
    phone: z.string().nullable().openapi({ description: "Phone" }),
    tg: z.string().nullable().openapi({ description: "Telegram" }),
    notes: z.string().nullable().openapi({ description: "Notes" }),
    createdAt: z.string().openapi({ description: "Created at ISO8601", example: "2026-03-13T12:00:00.000Z" }),
  })
  .openapi("Player");
