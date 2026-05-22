import type { BlindType } from "../domain/BlindType";
import { DEFAULT_MAX_REENTRIES } from "../domain/tournamentReentryPolicy";
import type { TournamentStructure } from "../domain/TournamentStructure";
import { logger } from "../logger";
import { PostgresClient } from "./PostgresClient";

export interface MakeTournamentStructureInput {
  name: string;
  playersLimit: number;
  stackSize: number;
  freezeOutEnabled: boolean;
  maxReentries: number;
  entryFreeOnly: boolean;
  blinds: BlindType[];
}

export interface UpdateTournamentStructureInput {
  name: string;
  playersLimit: number;
  stackSize: number;
  freezeOutEnabled: boolean;
  maxReentries: number;
  entryFreeOnly: boolean;
  blinds: BlindType[];
}

export interface ListTournamentStructuresOptions {
  offset?: number;
  limit?: number;
}

function parseBlinds(raw: string): BlindType[] {
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is BlindType => {
      if (typeof x !== "object" || x === null) return false;
      const o = x as Record<string, unknown>;
      if (o.type === "Blind") {
        return (
          typeof o.level === "number" &&
          typeof o.id === "number" &&
          typeof o.smallBlind === "number" &&
          typeof o.bigBlind === "number" &&
          typeof o.ante === "boolean" &&
          typeof o.duration === "number"
        );
      }
      if (o.type === "Break") {
        return typeof o.id === "number" && typeof o.duration === "number";
      }
      return false;
    });
  } catch {
    return [];
  }
}

function rowToStructure(row: Record<string, unknown>): TournamentStructure {
  const rawMax = row.max_reentries;
  const maxReentries =
    typeof rawMax === "number" && Number.isInteger(rawMax) && rawMax >= 0
      ? rawMax
      : DEFAULT_MAX_REENTRIES;
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    playersLimit: Number(row.players_limit ?? 0),
    stackSize: Number(row.stack_size ?? 0),
    freezeOutEnabled: row.freeze_out_enabled === true,
    maxReentries,
    entryFreeOnly: row.entry_free_only === true,
    blindsStructure: parseBlinds(String(row.blinds ?? "[]")),
  };
}

export interface TournamentStructureRepository {
  create(input: MakeTournamentStructureInput): Promise<TournamentStructure | null>;
  update(id: number, input: UpdateTournamentStructureInput): Promise<TournamentStructure | null>;
  findById(id: number): Promise<TournamentStructure | null>;
  list(options?: ListTournamentStructuresOptions): Promise<TournamentStructure[]>;
}

class TournamentStructureRepositoryImpl implements TournamentStructureRepository {
  async create(input: MakeTournamentStructureInput): Promise<TournamentStructure | null> {
    try {
      const blindsJson = JSON.stringify(input.blinds);
      const result = await PostgresClient.instance.query(
        `INSERT INTO tournament_structures (name, players_limit, stack_size, freeze_out_enabled, max_reentries, entry_free_only, blinds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, players_limit, stack_size, freeze_out_enabled, max_reentries, entry_free_only, blinds`,
        [
          input.name,
          input.playersLimit,
          input.stackSize,
          input.freezeOutEnabled,
          input.maxReentries,
          input.entryFreeOnly,
          blindsJson,
        ]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToStructure(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentStructureRepository.create failed");
      return null;
    }
  }

  async update(
    id: number,
    input: UpdateTournamentStructureInput
  ): Promise<TournamentStructure | null> {
    try {
      const blindsJson = JSON.stringify(input.blinds);
      const result = await PostgresClient.instance.query(
        `UPDATE tournament_structures
         SET name = $1, players_limit = $2, stack_size = $3, freeze_out_enabled = $4, max_reentries = $5, entry_free_only = $6, blinds = $7
         WHERE id = $8
         RETURNING id, name, players_limit, stack_size, freeze_out_enabled, max_reentries, entry_free_only, blinds`,
        [
          input.name,
          input.playersLimit,
          input.stackSize,
          input.freezeOutEnabled,
          input.maxReentries,
          input.entryFreeOnly,
          blindsJson,
          id,
        ]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToStructure(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentStructureRepository.update failed");
      return null;
    }
  }

  async findById(id: number): Promise<TournamentStructure | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT id, name, players_limit, stack_size, freeze_out_enabled, max_reentries, entry_free_only, blinds FROM tournament_structures WHERE id = $1",
        [id]
      );
      const row = result.rows[0];
      if (!row) return null;
      return rowToStructure(row as Record<string, unknown>);
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentStructureRepository.findById failed");
      return null;
    }
  }

  async list(options?: ListTournamentStructuresOptions): Promise<TournamentStructure[]> {
    try {
      const offset = Math.max(0, options?.offset ?? 0);
      const limit = options?.limit != null ? Math.max(1, Math.min(1000, options.limit)) : 100;
      const result = await PostgresClient.instance.query(
        `SELECT id, name, players_limit, stack_size, freeze_out_enabled, max_reentries, entry_free_only, blinds
         FROM tournament_structures ORDER BY id ASC OFFSET $1 LIMIT $2`,
        [offset, limit]
      );
      return result.rows.map((row) => rowToStructure(row as Record<string, unknown>));
    } catch (err) {
      logger.info({ err }, "[Postgres] TournamentStructureRepository.list failed");
      return [];
    }
  }
}

export const tournamentStructureRepository: TournamentStructureRepository =
  new TournamentStructureRepositoryImpl();
