import type { ServerWebSocket } from "bun";
import { logger } from "../logger";
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

async function broadcastTicks(): Promise<void> {
  for (const tournamentId of [...subscribers.keys()]) {
    const set = subscribers.get(tournamentId);
    if (!set || set.size === 0) continue;

    const tick = await tournamentClockService.getTick(tournamentId);
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
    void broadcastTicks();
  }, 1000);
}
