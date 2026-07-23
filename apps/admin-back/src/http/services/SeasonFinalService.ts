import { tournamentRepository } from "../../postgres/TournamentRepository";

/** The player-facing monthly-final announcement: the season-final date, or null when unannounced. */
export interface SeasonFinalAnnouncement {
  date: number | null;
}

type MonthFinalSource = {
  findFutureMonthFinal(nowMs: number): Promise<{ id: number; date: number } | null>;
};

/**
 * Builds the SeasonFinalAnnouncement from the nearest FUTURE month-final
 * tournament (or unannounced when none). Future-only filtering and the
 * deterministic pick live in the repository; this service holds no season
 * concept — it only maps the picked row to the wire shape.
 */
export class SeasonFinalService {
  constructor(private readonly repo: MonthFinalSource = tournamentRepository) {}

  async getAnnouncement(nowMs: number): Promise<SeasonFinalAnnouncement> {
    const found = await this.repo.findFutureMonthFinal(nowMs);
    return { date: found ? found.date : null };
  }
}
