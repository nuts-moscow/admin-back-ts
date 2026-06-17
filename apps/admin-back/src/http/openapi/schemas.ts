import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const AuthLoginBodySchema = z
  .object({
    username: z.string().min(1).openapi({ example: "admin" }),
    password: z.string().min(8).openapi({ example: "s3cr3tpassword" }),
  })
  .openapi("AuthLoginBody");

export const AuthMeResponseSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    username: z.string().openapi({ example: "admin" }),
  })
  .openapi("AuthMeResponse");

export const AuthChangePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).openapi({ example: "oldpassword" }),
    newPassword: z.string().min(8).openapi({ example: "newpassword123" }),
  })
  .openapi("AuthChangePasswordBody");

export const AuthUserResponseSchema = z
  .object({
    username: z.string().openapi({ example: "admin" }),
    token: z.string().openapi({
      example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      description: "JWT — send as Authorization: Bearer <token>",
    }),
  })
  .openapi("AuthUserResponse");

// ── Public ────────────────────────────────────────────────────────────────────

export const PublicTournamentItemSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    name: z.string().openapi({ example: "Freezeout 10K" }),
    status: z.enum(["registration_open", "in_progress"]).openapi({ example: "in_progress" }),
    date: z.string().openapi({ example: "2026-04-11T18:00:00.000Z" }),
    lateRegistrationClosed: z
      .boolean()
      .openapi({ description: "True when late registration period is considered closed", example: false }),
  })
  .openapi("PublicTournamentItem");

export const PublicTournamentsResponseSchema = z
  .object({
    tournaments: z.array(PublicTournamentItemSchema),
  })
  .openapi("PublicTournamentsResponse");

export const PublicTournamentParamsSchema = z
  .object({ id: z.string().openapi({ example: "1" }) })
  .openapi("PublicTournamentParams");

export const PublicRatingPlaceRowSchema = z
  .object({
    place: z.number().int().min(1).openapi({ example: 1 }),
    basePoints: z.number().openapi({ description: "Points from rating matrix for field size" }),
    guaranteeBonus: z
      .number()
      .openapi({ description: "Tournament guarantee bonus for places 1–10 when guarantee is on (configurable, default 10)" }),
    pointsCoefficient: z.number().openapi({ example: 1 }),
    fromTableAfterCoefficient: z
      .number()
      .openapi({ description: "(basePoints + guaranteeBonus) × pointsCoefficient; no bounty" }),
  })
  .openapi("PublicRatingPlaceRow");

export const PublicRatingDistributionResponseSchema = z
  .object({
    tournamentId: z.number().int(),
    rated: z
      .boolean()
      .optional()
      .openapi({
        description:
          "False when the tournament does not count toward rating (ratingEnabled=false); places is empty and no points are awarded",
        example: true,
      }),
    playersInTournament: z
      .number()
      .int()
      .min(0)
      .openapi({
        description:
          "Count for place rows: non-Out, and if anyone is InGamePaid/InGameNotPaid, only those (excludes Registered waiting). Matrix field size is ratingMatrixFieldSize",
      }),
    ratingMatrixFieldSize: z
      .number()
      .int()
      .min(0)
      .openapi({
        description:
          "All player states in Redis for this tournament (including eliminated); participant count for the rating matrix and base points",
      }),
    prizePlacesDepth: z
      .number()
      .int()
      .min(0)
      .openapi({
        description: "Max place with base points > 0 for ratingMatrixFieldSize (matrix column)",
      }),
    places: z.array(PublicRatingPlaceRowSchema),
  })
  .openapi("PublicRatingDistributionResponse");

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

/** One burned-stack elimination (rebuy or bust-out) */
export const BurnedStackEventSchema = z
  .object({
    chips: z.number().int().min(0).openapi({ example: 3200 }),
    source: z.enum(["Rebuy", "Out"]).openapi({ description: "Rebuy events can be undone via rebuy-burned-stack/undo" }),
  })
  .openapi("BurnedStackEvent");

