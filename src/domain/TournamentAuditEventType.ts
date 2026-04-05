/**
 * Values for `tournament_audit_events.event_type`. Append-only audit stream.
 */
export const TournamentAuditEventType = {
  TournamentCreated: "tournament_created",
  TournamentMetaUpdated: "tournament_meta_updated",
  TournamentStatusChanged: "tournament_status_changed",
  TournamentStructureCacheUpdated: "tournament_structure_cache_updated",
  TournamentClockPatch: "tournament_clock_patch",
  TournamentCompleted: "tournament_completed",

  PlayerAdded: "player_added",
  PlayerRemoved: "player_removed",
  BountyEliminationRecorded: "bounty_elimination_recorded",
  BountyEliminationUndo: "bounty_elimination_undo",
  BountyRebuyBurnedStackUndo: "bounty_rebuy_burned_stack_undo",
  BountyCountUpdated: "bounty_count_updated",
  BountyReentryRemovalApplied: "bounty_reentry_removal_applied",
  BonusAdded: "bonus_added",
  BonusRemoved: "bonus_removed",
  CustomBonusChipsAdded: "custom_bonus_chips_added",
  CustomBonusChipsRemoved: "custom_bonus_chips_removed",
  ReentryCountAdded: "reentry_count_added",
  GameStart: "game_start",
  ReturnToGame: "return_to_game",
  RollbackGameStart: "rollback_game_start",
  InGameEntryPayment: "in_game_entry_payment",
  EntryPaymentUpdated: "entry_payment_updated",
  TableAssignmentUpdated: "table_assignment_updated",
  ReentryPaymentAppended: "reentry_payment_appended",
  ReentryPaymentReplaced: "reentry_payment_replaced",
  TournamentFreeEntriesAdjusted: "tournament_free_entries_adjusted",
  TournamentFreeReentriesAdjusted: "tournament_free_reentries_adjusted",
} as const;

export type TournamentAuditEventTypeName =
  (typeof TournamentAuditEventType)[keyof typeof TournamentAuditEventType];
