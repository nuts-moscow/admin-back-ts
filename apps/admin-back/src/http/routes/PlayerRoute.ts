import type { BunRequest } from "bun";
import { tournamentStructureCache } from "../../cache";
import type { BlindType } from "../../domain/BlindType";
import { InGamePlayerStatus, type InGameUserState } from "../../domain/cache/InGameUserState";
import { logger } from "../../logger";
import { hallOfFameRepository } from "../../postgres/HallOfFameRepository";
import { playerRepository } from "../../postgres/PlayerRepository";
import { PostgresClient } from "../../postgres/PostgresClient";
import {
  playerTournamentRatingFactsRepository,
  type SeasonalRatingEntry,
} from "../../postgres/PlayerTournamentRatingFactsRepository";
import { tournamentRepository, type TournamentRow } from "../../postgres/TournamentRepository";
import { tournamentResultRepository } from "../../postgres/TournamentResultRepository";
import { InGameUserStateService } from "../services/InGameUserStateService";
import { tournamentClockService } from "../services/TournamentClockService";
import type { PlayerAuthContext } from "../middleware/playerAuth";

export type PlayerRequest = Request & { playerAuthCtx?: PlayerAuthContext };

function getCtx(req: Request): PlayerAuthContext | null {
  return (req as PlayerRequest).playerAuthCtx ?? null;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(error = "Not found"): Response {
  return new Response(JSON.stringify({ error }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

const inGameService = new InGameUserStateService();

/** True when player has joined play (paid or unpaid), false for Registered/Out/missing. */
function isAlive(state: InGameUserState): boolean {
  return (
    state.status === InGamePlayerStatus.InGamePaid ||
    state.status === InGamePlayerStatus.InGameNotPaid
  );
}

function isOut(state: InGameUserState): boolean {
  return state.status === InGamePlayerStatus.Out;
}

function statusForWire(state: InGameUserState): "registered" | "in_game" | "out" {
  if (isOut(state)) return "out";
  if (isAlive(state)) return "in_game";
  return "registered";
}

function pickActiveBlind(blinds: BlindType[], idx: number | null): {
  current: ReturnType<typeof blindToWire> | null;
  next: ReturnType<typeof blindToWire> | null;
} {
  if (idx === null || idx < 0) return { current: null, next: null };
  const current = blinds[idx];
  const next = blinds[idx + 1];
  return {
    current: current ? blindToWire(current) : null,
    next: next ? blindToWire(next) : null,
  };
}

function blindToWire(b: BlindType): {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMin: number;
  isBreak: boolean;
} {
  if (b.type === "Break") {
    return {
      level: 0,
      smallBlind: 0,
      bigBlind: 0,
      ante: 0,
      durationMin: b.duration,
      isBreak: true,
    };
  }
  return {
    level: b.level,
    smallBlind: b.smallBlind,
    bigBlind: b.bigBlind,
    ante: b.ante ? b.bigBlind : 0,
    durationMin: b.duration,
    isBreak: false,
  };
}

interface TournamentSummaryPayload {
  id: number;
  name: string;
  status: string;
  date: number;
  buyin: number;
  reentryPrice: number;
  guarantee: number | null;
  startingStack: number | null;
  lateRegistrationClosed: boolean;
  registeredCount: number;
  aliveCount: number;
  eliminatedCount: number;
  averageStack: number | null;
  currentLevelNo: number | null;
  currentBlinds: ReturnType<typeof blindToWire> | null;
  nextBlinds: ReturnType<typeof blindToWire> | null;
  levelTimeRemainingSec: number | null;
}

async function buildTournamentSummary(
  tournament: TournamentRow,
  states: InGameUserState[]
): Promise<TournamentSummaryPayload> {
  const aliveStates = states.filter(isAlive);
  const eliminatedStates = states.filter(isOut);

  const structure = await tournamentStructureCache.get(String(tournament.id));
  const aliveCount = aliveStates.length;
  const registeredCount = states.length;
  const eliminatedCount = eliminatedStates.length;

  // Stacks aren't persisted on InGameUserState — admin tracks chip-pool elsewhere.
  // Fallback: when alive players exist and we know the structure, report the starting stack
  // (so the FE always has a non-null number for the AVG tile). Real AVG arrives once
  // chip-pool tracking lands on the player API.
  const averageStack = structure != null && aliveCount > 0 ? structure.stackSize : null;

  let currentLevelNo: number | null = null;
  let currentBlinds: ReturnType<typeof blindToWire> | null = null;
  let nextBlinds: ReturnType<typeof blindToWire> | null = null;
  let levelTimeRemainingSec: number | null = null;

  if (tournament.status === "in_progress") {
    const tick = await tournamentClockService.getTick(tournament.id);
    if (tick) {
      levelTimeRemainingSec = tick.secondsRemaining;
      const blinds = structure?.blindsStructure ?? [];
      const picked = pickActiveBlind(blinds, tick.currentStepIndex);
      currentBlinds = picked.current;
      nextBlinds = picked.next;
      currentLevelNo =
        picked.current && !picked.current.isBreak ? picked.current.level : null;
    }
  }

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    date: epochMs(tournament.date),
    buyin: tournament.entryPrice,
    reentryPrice: tournament.reentryPrice,
    guarantee: null,
    startingStack: structure?.stackSize ?? null,
    lateRegistrationClosed: tournament.lateRegistrationClosed,
    registeredCount,
    aliveCount,
    eliminatedCount,
    averageStack,
    currentLevelNo,
    currentBlinds,
    nextBlinds,
    levelTimeRemainingSec,
  };
}

async function loadStatesAndNicknames(tournamentId: number): Promise<{
  states: InGameUserState[];
  nicknameByPlayerId: Map<number, string>;
}> {
  const states = await inGameService.getAllByTournament(String(tournamentId));
  const ids = Array.from(new Set(states.map((s) => Number(s.playerId)).filter((n) => !Number.isNaN(n))));
  const nicknameByPlayerId = new Map<number, string>();
  await Promise.all(
    ids.map(async (id) => {
      const nick = await playerRepository.getNicknameById(String(id));
      if (nick) nicknameByPlayerId.set(id, nick);
    })
  );
  return { states, nicknameByPlayerId };
}

/**
 * The `tournaments.date` column is `bigint` and the rest of the codebase has been
 * inconsistent about whether it stores Unix **seconds** or **milliseconds**. Old
 * production rows are seconds (e.g. 1779897600 → 2026-05-21), but JS `new Date()`
 * and the player-web FE expect milliseconds. Normalize on the API boundary so
 * downstream consumers always see ms, without having to migrate the DB.
 *
 * Heuristic: any value below 10^12 must be seconds (10^12 ms = year 33658, so
 * any realistic "now"-ish ms value is ≥ 10^12; 10^12 seconds is year 33658, so
 * any realistic seconds value is ≤ 10^11). Threshold sits comfortably between.
 */
function epochMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1_000_000_000_000 ? Math.round(value * 1000) : value;
}

function tableFromState(state: InGameUserState): number | null {
  if (state.tableId == null) return null;
  const n = parseInt(state.tableId, 10);
  return Number.isNaN(n) ? null : n;
}

interface PlayerHistoryRow {
  tournamentId: number;
  date: number;
  name: string;
  buyin: number;
  place: number | null;
  fieldSize: number;
  pointsDelta: number;
}

function seasonLabel(year: number, month: number): string {
  const monthsRu = [
    "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
  ];
  const m = monthsRu[month - 1] ?? "?";
  return `${m} '${String(year).slice(-2)}`;
}

function compareSeasonsDesc(
  a: { year: number; month: number },
  b: { year: number; month: number }
): number {
  if (a.year !== b.year) return b.year - a.year;
  return b.month - a.month;
}

function isCurrentSeason(year: number, month: number, now: Date): boolean {
  return year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
}

function rankSeasonalEntries(
  entries: SeasonalRatingEntry[]
): Array<SeasonalRatingEntry & { rank: number }> {
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function playerRoutes() {
  return {
    "/api/player/me": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const player = await playerRepository.findById(String(ctx.playerId));
        if (!player) return notFound("Player not found");

        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;
        const seasonRows = await playerTournamentRatingFactsRepository.getSeasonalRating(year, month);
        const ranked = rankSeasonalEntries(seasonRows);
        const me = ranked.find((r) => Number(r.playerId) === ctx.playerId);

        let medal: "gold" | "silver" | "bronze" | "none" = "none";
        if (me) {
          if (me.rank === 1) medal = "gold";
          else if (me.rank === 2) medal = "silver";
          else if (me.rank === 3) medal = "bronze";
        }

        return Response.json({
          id: player.id,
          nickname: player.nickname,
          name: player.name,
          email: "", // populated from /me handler in PlayerAuthRoute; here we don't need to leak email again
          joinedAt: player.createdAt.toISOString(),
          rank: me?.rank ?? null,
          points: me?.totalPoints ?? 0,
          playedTournaments: me?.tournamentCount ?? 0,
          wins: 0,
          finalTables: 0,
          itm: 0,
          freeEntryCount: player.freeEntryCount,
          freeReentryCount: player.freeReentryCount,
          bountyCount: 0,
          medal,
          eloLite: {
            value: Math.round(1500 + (me?.totalPoints ?? 0) / 50),
            peak: Math.round(1500 + (me?.totalPoints ?? 0) / 50),
            change30d: 0,
          },
        });
      },
      PATCH: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return badRequest("Invalid JSON");
        }
        if (!body || typeof body !== "object") return badRequest("Invalid body");
        const { nickname } = body as Record<string, unknown>;
        if (nickname !== undefined && (typeof nickname !== "string" || nickname.trim().length === 0)) {
          return badRequest("nickname must be a non-empty string when provided");
        }
        const updated = await playerRepository.update(String(ctx.playerId), {
          nickname: typeof nickname === "string" ? nickname.trim() : undefined,
        });
        if (!updated) return notFound("Player not found");
        return Response.json({ id: updated.id, nickname: updated.nickname, name: updated.name });
      },
    },

    "/api/player/me/tournaments/history": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();

        // Pull all rating facts for this player, then load matching tournament rows.
        const factsRes = await queryPlayerRatingFacts(ctx.playerId);
        if (factsRes.length === 0) {
          return Response.json({ entries: [] });
        }
        const tournamentIds = Array.from(new Set(factsRes.map((f) => f.tournamentId)));
        const tournamentRows = await Promise.all(
          tournamentIds.map((id) => tournamentRepository.findById(id))
        );
        const tournamentById = new Map<number, TournamentRow>();
        for (const t of tournamentRows) if (t) tournamentById.set(t.id, t);

        const resultsByTournament = await Promise.all(
          tournamentIds.map(async (id) => ({
            id,
            rows: await tournamentResultRepository.findByTournamentId(id),
          }))
        );
        const fieldByTournament = new Map<number, number>();
        for (const { id, rows } of resultsByTournament) {
          fieldByTournament.set(
            id,
            rows.filter((r) => r.status !== "Registered" && r.status !== "registered").length || rows.length
          );
        }

        const entries: PlayerHistoryRow[] = factsRes
          .map((f) => {
            const t = tournamentById.get(f.tournamentId);
            if (!t) return null;
            return {
              tournamentId: f.tournamentId,
              date: epochMs(t.date),
              name: t.name,
              buyin: t.entryPrice,
              place: f.placement,
              fieldSize: fieldByTournament.get(f.tournamentId) ?? 0,
              pointsDelta: f.totalPoints,
            };
          })
          .filter((x): x is PlayerHistoryRow => x !== null)
          .sort((a, b) => b.date - a.date);

        return Response.json({
          entries: entries.map((e) => ({
            tournamentId: e.tournamentId,
            date: new Date(e.date).toISOString(),
            name: e.name,
            buyin: e.buyin,
            place: e.place,
            fieldSize: e.fieldSize,
            prize: null,
            eloDelta: 0,
            pointsDelta: e.pointsDelta,
          })),
        });
      },
    },

    "/api/player/me/tournaments/:tournamentId/state": {
      GET: async (
        req: BunRequest<"/api/player/me/tournaments/:tournamentId/state"> & {
          params: { tournamentId: string };
        }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const tournamentId = parseInt(req.params.tournamentId, 10);
        if (Number.isNaN(tournamentId) || tournamentId < 1) return badRequest("Invalid tournamentId");
        const state = await inGameService.getUser(String(ctx.playerId), String(tournamentId));
        if (!state) return notFound("Not registered in this tournament");
        return Response.json({
          tournamentId,
          status: statusForWire(state),
          stack: null,
          table: tableFromState(state),
          seat: null,
          place: state.placement,
          bountyCount: state.bountyCount,
          reentriesUsed: state.totalReentryCount,
        });
      },
    },

    "/api/player/tournaments/:id/register": {
      POST: async (
        req: BunRequest<"/api/player/tournaments/:id/register"> & { params: { id: string } }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const tournamentId = parseInt(req.params.id, 10);
        if (Number.isNaN(tournamentId) || tournamentId < 1) return badRequest("Invalid tournament id");
        const tournament = await tournamentRepository.findById(tournamentId);
        if (!tournament) return notFound("Tournament not found");
        if (tournament.status === "completed") {
          return badRequest("Tournament already completed");
        }
        if (tournament.status === "in_progress" && tournament.lateRegistrationClosed) {
          return badRequest("Late registration is closed");
        }
        const existing = await inGameService.getUser(String(ctx.playerId), String(tournamentId));
        if (existing) {
          return Response.json(
            {
              tournamentId,
              status: statusForWire(existing),
              alreadyRegistered: true,
            },
            { status: 200 }
          );
        }
        const ok = await inGameService.addPlayerToTournament(
          String(ctx.playerId),
          String(tournamentId)
        );
        if (!ok) {
          logger.error(
            { playerId: ctx.playerId, tournamentId },
            "[Player] addPlayerToTournament failed"
          );
          return new Response(JSON.stringify({ error: "Failed to register" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({
          tournamentId,
          status: "registered",
          alreadyRegistered: false,
        });
      },
      DELETE: async (
        req: BunRequest<"/api/player/tournaments/:id/register"> & { params: { id: string } }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const tournamentId = parseInt(req.params.id, 10);
        if (Number.isNaN(tournamentId) || tournamentId < 1) return badRequest("Invalid tournament id");
        const state = await inGameService.getUser(String(ctx.playerId), String(tournamentId));
        if (!state) return notFound("Not registered");
        if (state.status !== InGamePlayerStatus.Registered) {
          return badRequest("Cannot cancel after game start");
        }
        const ok = await inGameService.removePlayerFromTournament(
          String(ctx.playerId),
          String(tournamentId)
        );
        if (!ok) {
          return new Response(JSON.stringify({ error: "Failed to cancel" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 204 });
      },
    },

    "/api/player/tournaments": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const url = new URL(req.url);
        const statusFilter = url.searchParams.get("status");
        const all = await tournamentRepository.list({ limit: 200 });
        let filtered = all;
        if (statusFilter) {
          filtered = all.filter((t) => t.status === statusFilter);
        } else {
          filtered = all.filter((t) => t.status !== "completed");
        }
        const summaries = await Promise.all(
          filtered.map(async (t) => {
            const { states } = await loadStatesAndNicknames(t.id);
            return buildTournamentSummary(t, states);
          })
        );
        return Response.json({ tournaments: summaries });
      },
    },

    "/api/player/tournaments/upcoming": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const url = new URL(req.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);
        const all = await tournamentRepository.list({ limit: 200 });
        const upcoming = all
          .filter((t) => t.status === "registration_open")
          .sort((a, b) => a.date - b.date)
          .slice(0, limit);
        const summaries = await Promise.all(
          upcoming.map(async (t) => {
            const { states } = await loadStatesAndNicknames(t.id);
            return buildTournamentSummary(t, states);
          })
        );
        return Response.json({ tournaments: summaries });
      },
    },

    "/api/player/tournaments/:id": {
      GET: async (
        req: BunRequest<"/api/player/tournaments/:id"> & { params: { id: string } }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id < 1) return badRequest("Invalid id");
        const tournament = await tournamentRepository.findById(id);
        if (!tournament) return notFound("Tournament not found");
        const { states } = await loadStatesAndNicknames(id);
        const summary = await buildTournamentSummary(tournament, states);
        const structure = await tournamentStructureCache.get(String(id));
        return Response.json({
          ...(summary as object),
          structure: structure
            ? {
                name: structure.name,
                playersLimit: structure.playersLimit,
                stackSize: structure.stackSize,
                freezeOutEnabled: structure.freezeOutEnabled,
                maxReentries: structure.maxReentries,
                levelDurationSec: null,
                blinds: structure.blindsStructure.map(blindToWire),
              }
            : null,
          totalChips: structure ? structure.stackSize * states.length : null,
          chipLeader: null,
        });
      },
    },

    "/api/player/tournaments/:id/players": {
      GET: async (
        req: BunRequest<"/api/player/tournaments/:id/players"> & { params: { id: string } }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id < 1) return badRequest("Invalid id");
        const { states, nicknameByPlayerId } = await loadStatesAndNicknames(id);
        return Response.json({
          players: states.map((s) => {
            const pid = Number(s.playerId);
            return {
              playerId: pid,
              nickname: nicknameByPlayerId.get(pid) ?? `#${pid}`,
              status: statusForWire(s),
              stack: null,
              table: tableFromState(s),
              seat: null,
              place: s.placement,
              isMe: pid === ctx.playerId,
            };
          }),
        });
      },
    },

    "/api/player/tournaments/:id/tables": {
      GET: async (
        req: BunRequest<"/api/player/tournaments/:id/tables"> & { params: { id: string } }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id < 1) return badRequest("Invalid id");
        const { states, nicknameByPlayerId } = await loadStatesAndNicknames(id);
        const myState = states.find((s) => Number(s.playerId) === ctx.playerId);
        const myTable = myState ? tableFromState(myState) : null;
        const byTable = new Map<number, InGameUserState[]>();
        for (const s of states) {
          const t = tableFromState(s);
          if (t === null) continue;
          if (!isAlive(s)) continue;
          if (!byTable.has(t)) byTable.set(t, []);
          byTable.get(t)!.push(s);
        }
        const tables = Array.from(byTable.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([tableNum, ss]) => ({
            table: tableNum,
            playersCount: ss.length,
            averageStack: null,
            mine: tableNum === myTable,
            seats:
              tableNum === myTable
                ? ss.map((s, idx) => ({
                    seat: idx + 1,
                    playerId: Number(s.playerId),
                    nickname: nicknameByPlayerId.get(Number(s.playerId)) ?? `#${s.playerId}`,
                    stack: null,
                    status: statusForWire(s),
                    isMe: Number(s.playerId) === ctx.playerId,
                  }))
                : undefined,
          }));
        return Response.json({ tables });
      },
    },

    "/api/player/rating/seasons": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const all = await tournamentRepository.list({ limit: 1000 });
        const set = new Set<string>();
        const seasons: Array<{ year: number; month: number }> = [];
        for (const t of all) {
          if (t.ratingSeasonYear != null && t.ratingSeasonMonth != null) {
            const key = `${t.ratingSeasonYear}-${t.ratingSeasonMonth}`;
            if (!set.has(key)) {
              set.add(key);
              seasons.push({ year: t.ratingSeasonYear, month: t.ratingSeasonMonth });
            }
          }
        }
        seasons.sort(compareSeasonsDesc);
        const now = new Date();
        return Response.json({
          seasons: seasons.map((s) => ({
            year: s.year,
            month: s.month,
            label: seasonLabel(s.year, s.month),
            isCurrent: isCurrentSeason(s.year, s.month, now),
          })),
        });
      },
    },

    "/api/player/rating/season": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const url = new URL(req.url);
        const year = parseInt(url.searchParams.get("year") ?? "", 10);
        const month = parseInt(url.searchParams.get("month") ?? "", 10);
        if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
          return badRequest("year and month query params required");
        }
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
        const rows = await playerTournamentRatingFactsRepository.getSeasonalRating(year, month);
        const ranked = rankSeasonalEntries(rows).slice(0, limit);
        const playerIds = Array.from(new Set(ranked.map((r) => Number(r.playerId))));
        const nameByPlayerId = new Map<number, { nickname: string; name: string | null }>();
        await Promise.all(
          playerIds.map(async (id) => {
            const p = await playerRepository.findById(String(id));
            if (p) nameByPlayerId.set(id, { nickname: p.nickname, name: p.name });
          })
        );
        return Response.json({
          entries: ranked.map((r) => {
            const pid = Number(r.playerId);
            const info = nameByPlayerId.get(pid);
            return {
              rank: r.rank,
              playerId: pid,
              nickname: info?.nickname ?? `#${pid}`,
              name: info?.name ?? null,
              points: r.totalPoints,
              played: r.tournamentCount,
              itm: 0,
              isMe: pid === ctx.playerId,
            };
          }),
        });
      },
    },

    "/api/player/rating/elo-lite": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const url = new URL(req.url);
        const year = parseInt(url.searchParams.get("year") ?? "", 10);
        const month = parseInt(url.searchParams.get("month") ?? "", 10);
        if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
          return badRequest("year and month query params required");
        }
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
        const rows = await playerTournamentRatingFactsRepository.getSeasonalRating(year, month);
        // ELO-lite: derive a synthetic rating from total points + games played using a simple formula.
        // BASE 1500 + points/50, smoothed by tournamentCount. Peak = current + 30 placeholder until real ELO ships.
        const ranked = rows
          .map((r) => {
            const elo = Math.round(
              1500 + r.totalPoints / 50 + Math.min(50, r.tournamentCount * 2)
            );
            return {
              playerId: Number(r.playerId),
              elo,
              peak: elo + 30,
              change: 0,
            };
          })
          .sort((a, b) => b.elo - a.elo)
          .slice(0, limit);
        const playerIds = ranked.map((r) => r.playerId);
        const nameByPlayerId = new Map<number, { nickname: string; name: string | null }>();
        await Promise.all(
          playerIds.map(async (id) => {
            const p = await playerRepository.findById(String(id));
            if (p) nameByPlayerId.set(id, { nickname: p.nickname, name: p.name });
          })
        );
        return Response.json({
          entries: ranked.map((r, i) => {
            const info = nameByPlayerId.get(r.playerId);
            return {
              rank: i + 1,
              playerId: r.playerId,
              nickname: info?.nickname ?? `#${r.playerId}`,
              name: info?.name ?? null,
              elo: r.elo,
              peak: r.peak,
              change: r.change,
              isMe: r.playerId === ctx.playerId,
            };
          }),
        });
      },
    },

    "/api/player/hall-of-fame": {
      GET: async (req: BunRequest) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const rows = await hallOfFameRepository.list();
        return Response.json({
          entries: rows.map((r) => ({
            id: r.id,
            year: r.year,
            playerId: r.playerId,
            nickname: r.nickname,
            name: r.name,
            title: r.title,
            stat: r.stat,
            position: r.position,
          })),
        });
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────
async function queryPlayerRatingFacts(playerId: number): Promise<
  Array<{ tournamentId: number; totalPoints: number; placement: number | null }>
> {
  try {
    const res = await PostgresClient.instance.query(
      `SELECT tournament_id, total_points, placement
       FROM player_tournament_rating_facts
       WHERE player_id = $1`,
      [String(playerId)]
    );
    return res.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        tournamentId: Number(r.tournament_id),
        totalPoints: Number(r.total_points),
        placement: r.placement != null ? Number(r.placement) : null,
      };
    });
  } catch (err) {
    logger.error({ err, playerId }, "[Player] queryPlayerRatingFacts failed");
    return [];
  }
}