/** Pending bounty elimination as embedded in player state (victim + killers) */
export const BountyEliminationEventForPlayerSchema = z
  .object({
    eventId: z
      .string()
      .openapi({ description: "Pass to POST .../bounty/eliminate/undo", example: "550e8400-e29b-41d4-a716-446655440000" }),
    eliminatedPlayerId: z
      .string()
      .openapi({ description: "Player who was eliminated in this event", example: "player-victim" }),
    killerPlayerIds: z
      .array(z.string())
      .openapi({
        description: "Players who shared this elimination / bounty (may be empty if not recorded)",
        example: ["player-a", "player-b"],
      }),
    recordedAt: z
      .number()
      .nullable()
      .openapi({
        description:
          "Epoch ms when recorded. Events are ordered by this ascending (earliest knockout first). null for events recorded before this field existed.",
        example: 1748534717716,
      }),
  })
  .openapi("BountyEliminationEventForPlayer");

/** Per-player tournament rating breakdown (completed tournaments, list players) */
export const TournamentRatingBreakdownSchema = z
  .object({
    basePoints: z.number().openapi({
      description: "Base points from participant count × place matrix (before guarantee and coefficients)",
    }),
    guaranteeBonus: z
      .number()
      .openapi({
        description: "Guarantee bonus when tournament guarantee is on and place is in top 10 (amount configurable per tournament, default 10)",
      }),
    pointsCoefficient: z.number().openapi({ description: "Tournament points multiplier" }),
    fromTableAfterCoefficient: z
      .number()
      .openapi({ description: "(basePoints + guaranteeBonus) × pointsCoefficient" }),
    bountyCount: z.number(),
    bountyPoints: z.number().openapi({
      description: "(bountyCount × 0.5) × bountyCoefficient",
    }),
    bountyCoefficient: z.number(),
    nonPlacementAccrued: z
      .number()
      .openapi({
        description:
          "Points accrued outside placement matrix (live tournament); merged into total before post-hoc manual adjustment",
      }),
    manualAdjustment: z.number().openapi({ description: "Manual add/sub from admin" }),
    totalPoints: z.number(),
  })
  .openapi("TournamentRatingBreakdown");

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
    bountyCount: z
      .number()
      .openapi({
        description: "Bounty count (may be fractional when split across multiple killers)",
        example: 1,
      }),
    entryPaymentMethod: EntryPaymentMethodSchema.nullable(),
    entryPaidAmount: z
      .number()
      .int()
      .nullable()
      .openapi({
        description:
          "Actual entry amount charged in same units as tournament entry_price (0 for Free). Omitted in legacy data: clients may treat as full list price for Cache/CreditCard.",
        example: 5000,
      }),
    reentryByPaymentMethod: z
      .array(EntryPaymentMethodSchema)
      .nullable()
      .openapi({
        description: "Re-entry payments as flat list, e.g. [\"Cache\", \"Cache\", \"CreditCard\"]",
        example: ["Cache", "Cache", "CreditCard"],
      }),
    reentryPaidAmounts: z
      .array(z.number().int())
      .nullable()
      .openapi({
        description:
          "Per re-entry paid amounts in line order (same length as recorded re-entries with payment methods). Legacy: null — use reentry_price × count per method.",
        example: [3000, 5000, 0],
      }),
    totalReentryCount: z.number().openapi({ description: "Total re-entry count", example: 0 }),
    allowedReentryCount: z
      .number()
      .int()
      .min(0)
      .openapi({
        description:
          "Max re-entries allowed per player for this tournament: 0 if freeze-out, else structure maxReentries (default 5)",
        example: 5,
      }),
    unpaidReentryCount: z
      .number()
      .openapi({
        description:
          "Re-entries without a recorded payment method yet (totalReentryCount minus sum of reentryByPaymentMethod counts, including Free)",
        example: 0,
      }),
    bountyEliminationEvents: z
      .array(BountyEliminationEventForPlayerSchema)
      .openapi({
        description:
          "Pending bounty eliminations for this tournament involving this player: event id, who was eliminated, and killer list. Undo: POST .../bounty/eliminate/undo with eventId. Empty for completed tournaments.",
        example: [],
      }),
    freeEntryCount: z.number().openapi({ description: "Free entry count", example: 0 }),
    freeReentryCount: z.number().openapi({ description: "Free re-entry count", example: 0 }),
    tournamentFreeEntryCount: z
      .number()
      .openapi({ description: "Tournament-only free entry count", example: 0 }),
    tournamentFreeReentryCount: z
      .number()
      .openapi({ description: "Tournament-only free re-entry count", example: 0 }),
    burnedStackEvents: z
      .array(BurnedStackEventSchema)
      .openapi({
        description:
          "Per-event burned stacks; sum(chips) equals burnedStackChipsTotal. Undo rebuy burn: POST .../rebuy-burned-stack/undo with matching chips (LIFO among Rebuy).",
        example: [{ chips: 3200, source: "Rebuy" }],
      }),
    burnedStackChipsTotal: z
      .number()
      .openapi({
        description: "Sum of chips in burnedStackEvents (all sources)",
        example: 0,
      }),
    placement: z.number().nullable().openapi({ description: "Placement position" }),
    ratingNonPlacementAccrued: z.number().openapi({
      description:
        "Rating points accrued outside placement matrix (admin PATCH); merged into frozen rating on elimination",
      example: 0,
    }),
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
    signAgreement: z
      .boolean()
      .optional()
      .openapi({
        description: "Whether player signed agreement (only in list endpoint)",
        example: true,
      }),
    rating: TournamentRatingBreakdownSchema.optional().openapi({
      description:
        "Set only when tournament is completed (results from DB). Omitted for live/cache player list.",
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

/** Response: record bounty elimination */
export const BountyEliminateResponseSchema = z
  .object({
    eventId: z
      .string()
      .openapi({
        description: "Pass to POST .../bounty/eliminate/undo to fully reverse this elimination",
        example: "550e8400-e29b-41d4-a716-446655440000",
      }),
  })
  .openapi("BountyEliminateResponse");

/** Request body: undo recordBountyElimination */
export const BountyEliminateUndoBodySchema = z
  .object({
    eventId: z
      .string()
      .openapi({ description: "eventId from POST .../bounty/eliminate response", example: "550e8400-e29b-41d4-a716-446655440000" }),
  })
  .openapi("BountyEliminateUndoBody");

/** Request body: record bounty elimination */
export const BountyEliminateBodySchema = z
  .object({
    eliminatedPlayerId: z
      .string()
      .openapi({ description: "Player who was eliminated", example: "123" }),
    killerPlayerIds: z
      .array(z.string())
      .openapi({
        description:
          "Players who shared the elimination bounty (1/N each). Required at least one when burnedStack is false. May be empty when burnedStack is true.",
        example: ["456", "789"],
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
          "If true: victim burned stack, no bounty; killerPlayerIds may be empty. burnedChips required.",
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
    } else if (!data.killerPlayerIds || data.killerPlayerIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "killerPlayerIds must contain at least one id when burnedStack is false",
        path: ["killerPlayerIds"],
      });
    }
  })
  .openapi("BountyEliminateBody");

/** Request body: undo one Rebuy + burned stack (removes last matching Rebuy event by chips, LIFO) */
export const RebuyBurnedStackUndoBodySchema = z
  .object({
    playerId: z.string().openapi({ description: "Player whose rebuy+burn to undo", example: "123" }),
    burnedChips: z
      .number()
      .int()
      .min(0)
      .openapi({
        description:
          "Chips value of the event to remove (must match a Rebuy-sourced entry); duplicates resolved LIFO",
        example: 3200,
      }),
  })
  .openapi("RebuyBurnedStackUndoBody");

/** Request body: add bounty count */
export const BountyCountBodySchema = z
  .object({
    bountyCountToAdd: z.number().openapi({ description: "Bounty count to add", example: 1 }),
  })
  .openapi("BountyCountBody");

/** Request body: admin remove bounty and/or re-entry counts (at least one field required with valid value) */
export const BountyRemoveBodySchema = z
  .object({
    bountyCountToRemove: z
      .number()
      .finite()
      .positive()
      .optional()
      .openapi({
        description:
          "Amount of bounty to subtract (may be fractional). Omit if only adjusting re-entries.",
        example: 1,
      }),
    reentryCountToRemove: z
      .number()
      .int()
      .min(1)
      .optional()
      .openapi({
        description:
          "Number of re-entries to subtract from totalReentryCount. Omit if only adjusting bounty.",
        example: 1,
      }),
  })
  .refine(
    (data) =>
      (data.bountyCountToRemove != null && data.bountyCountToRemove > 0) ||
      (data.reentryCountToRemove != null && data.reentryCountToRemove >= 1),
    {
      message:
        "At least one of bountyCountToRemove (finite > 0) or reentryCountToRemove (integer >= 1) is required",
    }
  )
  .openapi("BountyRemoveBody");

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
    entryPaidAmount: z
      .number()
      .int()
      .optional()
      .openapi({
        description:
          "Optional actual entry charge (0–tournament entry_price). Omit to use tournament entry_price when setting a paid method; ignored for Free.",
        example: 4500,
      }),
  })
  .openapi("EntryPaymentBody");

