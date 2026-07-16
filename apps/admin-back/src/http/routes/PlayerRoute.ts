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
import {
  computeChipPoolSummaryFromStates,
  InGameUserStateService,
} from "../services/InGameUserStateService";
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

/** The first Blind step after `idx` — the level play resumes into (skips breaks). */
function nextBlindAfter(blinds: BlindType[], idx: number): BlindType | undefined {
  return blinds.slice(idx + 1).find((b) => b.type === "Blind");
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
  /** Whether the requesting player currently has a state in this tournament. */
  isRegistered: boolean;
  averageStack: number | null;
  currentLevelNo: number | null;
  currentBlinds: ReturnType<typeof blindToWire> | null;
  nextBlinds: ReturnType<typeof blindToWire> | null;
  levelTimeRemainingSec: number | null;
  /** True when the clock stands on a Break step. */
  breakActive: boolean;
  /** Duration in minutes of the current clock step (blind or break). */
  currentStepDurationMin: number | null;
  /** True when the step right after the current one is a Break. */
  nextStepIsBreak: boolean;
}

async function buildTournamentSummary(
  tournament: TournamentRow,
  states: InGameUserState[],
  myPlayerId: number
): Promise<TournamentSummaryPayload> {
  const aliveStates = states.filter(isAlive);
  const eliminatedStates = states.filter(isOut);

  const structure = await tournamentStructureCache.get(String(tournament.id));
  const aliveCount = aliveStates.length;
  const registeredCount = states.length;
  const eliminatedCount = eliminatedStates.length;
  // The player is "registered" iff they hold a state in this tournament.
  const isRegistered = states.some((s) => Number(s.playerId) === myPlayerId);

  // Real average stack (totalChips ÷ playersActive), computed from the same
  // chip-pool logic the broadcast/public chip-pool-summary endpoint uses, over
  // the already-loaded states so we don't re-read the live store.
  const averageStack =
    structure != null
      ? computeChipPoolSummaryFromStates(states, structure.stackSize).averageStack
      : null;

  let currentLevelNo: number | null = null;
  let currentBlinds: ReturnType<typeof blindToWire> | null = null;
  let nextBlinds: ReturnType<typeof blindToWire> | null = null;
  let levelTimeRemainingSec: number | null = null;
  let breakActive = false;
  let currentStepDurationMin: number | null = null;
  let nextStepIsBreak = false;

  if (tournament.status === "in_progress") {
    const tick = await tournamentClockService.getTick(tournament.id);
    if (tick) {
      levelTimeRemainingSec = tick.secondsRemaining;
      const blinds = structure?.blindsStructure ?? [];
      const idx = tick.currentStepIndex;
      const current = idx != null && idx >= 0 ? blinds[idx] : undefined;
      if (idx != null && current) {
        currentStepDurationMin = current.duration;
        nextStepIsBreak = blinds[idx + 1]?.type === "Break";
        // «След. блайнды» is literally the next *blinds*: the first Blind
        // step ahead, breaks skipped — during a break that is the level
        // play resumes into.
        const upcoming = nextBlindAfter(blinds, idx);
        nextBlinds = upcoming ? blindToWire(upcoming) : null;
        if (current.type === "Break") {
          // No zeroed level-0 sentinel on the wire: a break has no blinds.
          breakActive = true;
        } else {
          currentBlinds = blindToWire(current);
          currentLevelNo = current.level;
        }
      }
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
    isRegistered,
    averageStack,
    currentLevelNo,
    currentBlinds,
    nextBlinds,
    levelTimeRemainingSec,
    breakActive,
    currentStepDurationMin,
    nextStepIsBreak,
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
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  const m = monthsRu[month - 1] ?? "?";
  return `${m} ${year}`;
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
        const base = await buildPublicProfile(ctx.playerId);
        if (!base) return notFound("Player not found");
        // Own profile adds private fields the public view never sees.
        const player = await playerRepository.findById(String(ctx.playerId));
        const eloLiteValue = Math.round(1500 + base.points / 50);

        return Response.json({
          ...base,
          email: "", // populated by the /me handler in PlayerAuthRoute; not leaked again here
          freeEntryCount: player?.freeEntryCount ?? 0,
          freeReentryCount: player?.freeReentryCount ?? 0,
          eloLite: { value: eloLiteValue, peak: eloLiteValue, change30d: 0 },
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
        if (nickname !== undefined) {
          if (typeof nickname !== "string") {
            return badRequest("nickname must be a string");
          }
          const trimmed = nickname.trim();
          if (trimmed.length < 2 || trimmed.length > 24) {
            return badRequest("Никнейм должен быть от 2 до 24 символов");
          }
          // The login (player_users.login) never changes; the nickname is the
          // player's display identity — keep it unique among players.
          const taken = await playerRepository.findByNickname(trimmed);
          if (taken && Number(taken.id) !== ctx.playerId) {
            return badRequest("Этот никнейм уже занят");
          }
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
        const entries = await buildPlayerHistory(ctx.playerId);
        return Response.json({ entries });
      },
    },

    "/api/player/players/:playerId/profile": {
      GET: async (
        req: BunRequest<"/api/player/players/:playerId/profile"> & {
          params: { playerId: string };
        }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const playerId = parseInt(req.params.playerId, 10);
        if (Number.isNaN(playerId) || playerId < 1) return badRequest("Invalid playerId");
        const profile = await buildPublicProfile(playerId);
        if (!profile) return notFound("Player not found");
        return Response.json(profile);
      },
    },

    "/api/player/players/:playerId/tournaments/history": {
      GET: async (
        req: BunRequest<"/api/player/players/:playerId/tournaments/history"> & {
          params: { playerId: string };
        }
      ) => {
        const ctx = getCtx(req);
        if (!ctx) return unauthorized();
        const playerId = parseInt(req.params.playerId, 10);
        if (Number.isNaN(playerId) || playerId < 1) return badRequest("Invalid playerId");
        const entries = await buildPlayerHistory(playerId);
        return Response.json({ entries });
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
        if (!state) {
          // Completed tournaments clear the live in-game state; fall back to the
          // durable results so a player who took part is still recognized.
          const tournament = await tournamentRepository.findById(tournamentId);
          if (tournament?.status === "completed") {
            const rows = await tournamentResultRepository.findByTournamentId(tournamentId);
            const mine = rows.find((r) => r.playerId === String(ctx.playerId));
            if (mine) {
              return Response.json({
                tournamentId,
                status: "out",
                stack: null,
                table: null,
                seat: null,
                place: mine.placement,
                bountyCount: mine.bountyCount,
                reentriesUsed: mine.totalReentryCount,
              });
            }
          }
          return notFound("Not registered in this tournament");
        }
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
            return buildTournamentSummary(t, states, ctx.playerId);
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
            return buildTournamentSummary(t, states, ctx.playerId);
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
        const summary = await buildTournamentSummary(tournament, states, ctx.playerId);
        const structure = await tournamentStructureCache.get(String(id));
        const myResult = await buildMyCompletedResult(tournament, id, ctx.playerId);
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
          myResult,
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
        // Active / in-progress tournaments come from the InGameUserState cache.
        if (states.length > 0) {
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
        }
        // Completed tournaments have their cache wiped — fall back to the
        // persisted snapshot in tournament_result_players.
        const resultRows = await tournamentResultRepository.findByTournamentId(id);
        if (resultRows.length === 0) {
          return Response.json({ players: [] });
        }
        const nicknames = new Map<number, string>();
        await Promise.all(
          resultRows.map(async (r) => {
            const pid = Number(r.playerId);
            if (Number.isNaN(pid) || nicknames.has(pid)) return;
            const nick = await playerRepository.getNicknameById(String(pid));
            if (nick) nicknames.set(pid, nick);
          })
        );
        return Response.json({
          players: resultRows.map((r) => {
            const pid = Number(r.playerId);
            return {
              playerId: pid,
              nickname: nicknames.get(pid) ?? `#${pid}`,
              status: "out" as const,
              stack: null,
              table: null,
              seat: null,
              place: r.placement,
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
        // Pagination for the rating table's infinite scroll; ranks stay
        // global — they are assigned before slicing.
        const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
        const rows = await playerTournamentRatingFactsRepository.getSeasonalRating(year, month);
        const ranked = rankSeasonalEntries(rows).slice(offset, offset + limit);
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
              itm: r.ratingZoneCount,
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

interface PlayerRef {
  playerId: number;
  nickname: string;
}

interface MyCompletedResult {
  place: number | null;
  fieldSize: number;
  points: number;
  knockouts: PlayerRef[];
  /** Who knocked me out — a list because a bounty can be split across killers. */
  eliminatedBy: PlayerRef[];
}

/** Parse a stored player-id list (JSON array, else comma-separated) into ids. */
function parsePlayerIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x)).filter((s) => s.length > 0);
    }
  } catch {
    // legacy / non-JSON format — fall through to comma split
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * For a completed tournament, assemble the calling player's own result:
 * finishing place, points, whom they knocked out, and who knocked them out.
 * Returns null for non-completed tournaments or when the player has no result.
 */
async function buildMyCompletedResult(
  tournament: TournamentRow,
  tournamentId: number,
  myPlayerId: number
): Promise<MyCompletedResult | null> {
  if (tournament.status !== "completed") return null;
  const rows = await tournamentResultRepository.findByTournamentId(tournamentId);
  if (rows.length === 0) return null;
  const mine = rows.find((r) => r.playerId === String(myPlayerId));
  if (!mine) return null;

  const fieldSize = rows.length;
  // `placement` is elimination order (1 = first bust); invert to a finish place.
  const place = mine.placement != null ? fieldSize - mine.placement + 1 : null;

  // Points from the same rating-facts source the profile history uses, so the
  // number matches there; fall back to the persisted snapshot on the result row.
  const facts = await queryPlayerRatingFacts(myPlayerId);
  const points =
    facts.find((f) => f.tournamentId === tournamentId)?.totalPoints ??
    mine.ratingPersisted?.totalPoints ??
    0;

  // Both columns store JSON arrays of player ids (eliminatedBy can hold several
  // when a bounty was split across killers); an empty tournament records "[]".
  const killIds = parsePlayerIdList(mine.bountyKills);
  const killerIds = parsePlayerIdList(mine.eliminatedBy);

  const neededIds = Array.from(new Set([...killIds, ...killerIds]));
  const nickById = new Map<string, string>();
  await Promise.all(
    neededIds.map(async (pid) => {
      const nick = await playerRepository.getNicknameById(pid);
      if (nick) nickById.set(pid, nick);
    })
  );
  const ref = (pid: string): PlayerRef => ({
    playerId: Number(pid),
    nickname: nickById.get(pid) ?? `#${pid}`,
  });

  return {
    place,
    fieldSize,
    points,
    knockouts: killIds.map(ref),
    eliminatedBy: killerIds.map(ref),
  };
}

interface PublicProfilePayload {
  id: number;
  nickname: string;
  name: string | null;
  joinedAt: string;
  season: { year: number; month: number; label: string };
  rank: number | null;
  points: number;
  playedTournaments: number;
  wins: number;
  finalTables: number;
  itm: number;
  bountyCount: number;
  medal: "gold" | "silver" | "bronze" | "none";
}

/**
 * Public, non-sensitive profile for any player: identity + current-season
 * stats. Shared by `/me` (which adds private fields on top) and the public
 * player-profile endpoint. Returns null when the player doesn't exist.
 */
async function buildPublicProfile(playerId: number): Promise<PublicProfilePayload | null> {
  const player = await playerRepository.findById(String(playerId));
  if (!player) return null;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const seasonRows = await playerTournamentRatingFactsRepository.getSeasonalRating(year, month);
  const ranked = rankSeasonalEntries(seasonRows);
  const entry = ranked.find((r) => Number(r.playerId) === playerId);
  const agg = await playerTournamentRatingFactsRepository.getSeasonalPlayerAggregates(
    year,
    month,
    String(playerId)
  );
  const ratingZonePct =
    agg.tournamentCount > 0
      ? Math.round((agg.ratingZoneCount / agg.tournamentCount) * 100)
      : 0;

  let medal: "gold" | "silver" | "bronze" | "none" = "none";
  if (entry) {
    if (entry.rank === 1) medal = "gold";
    else if (entry.rank === 2) medal = "silver";
    else if (entry.rank === 3) medal = "bronze";
  }

  return {
    id: player.id,
    nickname: player.nickname,
    name: player.name,
    joinedAt: player.createdAt.toISOString(),
    season: { year, month, label: seasonLabel(year, month) },
    rank: entry?.rank ?? null,
    points: entry?.totalPoints ?? 0,
    playedTournaments: entry?.tournamentCount ?? 0,
    wins: agg.wins,
    finalTables: agg.finalTables,
    itm: ratingZonePct,
    bountyCount: agg.knockouts,
    medal,
  };
}

interface HistoryWireEntry {
  tournamentId: number;
  date: string;
  name: string;
  buyin: number;
  place: number | null;
  fieldSize: number;
  prize: number | null;
  eloDelta: number;
  pointsDelta: number;
}

/**
 * A player's tournament history (completed games they were eliminated from),
 * newest first, in wire shape. Shared by `/me` history and the public endpoint.
 */
async function buildPlayerHistory(playerId: number): Promise<HistoryWireEntry[]> {
  const factsRes = await queryPlayerRatingFacts(playerId);
  if (factsRes.length === 0) return [];

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
  // The genuine winner: exactly one in-game (non-Out, non-Registered) result
  // row — the last player standing. Admin force-completion leaves several
  // such rows, so none of them qualifies.
  const winnerByTournament = new Map<number, string>();
  for (const { id, rows } of resultsByTournament) {
    // Field size = players who actually played; floor with the max placement
    // seen so "fieldSize - place + 1" never goes negative on partial backfills.
    const played = rows.filter(
      (r) => r.status !== "Registered" && r.status !== "registered"
    );
    const rowCount = played.length || rows.length;
    const maxPlacementInResults = rows.reduce((m, r) => Math.max(m, r.placement ?? 0), 0);
    const maxPlacementInFacts = factsRes
      .filter((f) => f.tournamentId === id)
      .reduce((m, f) => Math.max(m, f.placement ?? 0), 0);
    fieldByTournament.set(id, Math.max(rowCount, maxPlacementInResults, maxPlacementInFacts));

    const standing = played.filter((r) => r.status !== "Out" && r.status !== "out");
    if (standing.length === 1 && standing[0]) {
      winnerByTournament.set(id, String(standing[0].playerId));
    }
  }

  return factsRes
    // Games the player was eliminated from, plus tournaments they genuinely
    // won (the winner is never "Out"). Force-completed non-finishers with
    // placement=N stay excluded — they would render as a bogus "1/N".
    .filter(
      (f) =>
        f.playerStatus === "Out" ||
        winnerByTournament.get(f.tournamentId) === String(playerId)
    )
    .map((f): HistoryWireEntry | null => {
      const t = tournamentById.get(f.tournamentId);
      if (!t) return null;
      return {
        tournamentId: f.tournamentId,
        date: new Date(epochMs(t.date)).toISOString(),
        name: t.name,
        buyin: t.entryPrice,
        place: f.placement,
        fieldSize: fieldByTournament.get(f.tournamentId) ?? 0,
        prize: null,
        eloDelta: 0,
        pointsDelta: f.totalPoints,
      };
    })
    .filter((x): x is HistoryWireEntry => x !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function queryPlayerRatingFacts(playerId: number): Promise<
  Array<{
    tournamentId: number;
    totalPoints: number;
    placement: number | null;
    playerStatus: string;
  }>
> {
  try {
    const res = await PostgresClient.instance.query(
      `SELECT tournament_id, total_points, placement, player_status
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
        playerStatus: String(r.player_status ?? ""),
      };
    });
  } catch (err) {
    logger.error({ err, playerId }, "[Player] queryPlayerRatingFacts failed");
    return [];
  }
}
