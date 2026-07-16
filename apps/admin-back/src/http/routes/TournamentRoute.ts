import type { BunRequest } from "bun";
import { logger } from "../../logger";
import type { BlindType } from "../../domain/BlindType";
import { getTournamentRatingMatrixPayload, getRatingTablePayload } from "../../domain/tournamentRatingMatrix";
import { TournamentAuditEventType } from "../../domain/TournamentAuditEventType";
import { ratingTableRepository } from "../../postgres/RatingTableRepository";
import {
  DEFAULT_MAX_REENTRIES,
  effectiveAllowedReentryCount,
} from "../../domain/tournamentReentryPolicy";
import { InGameUserStateService } from "../services/InGameUserStateService";
import { repriceTournamentRating } from "../services/TournamentRatingRepriceService";
import { TournamentService } from "../services/TournamentService";
import { tournamentClockService } from "../services/TournamentClockService";
import { writeTournamentAuditLog } from "../services/tournamentAuditLog";

function isValidBlind(x: unknown): x is Extract<BlindType, { type: "Blind" }> {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.type === "Blind" &&
    typeof o.level === "number" &&
    typeof o.id === "number" &&
    typeof o.smallBlind === "number" &&
    typeof o.bigBlind === "number" &&
    typeof o.ante === "boolean" &&
    typeof o.duration === "number"
  );
}

function isValidBreak(x: unknown): x is Extract<BlindType, { type: "Break" }> {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.type === "Break" &&
    typeof o.id === "number" &&
    typeof o.duration === "number" &&
    (o.endsLateRegistration === undefined ||
      typeof o.endsLateRegistration === "boolean")
  );
}

function parseBlinds(arr: unknown): BlindType[] | null {
  if (!Array.isArray(arr)) return null;
  const result: BlindType[] = [];
  for (const x of arr) {
    if (isValidBlind(x)) result.push(x);
    else if (isValidBreak(x)) result.push(x);
    else return null;
  }
  return result;
}

function validateStructureBody(body: unknown): {
  ok: true;
  data: {
    name: string;
    playersLimit: number;
    stackSize: number;
    freezeOutEnabled: boolean;
    maxReentries: number;
    entryFreeOnly: boolean;
    blinds: BlindType[];
  };
} | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const o = body as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.trim() === "") {
    return { ok: false, error: "name is required and must be a non-empty string" };
  }
  if (typeof o.playersLimit !== "number" || o.playersLimit < 1) {
    return { ok: false, error: "playersLimit must be a positive number" };
  }
  if (typeof o.stackSize !== "number" || o.stackSize < 1) {
    return { ok: false, error: "stackSize must be a positive number" };
  }
  let freezeOutEnabled: boolean;
  if (o.freezeOutEnabled === null) {
    freezeOutEnabled = false;
  } else if (typeof o.freezeOutEnabled === "boolean") {
    freezeOutEnabled = o.freezeOutEnabled;
  } else {
    return { ok: false, error: "freezeOutEnabled must be a boolean" };
  }
  let maxReentries: number;
  if (o.maxReentries === undefined || o.maxReentries === null) {
    maxReentries = DEFAULT_MAX_REENTRIES;
  } else if (
    typeof o.maxReentries === "number" &&
    Number.isInteger(o.maxReentries) &&
    o.maxReentries >= 0
  ) {
    maxReentries = o.maxReentries;
  } else {
    return {
      ok: false,
      error: "maxReentries must be a non-negative integer or omitted (default 5)",
    };
  }
  let entryFreeOnly: boolean;
  if (o.entryFreeOnly === undefined || o.entryFreeOnly === null) {
    entryFreeOnly = false;
  } else if (typeof o.entryFreeOnly === "boolean") {
    entryFreeOnly = o.entryFreeOnly;
  } else {
    return { ok: false, error: "entryFreeOnly must be a boolean" };
  }
  const blinds = parseBlinds(o.blinds);
  if (blinds === null) {
    return { ok: false, error: "blinds must be an array of Blind or Break objects" };
  }
  return {
    ok: true,
    data: {
      name: o.name.trim(),
      playersLimit: o.playersLimit,
      stackSize: o.stackSize,
      freezeOutEnabled,
      maxReentries,
      entryFreeOnly,
      blinds,
    },
  };
}