/** Request body: player game start (optional entry payment, optional table) */
export const PlayerGameStartBodySchema = z
  .object({
    entryPaymentMethod: EntryPaymentMethodSchema.optional().openapi({
      description: "If provided: sets payment method and status InGamePaid. If omitted: status InGameNotPaid",
      example: "Cache",
    }),
    entryPaidAmount: z
      .number()
      .int()
      .optional()
      .openapi({
        description:
          "Optional actual entry charge when recording payment (0–tournament entry_price). If omitted with a paid method, server uses tournament entry_price.",
        example: 4500,
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
    paidAmounts: z
      .array(z.number().int())
      .optional()
      .openapi({
        description:
          "Optional per-slot paid amounts (same length as payments). Each non-Free must be 0–tournament reentry_price (Free slots are 0). Omit to use full reentry_price for paid methods.",
        example: [2500, 5000],
      }),
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

/** Body: PATCH .../rating-non-placement */
export const RatingNonPlacementAccruedDeltaBodySchema = z
  .object({
    delta: z
      .number()
      .openapi({
        description: "Finite add/sub for rating points outside placement matrix",
        example: 1.5,
      }),
  })
  .openapi("RatingNonPlacementAccruedDeltaBody");

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
    duration: z
      .number()
      .openapi({ description: "Level length in minutes (tournament clock uses seconds = minutes × 60)", example: 15 }),
  })
  .openapi("Blind");

/** Break between blind levels */
export const BreakSchema = z
  .object({
    type: z.literal("Break"),
    id: z.number(),
    duration: z
      .number()
      .openapi({
        description: "Break length in minutes (tournament clock uses seconds = minutes × 60)",
        example: 5,
      }),
    endsLateRegistration: z
      .boolean()
      .optional()
      .openapi({
        description:
          "When true, reaching this break auto-closes late registration (rebuy zone) and signals the live screen to show rating points",
        example: false,
      }),
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
    maxReentries: z
      .number()
      .int()
      .min(0)
      .default(5)
      .openapi({
        description: "Max re-entries per player when not freeze-out; omit to use default 5",
        example: 5,
      }),
    entryFreeOnly: z
      .boolean()
      .default(false)
      .openapi({
        description:
          "When true, initial entry must use Free payment; re-entries are unchanged",
      }),
    blinds: z.array(BlindTypeSchema).openapi({ description: "Blinds and breaks" }),
  })
  .openapi("MakeTournamentStructureBody");

/** Request body: create tournament */
export const MakeTournamentBodySchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Tournament name" }),
    date: z.number().min(0).openapi({ description: "Unix timestamp" }),
    structure: MakeTournamentStructureBodySchema,
    ratingGuaranteeEnabled: z
      .boolean()
      .optional()
      .openapi({
        description:
          "When true, each player in top 10 gets bonus rating points before the points coefficient",
      }),
    ratingGuaranteeBonusPoints: z
      .number()
      .int()
      .min(0)
      .optional()
      .openapi({
        description: "Bonus points for places 1–10 when guarantee is on; default 10",
        example: 10,
      }),
    ratingPointsCoefficient: z
      .number()
      .finite()
      .optional()
      .openapi({ description: "Multiplier for (base + guarantee); default 1", example: 1 }),
    ratingBountyCoefficient: z
      .number()
      .finite()
      .optional()
      .openapi({
        description: "Multiplier for bounty points (0.5 per bounty); default 1",
        example: 1,
      }),
    ratingEnabled: z
      .boolean()
      .optional()
      .openapi({
        description: "When false, this tournament has no rating and points are not recorded; default true",
      }),
    ratingSeasonYear: z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .nullable()
      .optional()
      .openapi({ description: "Season year (e.g. 2026); null means no season assigned", example: 2026 }),
    ratingSeasonMonth: z
      .number()
      .int()
      .min(1)
      .max(12)
      .nullable()
      .optional()
      .openapi({ description: "Season month 1–12; null means no season assigned", example: 4 }),
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
    maxReentries: z
      .number()
      .int()
      .min(0)
      .openapi({ description: "Stored max re-entries per player (not freeze-out)" }),
    allowedReentryCount: z
      .number()
      .int()
      .min(0)
      .openapi({
        description: "Effective cap: 0 if freeze-out, else maxReentries",
      }),
    entryFreeOnly: z
      .boolean()
      .openapi({
        description: "Initial buy-in must be Free when true; re-entries unchanged",
      }),
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
    ratingGuaranteeEnabled: z.boolean(),
    ratingGuaranteeBonusPoints: z
      .number()
      .int()
      .min(0)
      .openapi({ description: "Bonus for places 1–10 when guarantee is on", example: 10 }),
    ratingPointsCoefficient: z.number(),
    ratingBountyCoefficient: z.number(),
    ratingEnabled: z.boolean().openapi({ description: "False for non-rated tournaments", example: true }),
    ratingSeasonYear: z.number().int().nullable().openapi({ description: "Season year or null", example: 2026 }),
    ratingSeasonMonth: z.number().int().nullable().openapi({ description: "Season month 1–12 or null", example: 4 }),
    lateRegistrationClosed: z
      .boolean()
      .openapi({ description: "True when late registration period is considered closed", example: false }),
  })
  .openapi("TournamentResponse");

