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
    playerId: z.string().openapi({ description: "Player ID", example: "player-123" }),
    status: InGamePlayerStatusSchema,
    tableId: z.string().nullable().openapi({ description: "Table ID", example: "table-1" }),
    bountyCount: z.number().openapi({ description: "Bounty count", example: 0 }),
    entryPaymentMethod: EntryPaymentMethodSchema.nullable(),
    reentryByPaymentMethod: z
      .array(z.tuple([EntryPaymentMethodSchema, z.number()]))
      .nullable()
      .openapi({ description: "Re-entry count by payment method: (method, count)" }),
    totalReentryCount: z.number().openapi({ description: "Total re-entry count", example: 0 }),
    freeEntryCount: z.number().openapi({ description: "Free entry count", example: 0 }),
    freeReentryCount: z.number().openapi({ description: "Free re-entry count", example: 0 }),
    placement: z.number().nullable().openapi({ description: "Placement position" }),
    bonuses: z
      .array(z.tuple([InGameBonusSchema, z.number()]))
      .nullable()
      .openapi({ description: "Bonuses: (bonus, count)" }),
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

/** Request body: player status */
export const StatusBodySchema = z
  .object({
    status: InGamePlayerStatusSchema,
  })
  .openapi("StatusBody");

/** Request body: entry payment method */
export const EntryPaymentBodySchema = z
  .object({
    entryPaymentMethod: EntryPaymentMethodSchema,
  })
  .openapi("EntryPaymentBody");

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
