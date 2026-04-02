import type { BountyEliminationEventRecord } from "../cache/BountyEliminationEventsCache";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

function parseEventsPayload(raw: unknown): BountyEliminationEventRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: BountyEliminationEventRecord[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.eventId !== "string" || o.eventId.length === 0) continue;
    if (typeof o.eliminatedPlayerId !== "string") continue;
    if (!Array.isArray(o.killerPlayerIds)) continue;
    const killerPlayerIds = o.killerPlayerIds.filter(
      (id): id is string => typeof id === "string"
    );
    if (o.type !== "Rebuy" && o.type !== "Out") continue;
    if (typeof o.burnedStack !== "boolean") continue;
    const bc = o.burnedChips;
    const burnedChips =
      typeof bc === "number" ? bc : typeof bc === "string" ? parseInt(bc, 10) : NaN;
    if (Number.isNaN(burnedChips) || !Number.isInteger(burnedChips) || burnedChips < 0) {
      continue;
    }
    if (typeof o.recordedBounty !== "boolean") continue;
    const bs = o.bountyShare;
    const bountyShare = typeof bs === "number" ? bs : parseFloat(String(bs));
    if (Number.isNaN(bountyShare)) continue;
    out.push({
      eventId: o.eventId,
      eliminatedPlayerId: o.eliminatedPlayerId,
      killerPlayerIds,
      type: o.type,
      burnedStack: o.burnedStack,
      burnedChips,
      recordedBounty: o.recordedBounty,
      bountyShare,
    });
  }
  return out;
}

export interface TournamentEliminationSnapshotRepository {
  save(
    tournamentId: number,
    events: BountyEliminationEventRecord[]
  ): Promise<boolean>;
  findByTournamentId(
    tournamentId: number
  ): Promise<BountyEliminationEventRecord[] | null>;
}

class TournamentEliminationSnapshotRepositoryImpl
  implements TournamentEliminationSnapshotRepository
{
  async save(
    tournamentId: number,
    events: BountyEliminationEventRecord[]
  ): Promise<boolean> {
    try {
      await PostgresClient.instance.query(
        `INSERT INTO tournament_elimination_snapshots (tournament_id, events)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (tournament_id) DO UPDATE SET events = EXCLUDED.events`,
        [tournamentId, JSON.stringify(events)]
      );
      return true;
    } catch (err) {
      logger.info(
        { err, tournamentId },
        "[Postgres] TournamentEliminationSnapshotRepository.save failed"
      );
      return false;
    }
  }

  async findByTournamentId(
    tournamentId: number
  ): Promise<BountyEliminationEventRecord[] | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT events FROM tournament_elimination_snapshots WHERE tournament_id = $1",
        [tournamentId]
      );
      const row = result.rows[0] as { events: unknown } | undefined;
      if (!row || row.events == null) return null;
      const raw =
        typeof row.events === "string"
          ? JSON.parse(row.events)
          : row.events;
      return parseEventsPayload(raw);
    } catch (err) {
      logger.info(
        { err, tournamentId },
        "[Postgres] TournamentEliminationSnapshotRepository.findByTournamentId failed"
      );
      return null;
    }
  }
}

export const tournamentEliminationSnapshotRepository: TournamentEliminationSnapshotRepository =
  new TournamentEliminationSnapshotRepositoryImpl();