/** Structure without id (from cache) */
const TournamentStructureDataSchema = z
  .object({
    name: z.string(),
    playersLimit: z.number(),
    stackSize: z.number(),
    freezeOutEnabled: z.boolean(),
    maxReentries: z.number().int().min(0),
    allowedReentryCount: z.number().int().min(0),
    entryFreeOnly: z.boolean(),
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
    ratingGuaranteeEnabled: z.boolean(),
    ratingGuaranteeBonusPoints: z.number().int().min(0),
    ratingPointsCoefficient: z.number(),
    ratingBountyCoefficient: z.number(),
    ratingEnabled: z.boolean().openapi({ description: "False for non-rated tournaments", example: true }),
    ratingSeasonYear: z.number().int().nullable().openapi({ description: "Season year or null", example: 2026 }),
    ratingSeasonMonth: z.number().int().nullable().openapi({ description: "Season month 1–12 or null", example: 4 }),
    lateRegistrationClosed: z
      .boolean()
      .openapi({ description: "True when late registration period is considered closed", example: false }),
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
    ratingGuaranteeEnabled: z.boolean().optional(),
    ratingGuaranteeBonusPoints: z.number().int().min(0).optional(),
    ratingPointsCoefficient: z.number().finite().optional(),
    ratingBountyCoefficient: z.number().finite().optional(),
    ratingEnabled: z.boolean().optional().openapi({ description: "When false, disables rating for this tournament" }),
    ratingSeasonYear: z
      .number().int().min(2000).max(2100).nullable().optional()
      .openapi({ description: "Season year or null to clear; changing season syncs completed-tournament facts" }),
    ratingSeasonMonth: z
      .number().int().min(1).max(12).nullable().optional()
      .openapi({ description: "Season month 1–12 or null to clear" }),
  })
  .openapi("UpdateTournamentBody");

