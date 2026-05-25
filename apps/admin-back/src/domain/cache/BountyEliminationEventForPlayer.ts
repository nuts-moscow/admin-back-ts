import type { PlayerId } from "./InGameUserState";

/** One pending bounty elimination as included in a player’s tournament state (victim + killers). */
export interface BountyEliminationEventForPlayer {
  eventId: string;
  eliminatedPlayerId: PlayerId;
  killerPlayerIds: PlayerId[];
}
