import type { BunRequest } from "bun";
import { hallOfFameRepository } from "../../postgres/HallOfFameRepository";

function badRequest(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function requireJsonContentType(req: Request): Response | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return new Response(
      JSON.stringify({ error: "Content-Type must be application/json" }),
      { status: 415, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

function serializeEntry(row: Awaited<ReturnType<typeof hallOfFameRepository.list>>[number]) {
  return {
    id: row.id,
    year: row.year,
    playerId: row.playerId,
    nickname: row.nickname,
    name: row.name,
    title: row.title,
    stat: row.stat,
    position: row.position,
  };
}

export function hallOfFameRoutes() {
  return {
    "/api/hall-of-fame": {
      GET: async () => {
        const rows = await hallOfFameRepository.list();
        return Response.json({ entries: rows.map(serializeEntry) });
      },
      POST: async (req: BunRequest) => {
        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return badRequest("Invalid JSON");
        }
        if (!body || typeof body !== "object") return badRequest("Invalid body");
        const b = body as Record<string, unknown>;
        const year = Number(b.year);
        const position = Number(b.position);
        if (!Number.isInteger(year)) return badRequest("year required");
        if (!Number.isInteger(position) || position < 1) return badRequest("position must be >= 1");
        if (typeof b.nickname !== "string" || b.nickname.length === 0) return badRequest("nickname required");
        if (typeof b.title !== "string" || b.title.length === 0) return badRequest("title required");
        if (typeof b.stat !== "string" || b.stat.length === 0) return badRequest("stat required");

        const created = await hallOfFameRepository.create({
          year,
          position,
          playerId: b.playerId != null && b.playerId !== "" ? Number(b.playerId) : null,
          nickname: b.nickname,
          name: typeof b.name === "string" ? b.name : null,
          title: b.title,
          stat: b.stat,
        });
        if (!created) return new Response(JSON.stringify({ error: "Failed" }), { status: 500 });
        return Response.json(serializeEntry(created), { status: 201 });
      },
    },
    "/api/hall-of-fame/:id": {
      GET: async (req: BunRequest<"/api/hall-of-fame/:id"> & { params: { id: string } }) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return badRequest("invalid id");
        const row = await hallOfFameRepository.findById(id);
        if (!row) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json(serializeEntry(row));
      },
      PATCH: async (req: BunRequest<"/api/hall-of-fame/:id"> & { params: { id: string } }) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return badRequest("invalid id");
        const ctErr = requireJsonContentType(req);
        if (ctErr) return ctErr;
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return badRequest("Invalid JSON");
        }
        if (!body || typeof body !== "object") return badRequest("Invalid body");
        const b = body as Record<string, unknown>;
        const updated = await hallOfFameRepository.update(id, {
          year: b.year !== undefined ? Number(b.year) : undefined,
          position: b.position !== undefined ? Number(b.position) : undefined,
          playerId:
            b.playerId === undefined
              ? undefined
              : b.playerId === null
                ? null
                : Number(b.playerId),
          nickname: typeof b.nickname === "string" ? b.nickname : undefined,
          name: b.name === undefined ? undefined : b.name === null ? null : String(b.name),
          title: typeof b.title === "string" ? b.title : undefined,
          stat: typeof b.stat === "string" ? b.stat : undefined,
        });
        if (!updated) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json(serializeEntry(updated));
      },
      DELETE: async (req: BunRequest<"/api/hall-of-fame/:id"> & { params: { id: string } }) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return badRequest("invalid id");
        const ok = await hallOfFameRepository.delete(id);
        if (!ok) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 204 });
      },
    },
  };
}
