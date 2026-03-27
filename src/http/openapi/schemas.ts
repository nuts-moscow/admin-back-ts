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
  .enum([
    "EarlyBird",
    "First20",
    "Hookah",
    "Diller",
    "BonusOfTheDay",
    "Custom",
  ])
  .openapi("InGameBonus");

/** Bonuses stored as type+count pairs (excludes Custom — use customBonusChips) */
export const FixedInGameBonusPairSchema = z
  .enum(["EarlyBird", "First20", "Hookah", "Diller", "BonusOfTheDay"])
  .openapi("FixedInGameBonusPair");

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
      .openapi({
        description:
          "Re-entries without a recorded payment method yet (totalReentryCount minus sum of reentryByPaymentMethod counts, including Free)",
        example: 0,
      }),
    freeEntryCount: z.number().openapi({ description: "Free entry count", example: 0 }),
    freeReentryCount: z.number().openapi({ description: "Free re-entry count", example: 0 }),
    tournamentFreeEntryCount: z
      .number()
      .openapi({ description: "Tournament-only free entry count", example: 0 }),
    tournamentFreeReentryCount: z
      .number()
      .openapi({ description: "Tournament-only free re-entry count", example: 0 }),
    burnedStackChipsTotal: z
      .number()
      .openapi({
        description:
          "Cumulative chips burned (left table without transferring) for this player in the tournament",
        example: 0,
      }),
    placement: z.number().nullable().openapi({ description: "Placement position" }),
    bonuses: z
      .array(InGameBonusSchema)
      .nullable()
      .openapi({
        description:
          "Bonuses as flat list (Custom is never listed here — use customBonusChips)",
        example: ["EarlyBird", "BonusOfTheDay", "Diller"],
      }),
    customBonusChips: z
      .array(z.number().int().positive())
      .openapi({
        description:
          "Per-grant custom bonus chip amounts (use POST .../bonuses/custom to add)",
        example: [5000, 7500],
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

/** Request body: add player to tournament (EarlyBird via game-start only) */
export const AddPlayerToTournamentBodySchema = z
  .object({})
  .openapi("AddPlayerToTournamentBody");

/** Response: total rebuy count for tournament */
export const RebuyCountResponseSchema = z
  .object({
    rebuyCount: z
      .number()
      .openapi({ description: "Total rebuy count for tournament", example: 42 }),
  })
  .openapi("RebuyCountResponse");

/** One bonus type in chip pool breakdown (count × chips per unit) */
export const ChipPoolBonusLineSchema = z
  .object({
    bonus: InGameBonusSchema,
    count: z
      .number()
      .openapi({ description: "Total instances of this bonus across eligible players", example: 3 }),
    chipsPerUnit: z
      .number()
      .openapi({ description: "Chips per one bonus instance", example: 3000 }),
    totalChips: z
      .number()
      .openapi({ description: "count × chipsPerUnit", example: 9000 }),
  })
  .openapi("ChipPoolBonusLine");

/** GET chip-pool-summary: players, rebuys, chips, bonus breakdown in one response */
export const TournamentChipPoolSummarySchema = z
  .object({
    playersArrived: z
      .number()
      .openapi({
        description:
          "Players who joined the game (status not Registered): InGamePaid, InGameNotPaid, Out",
        example: 24,
      }),
    playersActive: z
      .number()
      .openapi({
        description: "Still in the game (InGamePaid or InGameNotPaid, not Out)",
        example: 18,
      }),
    rebuyCount: z
      .number()
      .openapi({
        description: "Total re-entries in the tournament (same as rebuy-count endpoint)",
        example: 5,
      }),
    averageStack: z
      .number()
      .nullable()
      .openapi({
        description:
          "totalChips ÷ playersActive when playersActive > 0 (players in game: not Registered, not Out). Null if no active players.",
        example: 24850,
      }),
    stackSize: z
      .number()
      .openapi({ description: "Starting stack from tournament structure", example: 15000 }),
    entryUnits: z
      .number()
      .openapi({
        description: "Same as playersArrived; used for (entryUnits + rebuyCount) × stackSize",
        example: 24,
      }),
    baseChips: z
      .number()
      .openapi({
        description: "(entryUnits + rebuyCount) × stackSize",
        example: 435000,
      }),
    bonuses: z
      .array(ChipPoolBonusLineSchema)
      .openapi({
        description:
          "Bonus chips by type; counts only players with status not Registered (same as arrived)",
      }),
    bonusChipsTotal: z
      .number()
      .openapi({ description: "Sum of bonus totalChips", example: 12000 }),
    burnedStackChipsTotal: z
      .number()
      .openapi({
        description:
          "Sum of burnedStackChipsTotal across all players; chips removed from play (burned stacks)",
        example: 5000,
      }),
    totalChips: z
      .number()
      .openapi({
        description: "Chips still in play: baseChips + bonusChipsTotal − burnedStackChipsTotal (floored at 0)",
        example: 442000,
      }),
  })
  .openapi("TournamentChipPoolSummary");

/** Cash desk line: quantity and amount */
const CashDeskLineSchema = z
  .object({
    quantity: z.number().openapi({ description: "Кол-во" }),
    amount: z.number().openapi({ description: "Сумма" }),
  })
  .openapi("CashDeskLine");

/** Cash desk category: total, entries, rebuys */
const CashDeskCategorySchema = z
  .object({
    total: CashDeskLineSchema.openapi({ description: "Всего" }),
    entries: CashDeskLineSchema.openapi({ description: "Входы" }),
    rebuys: CashDeskLineSchema.openapi({ description: "Ребаи" }),
  })
  .openapi("CashDeskCategory");

/** Response: cash desk for tournament */
export const CashDeskResponseSchema = z
  .object({
    cash: CashDeskCategorySchema.openapi({ description: "Наличными" }),
    card: CashDeskCategorySchema.openapi({ description: "По карте" }),
    free: CashDeskCategorySchema.openapi({ description: "Бесплатно" }),
    grandTotal: CashDeskCategorySchema.openapi({ description: "Итого" }),
  })
  .openapi("CashDeskResponse");

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
      .optional()
      .openapi({
        description: "Player who made the elimination. Required when burnedStack is false.",
        example: "456",
      }),
    type: BountyEliminationTypeSchema.openapi({
      description: "Rebuy = eliminated gets reentry, Out = no reentry",
      example: "Rebuy",
    }),
    burnedStack: z
      .boolean()
      .optional()
      .openapi({
        description:
          "If true: victim burned stack, bounty not recorded for killer, only rebuy/Out. killerPlayerId optional. burnedChips required.",
        default: false,
      }),
    burnedChips: z
      .number()
      .int()
      .min(0)
      .optional()
      .openapi({
        description:
          "Chips burned this elimination; required when burnedStack is true (non-negative integer).",
        example: 3200,
      }),
  })
  .superRefine((data, ctx) => {
    if (data.burnedStack === true) {
      if (
        data.burnedChips === undefined ||
        typeof data.burnedChips !== "number" ||
        !Number.isInteger(data.burnedChips) ||
        data.burnedChips < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "burnedChips is required (non-negative integer) when burnedStack is true",
          path: ["burnedChips"],
        });
      }
    }
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

