import type { PlayerId } from "./InGameUserState";

/** One pending bounty elimination as included in a player’s tournament state (victim + killers). */
export interface BountyEliminationEventForPlayer {
  eventId: string;
  eliminatedPlayerId: PlayerId;
  killerPlayerIds: PlayerId[];
  /** Elimination type: "Out" — final knockout, "Rebuy" — elimination on rebuy. */
  type: "Rebuy" | "Out";
  /**
   * Epoch ms when recorded; events are returned ordered by this ascending
   * (earliest first). null for events recorded before this field existed.
   */
  recordedAt: number | null;
}
