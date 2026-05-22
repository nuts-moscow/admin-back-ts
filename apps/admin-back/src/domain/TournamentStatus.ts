/** Tournament status */
export type TournamentStatus =
  | "registration_open"
  | "in_progress"
  | "completed";

export const TournamentStatusValues: Record<string, TournamentStatus> = {
  RegistrationOpen: "registration_open",
  InProgress: "in_progress",
  Completed: "completed",
};