/** PATCH body: manual rating adjustment for a player (completed tournament only) */
export const RatingManualAdjustmentBodySchema = z
  .object({
    manualAdjustment: z
      .number()
      .finite()
      .openapi({ description: "Added to total rating points (can be negative)" }),
  })
  .openapi("RatingManualAdjustmentBody");

/** PATCH body: late registration closed flag (not settable via create tournament) */
export const PatchLateRegistrationBodySchema = z
  .object({
    lateRegistrationClosed: z
      .boolean()
      .openapi({ description: "True when late registration period is considered closed", example: true }),
  })
  .openapi("PatchLateRegistrationBody");

/** Full base-points matrix for admin reference */
export const TournamentRatingMatrixPlaceRowSchema = z
  .object({
    place: z.number().int().min(1).max(35),
    basePoints: z.array(z.number()).length(26),
  })
  .openapi("TournamentRatingMatrixPlaceRow");

export const TournamentRatingMatrixResponseSchema = z
  .object({
    participantRangeLabels: z.array(z.string()).length(26),
    places: z.array(TournamentRatingMatrixPlaceRowSchema).length(35),
  })
  .openapi("TournamentRatingMatrixResponse");

/** Request body: update tournament status only */
export const UpdateTournamentStatusBodySchema = z
  .object({
    status: TournamentStatusSchema.openapi({ description: "Tournament status" }),
  })
  .openapi("UpdateTournamentStatusBody");