function structureResponseFromEntity(s: {
  id: number;
  name: string;
  playersLimit: number;
  stackSize: number;
  freezeOutEnabled: boolean;
  maxReentries: number;
  entryFreeOnly: boolean;
  blindsStructure: BlindType[];
}) {
  return {
    id: s.id,
    name: s.name,
    playersLimit: s.playersLimit,
    stackSize: s.stackSize,
    freezeOutEnabled: s.freezeOutEnabled,
    maxReentries: s.maxReentries,
    entryFreeOnly: s.entryFreeOnly,
    allowedReentryCount: effectiveAllowedReentryCount(
      s.freezeOutEnabled,
      s.maxReentries
    ),
    blindsStructure: s.blindsStructure,
  };
}

function parseClockPatch(body: unknown):
  | { ok: true; paused?: boolean; extendCurrentLevelSec?: number }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const o = body as Record<string, unknown>;
  let paused: boolean | undefined;
  if (o.paused !== undefined) {
    if (typeof o.paused !== "boolean") {
      return { ok: false, error: "paused must be a boolean" };
    }
    paused = o.paused;
  }
  let extendCurrentLevelSec: number | undefined;
  if (o.extendCurrentLevelSec !== undefined) {
    if (
      typeof o.extendCurrentLevelSec !== "number" ||
      !Number.isInteger(o.extendCurrentLevelSec) ||
      o.extendCurrentLevelSec < 1
    ) {
      return {
        ok: false,
        error: "extendCurrentLevelSec must be a positive integer",
      };
    }
    extendCurrentLevelSec = o.extendCurrentLevelSec;
  }
  if (paused === undefined && extendCurrentLevelSec === undefined) {
    return {
      ok: false,
      error: "At least one of paused or extendCurrentLevelSec is required",
    };
  }
  return { ok: true, paused, extendCurrentLevelSec };
}

function parseOptionalTournamentRating(body: Record<string, unknown>): {
  ok: true;
  ratingGuaranteeEnabled?: boolean;
  ratingGuaranteeBonusPoints?: number;
  ratingPointsCoefficient?: number;
  ratingBountyCoefficient?: number;
  ratingTableId?: number;
  ratingEnabled?: boolean;
  ratingSeasonYear?: number | null;
  ratingSeasonMonth?: number | null;
} | { ok: false; error: string } {
  let ratingGuaranteeEnabled: boolean | undefined;
  if ("ratingGuaranteeEnabled" in body && body.ratingGuaranteeEnabled !== undefined) {
    if (typeof body.ratingGuaranteeEnabled !== "boolean") {
      return { ok: false, error: "ratingGuaranteeEnabled must be a boolean" };
    }
    ratingGuaranteeEnabled = body.ratingGuaranteeEnabled;
  }
  let ratingGuaranteeBonusPoints: number | undefined;
  if ("ratingGuaranteeBonusPoints" in body && body.ratingGuaranteeBonusPoints !== undefined) {
    if (
      typeof body.ratingGuaranteeBonusPoints !== "number" ||
      !Number.isFinite(body.ratingGuaranteeBonusPoints) ||
      !Number.isInteger(body.ratingGuaranteeBonusPoints) ||
      body.ratingGuaranteeBonusPoints < 0
    ) {
      return {
        ok: false,
        error: "ratingGuaranteeBonusPoints must be a non-negative integer",
      };
    }
    ratingGuaranteeBonusPoints = body.ratingGuaranteeBonusPoints;
  }
  let ratingPointsCoefficient: number | undefined;
  if ("ratingPointsCoefficient" in body && body.ratingPointsCoefficient !== undefined) {
    if (typeof body.ratingPointsCoefficient !== "number" || !Number.isFinite(body.ratingPointsCoefficient)) {
      return { ok: false, error: "ratingPointsCoefficient must be a finite number" };
    }
    ratingPointsCoefficient = body.ratingPointsCoefficient;
  }
  let ratingBountyCoefficient: number | undefined;
  if ("ratingBountyCoefficient" in body && body.ratingBountyCoefficient !== undefined) {
    if (typeof body.ratingBountyCoefficient !== "number" || !Number.isFinite(body.ratingBountyCoefficient)) {
      return { ok: false, error: "ratingBountyCoefficient must be a finite number" };
    }
    ratingBountyCoefficient = body.ratingBountyCoefficient;
  }
  let ratingTableId: number | undefined;
  if ("ratingTableId" in body && body.ratingTableId !== undefined) {
    if (
      typeof body.ratingTableId !== "number" ||
      !Number.isInteger(body.ratingTableId) ||
      body.ratingTableId < 1
    ) {
      return { ok: false, error: "ratingTableId must be a positive integer" };
    }
    ratingTableId = body.ratingTableId;
  }
  let ratingEnabled: boolean | undefined;
  if ("ratingEnabled" in body && body.ratingEnabled !== undefined) {
    if (typeof body.ratingEnabled !== "boolean") {
      return { ok: false, error: "ratingEnabled must be a boolean" };
    }
    ratingEnabled = body.ratingEnabled;
  }
  let ratingSeasonYear: number | null | undefined;
  if ("ratingSeasonYear" in body) {
    if (body.ratingSeasonYear === null) {
      ratingSeasonYear = null;
    } else if (
      typeof body.ratingSeasonYear === "number" &&
      Number.isInteger(body.ratingSeasonYear) &&
      body.ratingSeasonYear >= 2000 &&
      body.ratingSeasonYear <= 2100
    ) {
      ratingSeasonYear = body.ratingSeasonYear;
    } else if (body.ratingSeasonYear !== undefined) {
      return { ok: false, error: "ratingSeasonYear must be an integer year (2000–2100) or null" };
    }
  }
  let ratingSeasonMonth: number | null | undefined;
  if ("ratingSeasonMonth" in body) {
    if (body.ratingSeasonMonth === null) {
      ratingSeasonMonth = null;
    } else if (
      typeof body.ratingSeasonMonth === "number" &&
      Number.isInteger(body.ratingSeasonMonth) &&
      body.ratingSeasonMonth >= 1 &&
      body.ratingSeasonMonth <= 12
    ) {
      ratingSeasonMonth = body.ratingSeasonMonth;
    } else if (body.ratingSeasonMonth !== undefined) {
      return { ok: false, error: "ratingSeasonMonth must be an integer 1–12 or null" };
    }
  }
  return {
    ok: true,
    ratingGuaranteeEnabled,
    ratingGuaranteeBonusPoints,
    ratingPointsCoefficient,
    ratingBountyCoefficient,
    ratingTableId,
    ratingEnabled,
    ratingSeasonYear,
    ratingSeasonMonth,
  };
}

