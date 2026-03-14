import type { BlindType } from "./BlindType";

/** Tournament structure ID */
export type TournamentStructureId = number;

/** Tournament structure name */
export type TournamentStructureName = string;

/** Max players limit */
export type PlayersLimit = number;

/** Starting stack size in chips */
export type StackSize = number;

/** Tournament structure (blinds, stack, limits) */
export interface TournamentStructure {
  id: TournamentStructureId;
  name: TournamentStructureName;
  playersLimit: PlayersLimit;
  blindsStructure: BlindType[];
  stackSize: StackSize;
  freezeOutEnabled: boolean;
}
