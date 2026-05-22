import type { ServerWebSocket } from "bun";
import { logger } from "../logger";
import { tournamentRepository } from "../postgres";
import { tournamentClockService } from "./services/TournamentClockService";

const LOG_PREFIX = "[TournamentClockSocket]";

/** Data bag attached on WebSocket upgrade */
export type TournamentClockWsData = { tournamentId: number };

const subscribers = new Map<
  number,
  Set<ServerWebSocket<TournamentClockWsData>>
>();

export function onTournamentClockSocketOpen(
  ws: ServerWebSocket<TournamentClockWsData>
): void {
  const { tournamentId } = ws.data;
  let set = subscribers.get(tournamentId);
  if (!set) {
    set = new Set();
    subscribers.set(tournamentId, set);
  }
  set.add(ws);
  logger.info({ tournamentId }, `${LOG_PREFIX} open`);
  void tournamentClockService.getTick(tournamentId).then((tick) => {
    if (tick) {
      try {
        ws.send(JSON.stringify(tick));
      } catch (err) {
        logger.info({ err, tournamentId }, `${LOG_PREFIX} initial send failed`);
      }
    }
  });
}

export function onTournamentClockSocketClose(
  ws: ServerWebSocket<TournamentClockWsData>
): void {
  const { tournamentId } = ws.data;
  const set = subscribers.get(tournamentId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) subscribers.delete(tournamentId);
  logger.info({ tournamentId }, `${LOG_PREFIX} close`);
}

/**
 * ~1 Hz: advances persisted clock only for tournaments with DB status `in_progress`.
 * Pause: `getTick` → `advanceClockWhileElapsed` does not step levels while `pauseBeganAtMs` is set;
 * remaining time uses frozen effective now (see tournamentClockCompute).
 *
 * WebSocket clients on other statuses still receive `getTick` (inactive shape) so UI can update.
 */
async function tournamentClockTickAndBroadcast(): Promise<void> {
  const inProgressIds = await tournamentRepository.listIdsByStatus("in_progress");

  const ticks = new Map<
    number,
    Awaited<ReturnType<typeof tournamentClockService.getTick>>
  >();

  for (const tournamentId of inProgressIds) {
    const tick = await tournamentClockService.getTick(tournamentId);
    ticks.set(tournamentId, tick);
  }

  for (const tournamentId of subscribers.keys()) {
    if (!ticks.has(tournamentId)) {
      const tick = await tournamentClockService.getTick(tournamentId);
      ticks.set(tournamentId, tick);
    }
  }

  for (const tournamentId of [...subscribers.keys()]) {
    const set = subscribers.get(tournamentId);
    if (!set || set.size === 0) continue;

    const tick = ticks.get(tournamentId);
    if (!tick) {
      for (const ws of [...set]) {
        try {
          ws.close(4004, "Tournament not found");
        } catch {
          /* ignore */
        }
      }
      subscribers.delete(tournamentId);
      continue;
    }

    const msg = JSON.stringify(tick);
    for (const ws of [...set]) {
      try {
        ws.send(msg);
      } catch {
        set.delete(ws);
      }
    }
    if (set.size === 0) subscribers.delete(tournamentId);
  }
}

export function startTournamentClockBroadcastLoop(): void {
  setInterval(() => {
    void tournamentClockTickAndBroadcast();
  }, 1000);
}