function structureFieldsForAudit(data: {
  name: string;
  playersLimit: number;
  stackSize: number;
  freezeOutEnabled: boolean;
  maxReentries: number;
  entryFreeOnly: boolean;
  blinds: BlindType[];
}) {
  return {
    name: data.name,
    playersLimit: data.playersLimit,
    stackSize: data.stackSize,
    freezeOutEnabled: data.freezeOutEnabled,
    maxReentries: data.maxReentries,
    entryFreeOnly: data.entryFreeOnly,
    blindsCount: data.blinds.length,
  };
}

export function tournamentRoutes() {
  const inGameUserStateService = new InGameUserStateService();
  const service = new TournamentService(inGameUserStateService);

  return {
    "/api/tournament-rating-matrix": {
      GET: async () => {
        return Response.json(getTournamentRatingMatrixPayload());
      },
    },
    "/api/rating-tables": {
      GET: async () => {
        const tables = await ratingTableRepository.list();
        return Response.json({
          ratingTables: tables.map((t) => getRatingTablePayload(t)),
        });
      },
    },
    "/api/rating-tables/:id": {
      GET: async (req: BunRequest<"/api/rating-tables/:id"> & { params: { id: string } }) => {
        const id = parseInt(req.params?.id ?? "", 10);
        if (Number.isNaN(id) || id < 1) {
          return new Response(
            JSON.stringify({ error: "id must be a positive integer" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const table = await ratingTableRepository.findById(id);
        if (!table) {
          return new Response(
            JSON.stringify({ error: "Rating table not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return Response.json(getRatingTablePayload(table));
      },
    },
    "/api/tournament-structures": {
      GET: async (req: BunRequest<"/api/tournament-structures">) => {
        const url = new URL(req.url);
        const offsetRaw = url.searchParams.get("offset");
        const limitRaw = url.searchParams.get("limit");
        const offset = offsetRaw != null ? parseInt(offsetRaw, 10) : undefined;
        const limit = limitRaw != null ? parseInt(limitRaw, 10) : undefined;
        if (offsetRaw != null && (Number.isNaN(offset ?? NaN) || (offset ?? 0) < 0)) {
          return new Response(
            JSON.stringify({ error: "offset must be a non-negative integer" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (limitRaw != null && (Number.isNaN(limit ?? NaN) || (limit ?? 0) < 1 || (limit ?? 0) > 1000)) {
          return new Response(
            JSON.stringify({ error: "limit must be an integer between 1 and 1000" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const structures = await service.listStructures(offset, limit);
        const body = structures.map((s) => structureResponseFromEntity(s));
        logger.info(
          {
            count: body.length,
            offset,
            limit,
            ids: body.map((s) => s.id),
            names: body.map((s) => s.name),
          },
          "[Structures] GET /api/tournament-structures → 200"
        );
        return Response.json({ structures: body });
      },
      POST: async (req: BunRequest<"/api/tournament-structures">) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const parsed = validateStructureBody(body);
        if (!parsed.ok) {
          return new Response(
            JSON.stringify({ error: parsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.createStructure(parsed.data);
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to create structure" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        const s = result.structure;
        return Response.json(structureResponseFromEntity(s), { status: 201 });
      },
    },
    "/api/tournament-structures/:id": {
      PATCH: async (
        req: BunRequest<"/api/tournament-structures/:id"> & { params: { id: string } }
      ) => {
        const idStr = req.params?.id;
        if (!idStr) {
          return new Response(
            JSON.stringify({ error: "id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const parsed = validateStructureBody(body);
        if (!parsed.ok) {
          return new Response(
            JSON.stringify({ error: parsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.updateStructure(id, parsed.data);
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Structure not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Failed to update structure" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        const s = result.structure;
        return Response.json(structureResponseFromEntity(s));
      },
    },
    "/api/tournaments": {
      GET: async (req: BunRequest<"/api/tournaments">) => {
        const url = new URL(req.url);
        const offsetRaw = url.searchParams.get("offset");
        const limitRaw = url.searchParams.get("limit");
        const offset = offsetRaw != null ? parseInt(offsetRaw, 10) : undefined;
        const limit = limitRaw != null ? parseInt(limitRaw, 10) : undefined;
        if (offsetRaw != null && (Number.isNaN(offset ?? NaN) || (offset ?? 0) < 0)) {
          return new Response(
            JSON.stringify({ error: "offset must be a non-negative integer" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (limitRaw != null && (Number.isNaN(limit ?? NaN) || (limit ?? 0) < 1 || (limit ?? 0) > 1000)) {
          return new Response(
            JSON.stringify({ error: "limit must be an integer between 1 and 1000" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const tournaments = await service.listTournaments(offset, limit);
        return Response.json({
          tournaments: tournaments.map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            date: t.date,
            ratingGuaranteeEnabled: t.ratingGuaranteeEnabled,
            ratingGuaranteeBonusPoints: t.ratingGuaranteeBonusPoints,
            ratingPointsCoefficient: t.ratingPointsCoefficient,
            ratingBountyCoefficient: t.ratingBountyCoefficient,
            ratingTableId: t.ratingTableId,
            ratingEnabled: t.ratingEnabled,
            ratingSeasonYear: t.ratingSeasonYear,
            ratingSeasonMonth: t.ratingSeasonMonth,
            lateRegistrationClosed: t.lateRegistrationClosed,
          })),
        });
      },
      POST: async (req: BunRequest<"/api/tournaments">) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof body !== "object" || body === null) {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const o = body as Record<string, unknown>;
        if (typeof o.name !== "string" || o.name.trim() === "") {
          return new Response(
            JSON.stringify({ error: "name is required and must be a non-empty string" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof o.date !== "number" || o.date < 0) {
          return new Response(
            JSON.stringify({ error: "date must be a non-negative number (Unix timestamp)" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const structureParsed = validateStructureBody(o.structure);
        if (!structureParsed.ok) {
          return new Response(
            JSON.stringify({ error: structureParsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const ratingParsed = parseOptionalTournamentRating(o);
        if (!ratingParsed.ok) {
          return new Response(
            JSON.stringify({ error: ratingParsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.createTournament({
          name: o.name.trim(),
          date: o.date,
          structure: structureParsed.data,
          ratingGuaranteeEnabled: ratingParsed.ratingGuaranteeEnabled,
          ratingGuaranteeBonusPoints: ratingParsed.ratingGuaranteeBonusPoints,
          ratingPointsCoefficient: ratingParsed.ratingPointsCoefficient,
          ratingBountyCoefficient: ratingParsed.ratingBountyCoefficient,
          ratingTableId: ratingParsed.ratingTableId,
          ratingEnabled: ratingParsed.ratingEnabled,
          ratingSeasonYear: ratingParsed.ratingSeasonYear,
          ratingSeasonMonth: ratingParsed.ratingSeasonMonth,
        });
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to create tournament" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(result.tournament.id, TournamentAuditEventType.TournamentCreated, {
          name: result.tournament.name,
          date: result.tournament.date,
          status: result.tournament.status,
          structure: structureFieldsForAudit(structureParsed.data),
        });
        return Response.json(result.tournament, { status: 201 });
      },
    },
    "/api/tournaments/:id": {
      GET: async (
        req: BunRequest<"/api/tournaments/:id"> & { params: { id: string } }
      ) => {
        const idStr = req.params?.id;
        if (!idStr) {
          return new Response(
            JSON.stringify({ error: "id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const tournament = await service.getTournament(id);
        if (!tournament) {
          return new Response(
            JSON.stringify({ error: "Tournament not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return Response.json(tournament);
      },
      PATCH: async (
        req: BunRequest<"/api/tournaments/:id"> & { params: { id: string } }
      ) => {
        const idStr = req.params?.id;
        if (!idStr) {
          return new Response(
            JSON.stringify({ error: "id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof body !== "object" || body === null) {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const o = body as Record<string, unknown>;
        if (typeof o.name !== "string" || o.name.trim() === "") {
          return new Response(
            JSON.stringify({ error: "name is required and must be a non-empty string" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof o.date !== "number" || o.date < 0) {
          return new Response(
            JSON.stringify({ error: "date must be a non-negative number (Unix timestamp)" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const validStatuses = ["registration_open", "in_progress", "completed"];
        if (typeof o.status !== "string" || !validStatuses.includes(o.status)) {
          return new Response(
            JSON.stringify({ error: "status must be one of: registration_open, in_progress, completed" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const ratingParsed = parseOptionalTournamentRating(o);
        if (!ratingParsed.ok) {
          return new Response(
            JSON.stringify({ error: ratingParsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.updateTournament(id, {
          name: o.name.trim(),
          date: o.date,
          status: o.status,
          ratingGuaranteeEnabled: ratingParsed.ratingGuaranteeEnabled,
          ratingGuaranteeBonusPoints: ratingParsed.ratingGuaranteeBonusPoints,
          ratingPointsCoefficient: ratingParsed.ratingPointsCoefficient,
          ratingBountyCoefficient: ratingParsed.ratingBountyCoefficient,
          ratingTableId: ratingParsed.ratingTableId,
          ratingEnabled: ratingParsed.ratingEnabled,
          ratingSeasonYear: ratingParsed.ratingSeasonYear,
          ratingSeasonMonth: ratingParsed.ratingSeasonMonth,
        });
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Tournament not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "invalid_status") {
            return new Response(
              JSON.stringify({ error: "Invalid status" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Failed to update tournament" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(id, TournamentAuditEventType.TournamentMetaUpdated, {
          name: result.tournament.name,
          date: result.tournament.date,
          status: result.tournament.status,
          ratingGuaranteeEnabled: result.tournament.ratingGuaranteeEnabled,
          ratingGuaranteeBonusPoints: result.tournament.ratingGuaranteeBonusPoints,
          ratingPointsCoefficient: result.tournament.ratingPointsCoefficient,
          ratingBountyCoefficient: result.tournament.ratingBountyCoefficient,
          ratingTableId: result.tournament.ratingTableId,
        });
        // Rating settings describe how THIS tournament pays: when they change,
        // already-frozen numbers (snapshots of eliminated players on a live
        // game; persisted facts/results on a completed one) are repriced so
        // stored ratings always match the settings the admin sees.
        const ratingSettingsTouched = [
          ratingParsed.ratingGuaranteeEnabled,
          ratingParsed.ratingGuaranteeBonusPoints,
          ratingParsed.ratingPointsCoefficient,
          ratingParsed.ratingBountyCoefficient,
          ratingParsed.ratingTableId,
          ratingParsed.ratingEnabled,
        ].some((v) => v !== undefined);
        if (ratingSettingsTouched) {
          const reprice = await repriceTournamentRating(id);
          if (!reprice.ok) {
            logger.info(
              { tournamentId: id, error: reprice.error },
              "[TournamentRoute] rating reprice after settings change failed"
            );
          } else if (reprice.repriced > 0) {
            logger.info(
              { tournamentId: id, repriced: reprice.repriced },
              "[TournamentRoute] rating repriced after settings change"
            );
          }
        }
        return Response.json(result.tournament);
      },
    },
    "/api/tournaments/:id/status": {
      PATCH: async (
        req: BunRequest<"/api/tournaments/:id/status"> & { params: { id: string } }
      ) => {
        const idStr = req.params?.id;
        if (!idStr) {
          return new Response(
            JSON.stringify({ error: "id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof body !== "object" || body === null) {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const o = body as Record<string, unknown>;
        const validStatuses = ["registration_open", "in_progress", "completed"];
        if (typeof o.status !== "string" || !validStatuses.includes(o.status)) {
          return new Response(
            JSON.stringify({ error: "status must be one of: registration_open, in_progress, completed" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.updateTournamentStatus(id, o.status);
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Tournament not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Invalid status" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(id, TournamentAuditEventType.TournamentStatusChanged, {
          status: o.status,
        });
        return Response.json(result.tournament);
      },
    },
    "/api/tournaments/:id/clock": {
      GET: async (
        req: BunRequest<"/api/tournaments/:id/clock"> & { params: { id: string } }
      ) => {
        const idStr = req.params?.id;
        if (!idStr) {
          return new Response(
            JSON.stringify({ error: "id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const tick = await tournamentClockService.getTick(id);
        if (!tick) {
          return new Response(
            JSON.stringify({ error: "Tournament not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return Response.json(tick);
      },
      PATCH: async (
        req: BunRequest<"/api/tournaments/:id/clock"> & { params: { id: string } }
      ) => {
        const idStr = req.params?.id;
        if (!idStr) {
          return new Response(
            JSON.stringify({ error: "id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const parsed = parseClockPatch(body);
        if (!parsed.ok) {
          return new Response(
            JSON.stringify({ error: parsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const clockAudit: Record<string, unknown> = {};

        if (parsed.extendCurrentLevelSec !== undefined) {
          const r = await tournamentClockService.extendCurrentLevel(
            id,
            parsed.extendCurrentLevelSec
          );
          if (!r.ok) {
            const status =
              r.error === "not_found"
                ? 404
                : r.error === "failed"
                  ? 500
                  : r.error === "bad_request"
                    ? 400
                    : 400;
            const msg =
              r.error === "not_found"
                ? "Tournament not found"
                : r.error === "not_in_progress"
                  ? "Tournament must be in_progress"
                  : r.error === "no_clock"
                    ? "Clock not started for this tournament"
                    : r.error === "bad_request"
                      ? "Cannot extend clock in current state"
                      : "Failed to update clock";
            return new Response(
              JSON.stringify({ error: msg }),
              { status, headers: { "Content-Type": "application/json" } }
            );
          }
          clockAudit.extendCurrentLevelSec = parsed.extendCurrentLevelSec;
        }

        if (parsed.paused !== undefined) {
          const r = parsed.paused
            ? await tournamentClockService.pause(id)
            : await tournamentClockService.resume(id);
          if (!r.ok) {
            const status =
              r.error === "not_found"
                ? 404
                : r.error === "failed"
                  ? 500
                  : 400;
            const msg =
              r.error === "not_found"
                ? "Tournament not found"
                : r.error === "not_in_progress"
                  ? "Tournament must be in_progress"
                  : r.error === "no_clock"
                    ? "Clock not started for this tournament"
                    : r.error === "bad_request"
                      ? "Invalid clock operation"
                      : "Failed to update clock";
            return new Response(
              JSON.stringify({ error: msg }),
              { status, headers: { "Content-Type": "application/json" } }
            );
          }
          clockAudit.paused = parsed.paused;
        }

        await writeTournamentAuditLog(id, TournamentAuditEventType.TournamentClockPatch, clockAudit);
        return new Response(null, { status: 204 });
      },
    },
    "/api/tournaments/:id/structure": {
      PATCH: async (
        req: BunRequest<"/api/tournaments/:id/structure"> & { params: { id: string } }
      ) => {
        const tournamentId = req.params?.id;
        if (!tournamentId) {
          return new Response(
            JSON.stringify({ error: "tournament id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const parsed = validateStructureBody(body);
        if (!parsed.ok) {
          return new Response(
            JSON.stringify({ error: parsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.updateTournamentStructure(tournamentId, parsed.data);
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Tournament not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Failed to update tournament structure" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        const tid = parseInt(tournamentId, 10);
        if (!Number.isNaN(tid)) {
          await writeTournamentAuditLog(
            tid,
            TournamentAuditEventType.TournamentStructureCacheUpdated,
            { structure: structureFieldsForAudit(parsed.data) }
          );
        }
        return new Response(null, { status: 204 });
      },
    },
    "/api/tournaments/:id/players/:playerId/rating-manual-adjustment": {
      PATCH: async (
        req: BunRequest<"/api/tournaments/:id/players/:playerId/rating-manual-adjustment"> & {
          params: { id: string; playerId: string };
        }
      ) => {
        const idStr = req.params?.id;
        const playerId = req.params?.playerId;
        if (!idStr || !playerId) {
          return new Response(
            JSON.stringify({ error: "id and playerId are required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof body !== "object" || body === null) {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const o = body as Record<string, unknown>;
        if (typeof o.manualAdjustment !== "number" || !Number.isFinite(o.manualAdjustment)) {
          return new Response(
            JSON.stringify({ error: "manualAdjustment must be a finite number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.setRatingManualAdjustment(id, playerId, o.manualAdjustment);
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Tournament not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          if (result.error === "not_completed") {
            return new Response(
              JSON.stringify({
                error: "Rating manual adjustment is only allowed for completed tournaments",
              }),
              { status: 409, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Player not in tournament results" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(id, TournamentAuditEventType.TournamentRatingManualAdjustment, {
          playerId,
          manualAdjustment: o.manualAdjustment,
        });
        return new Response(null, { status: 204 });
      },
    },
    "/api/tournaments/:id/late-registration": {
      PATCH: async (
        req: BunRequest<"/api/tournaments/:id/late-registration"> & { params: { id: string } }
      ) => {
        const idStr = req.params?.id;
        if (!idStr) {
          return new Response(
            JSON.stringify({ error: "id is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          return new Response(
            JSON.stringify({ error: "id must be a number" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof body !== "object" || body === null) {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const o = body as Record<string, unknown>;
        if (typeof o.lateRegistrationClosed !== "boolean") {
          return new Response(
            JSON.stringify({ error: "lateRegistrationClosed must be a boolean" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const result = await service.setLateRegistrationClosed(id, o.lateRegistrationClosed);
        if (!result.ok) {
          if (result.error === "not_found") {
            return new Response(
              JSON.stringify({ error: "Tournament not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: "Failed to update late registration flag" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        await writeTournamentAuditLog(id, TournamentAuditEventType.TournamentLateRegistrationClosed, {
          lateRegistrationClosed: o.lateRegistrationClosed,
        });
        return Response.json(result.tournament);
      },
    },
    "/api/seasonal-rating": {
      GET: async (req: BunRequest<"/api/seasonal-rating">) => {
        const url = new URL(req.url);
        const yearRaw = url.searchParams.get("year");
        const monthRaw = url.searchParams.get("month");
        if (!yearRaw || !monthRaw) {
          return new Response(
            JSON.stringify({ error: "year and month query parameters are required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const year = parseInt(yearRaw, 10);
        const month = parseInt(monthRaw, 10);
        if (Number.isNaN(year) || year < 2000 || year > 2100) {
          return new Response(
            JSON.stringify({ error: "year must be an integer between 2000 and 2100" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (Number.isNaN(month) || month < 1 || month > 12) {
          return new Response(
            JSON.stringify({ error: "month must be an integer between 1 and 12" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        const entries = await service.getSeasonalRating(year, month);
        return Response.json({ year, month, entries });
      },
    },
  };
}
