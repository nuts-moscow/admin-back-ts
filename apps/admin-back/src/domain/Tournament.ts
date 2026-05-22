import type { TournamentStatus } from "./TournamentStatus";
import type { TournamentStructure } from "./TournamentStructure";

/** Tournament ID */
export type TournamentId = number;

/** Tournament name */
export type TournamentName = string;

/** Tournament date (Unix timestamp) */
export type TournamentDate = number;

/** Tournament type: NotStarted, Live, OnPause, FreezeOut */
export type TournamentType = "not_started" | "live" | "on_pause" | "freeze_out";

/** Tournament entity */
export interface Tournament {
  id: TournamentId;
  name: TournamentName;
  status: TournamentStatus;
  date: TournamentDate;
  tournamentType: TournamentType;
  tournamentStructure: TournamentStructure;
}
