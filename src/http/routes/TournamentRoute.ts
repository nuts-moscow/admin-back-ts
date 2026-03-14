import type { BunRequest } from "bun";
import type { BlindType } from "../../domain/BlindType";
import { TournamentService } from "../services/TournamentService";

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
  return o.type === "Break" && typeof o.id === "number" && typeof o.duration === "number";
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
  data: { name: string; playersLimit: number; stackSize: number; freezeOutEnabled: boolean; blinds: BlindType[] };
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
  if (typeof o.freezeOutEnabled !== "boolean") {
    return { ok: false, error: "freezeOutEnabled must be a boolean" };
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
      freezeOutEnabled: o.freezeOutEnabled,
      blinds,
    },
  };
}

export function tournamentRoutes() {
  const service = new TournamentService();

  return {
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
        return Response.json({
          structures: structures.map((s) => ({
            id: s.id,
            name: s.name,
            playersLimit: s.playersLimit,
            stackSize: s.stackSize,
            freezeOutEnabled: s.freezeOutEnabled,
            blindsStructure: s.blindsStructure,
          })),
        });
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
        return Response.json(
          {
            id: s.id,
            name: s.name,
            playersLimit: s.playersLimit,
            stackSize: s.stackSize,
            freezeOutEnabled: s.freezeOutEnabled,
            blindsStructure: s.blindsStructure,
          },
          { status: 201 }
        );
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
        return Response.json({
          id: s.id,
          name: s.name,
          playersLimit: s.playersLimit,
          stackSize: s.stackSize,
          freezeOutEnabled: s.freezeOutEnabled,
          blindsStructure: s.blindsStructure,
        });
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
        const result = await service.createTournament({
          name: o.name.trim(),
          date: o.date,
          structure: structureParsed.data,
        });
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to create tournament" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        return Response.json(result.tournament, { status: 201 });
      },
    },
    "/api/tournaments/:id": {
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
        const result = await service.updateTournament(id, {
          name: o.name.trim(),
          date: o.date,
          status: o.status,
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
        return Response.json(result.tournament);
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
        return new Response(null, { status: 204 });
      },
    },
  };
}