/** Request body: add custom bonus chips (one grant) */
export const CustomBonusChipsBodySchema = z
  .object({
    chips: z
      .number()
      .int()
      .positive()
      .openapi({ description: "Chip amount for this grant", example: 7500 }),
  })
  .openapi("CustomBonusChipsBody");

/** Request body: add one bonus instance or remove one (same shape) */
export const BonusMutationBodySchema = z
  .object({
    bonus: FixedInGameBonusPairSchema.openapi({
      description:
        "Bonus type (not Custom — use POST .../bonuses/custom). Add: increments count. Remove: decrements by one.",
      example: "EarlyBird",
    }),
  })
  .openapi("BonusMutationBody");

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
    EarlyBirdFlag: z
      .boolean()
      .optional()
      .openapi({
        description: "If true, adds EarlyBird bonus after successful game start (same as on add-player with flag)",
        example: true,
      }),
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

/** Request body: delta for free entries / free reentries (e.g. +2 or -1) */
export const FreeCountDeltaBodySchema = z
  .object({
    delta: z.number().openapi({ description: "Change in count (positive to add, negative to subtract). Result is clamped to 0.", example: 2 }),
  })
  .openapi("FreeCountDeltaBody");

/** Response: free entry count after update */
export const FreeEntryCountResponseSchema = z
  .object({
    freeEntryCount: z.number().openapi({ description: "New free entry count in player profile", example: 3 }),
  })
  .openapi("FreeEntryCountResponse");

/** Response: free reentry count after update */
export const FreeReentryCountResponseSchema = z
  .object({
    freeReentryCount: z.number().openapi({ description: "New free reentry count in player profile", example: 5 }),
  })
  .openapi("FreeReentryCountResponse");

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
    freeEntryCount: z.number().openapi({ description: "Number of free entries in profile", example: 0 }),
    freeReentryCount: z.number().openapi({ description: "Number of free reentries in profile", example: 0 }),
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
    freezeOutEnabled: z
      .union([z.boolean(), z.null()])
      .transform((v) => (v === null ? false : v))
      .openapi({ description: "Freeze-out mode (null is treated as false)" }),
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