/** Request body: pause / resume clock or extend current blind/break */
export const PatchTournamentClockBodySchema = z
  .object({
    paused: z.boolean().optional().openapi({
      description: "Pause clock (true) or resume (false). Tournament must be in_progress.",
      example: true,
    }),
    extendCurrentLevelSec: z
      .number()
      .int()
      .positive()
      .optional()
      .openapi({
        description: "Add this many seconds to the current structure step end",
        example: 120,
      }),
  })
  .refine(
    (b) => b.paused !== undefined || b.extendCurrentLevelSec !== undefined,
    {
      message: "At least one of paused or extendCurrentLevelSec is required",
    }
  )
  .openapi("PatchTournamentClockBody");

/** Seasonal rating entry: one player's aggregated points for a season */
export const SeasonalRatingEntrySchema = z
  .object({
    playerId: z.string().openapi({ description: "Player ID", example: "42" }),
    totalPoints: z
      .number()
      .openapi({ description: "Sum of total_points across all tournaments in the season", example: 153.5 }),
    tournamentCount: z
      .number()
      .int()
      .openapi({ description: "Number of tournaments the player participated in this season", example: 3 }),
  })
  .openapi("SeasonalRatingEntry");

/** Response: seasonal rating for a given year/month */
export const SeasonalRatingResponseSchema = z
  .object({
    year: z.number().int().openapi({ example: 2026 }),
    month: z.number().int().min(1).max(12).openapi({ example: 4 }),
    entries: z.array(SeasonalRatingEntrySchema),
  })
  .openapi("SeasonalRatingResponse");

/** Query params: get seasonal rating */
export const SeasonalRatingQuerySchema = z
  .object({
    year: z.string().openapi({ description: "Season year (e.g. 2026)", example: "2026" }),
    month: z.string().openapi({ description: "Season month 1–12 (e.g. 4 for April)", example: "4" }),
  })
  .openapi("SeasonalRatingQuery");

/** WebSocket tick payload (~1/s) for tournament blind clock */
export const TournamentClockTickSchema = z
  .object({
    type: z.literal("tournament_clock_tick"),
    tournamentId: z.number(),
    serverTimeMs: z.number(),
    tournamentStatus: TournamentStatusSchema,
    clockActive: z.boolean().openapi({
      description: "True when tournament is in_progress and Redis clock state exists",
    }),
    paused: z.boolean(),
    currentStepIndex: z.number().nullable(),
    stepType: z.enum(["Blind", "Break"]).nullable(),
    levelId: z.number().nullable(),
    secondsRemaining: z.number().nullable(),
    secondsUntilNextBreak: z
      .number()
      .int()
      .nullable()
      .openapi({
        description:
          "Seconds until the next Break in blindsStructure after currentStepIndex; null if none or clock inactive",
        example: 900,
      }),
    structureFinished: z.boolean(),
    lateRegistrationClosed: z.boolean().openapi({
      description: "True once late registration is closed for this tournament",
    }),
    showRatingPoints: z.boolean().openapi({
      description:
        "True when the live screen should show rating points — set once the clock reaches a Break flagged endsLateRegistration",
    }),
  })
  .openapi("TournamentClockTick");
