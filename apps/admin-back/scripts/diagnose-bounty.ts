#!/usr/bin/env bun
/**
 * Read-only diagnostic for bounty / elimination consistency in one tournament.
 *
 * It reads (never writes) Redis + Postgres and reports, per player:
 *   - stored bountyCount vs the value implied by the elimination events
 *   - stored kills / eliminated_by lists vs the lists implied by the events
 *   - victims whose number of elimination events exceeds their real life-count
 *     (totalReentryCount + 1 if Out) — i.e. likely duplicate/orphan events
 * For every mismatch it prints the exact redis-cli command to fix it, so the
 * commands can be reviewed before anyone runs them. Nothing is mutated here.
 *
 * Usage:
 *   POSTGRES_URL=... REDIS_URL=... bun run apps/admin-back/scripts/diagnose-bounty.ts <tournamentId>
 */
import { ApplicationConfigs } from "../src/configs";
import { initLogger } from "../src/logger";
import { PostgresClient } from "../src/postgres/PostgresClient";
import { playerRepository } from "../src/postgres/PlayerRepository";
import { RedisClient } from "../src/redis";

const EVENT_PREFIX = "nuts.api.data.tournament.bounty.eliminationEvent";
const STATE_PREFIX = "nuts.api.data.tournament.players.state";
const KILLS_PREFIX = "nuts.api.data.tournament.bounty.kills";
const ELIMBY_PREFIX = "nuts.api.data.tournament.bounty.eliminated_by";

interface EventRec {
  eventId: string;
  eliminatedPlayerId: string;
  killerPlayerIds: string[];
  type: "Rebuy" | "Out";
  burnedStack: boolean;
  recordedBounty: boolean;
  bountyShare: number;
  recordedAt?: number;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

function multiset(ids: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

async function main() {
  const tid = (process.argv[2] ?? "").trim();
  if (!tid || Number.isNaN(parseInt(tid, 10))) {
    console.error("✗ pass a numeric <tournamentId>");
    process.exit(1);
  }

  ApplicationConfigs.init();
  await initLogger();
  await PostgresClient.init();
  await RedisClient.init();
  const r = RedisClient.instance;

  // ── events ──────────────────────────────────────────────────────────────
  const eventKeys = await r.keys(`${EVENT_PREFIX}.${tid}.*`);
  const events: EventRec[] = [];
  for (const k of eventKeys) {
    const raw = await r.get(k);
    if (!raw) continue;
    try {
      events.push(JSON.parse(raw) as EventRec);
    } catch {
      console.warn(`  ! unparseable event key ${k}`);
    }
  }
  events.sort((a, b) => (a.recordedAt ?? 0) - (b.recordedAt ?? 0));

  // ── player states ───────────────────────────────────────────────────────
  const stateKeys = await r.keys(`${STATE_PREFIX}.${tid}.*`);
  const states = new Map<
    string,
    { status: string; bountyCount: number; totalReentryCount: number; placement: string }
  >();
  for (const k of stateKeys) {
    const h = await r.hgetall(k);
    const pid = h.playerId ?? k.split(".").pop()!;
    states.set(pid, {
      status: h.status ?? "",
      bountyCount: Number(h.bountyCount ?? 0),
      totalReentryCount: Number(h.totalReentryCount ?? 0),
      placement: h.placement ?? "",
    });
  }

  const nickOf = new Map<string, string>();
  await Promise.all(
    Array.from(states.keys()).map(async (pid) => {
      const nick = await playerRepository.getNicknameById(pid).catch(() => null);
      if (nick) nickOf.set(pid, nick);
    })
  );
  const label = (pid: string) => `${pid}(${nickOf.get(pid) ?? "?"})`;

  // ── expected derived state from events ────────────────────────────────────
  const expectedBounty = new Map<string, number>();
  const expectedKills = new Map<string, string[]>(); // killer -> [victims]
  const expectedElimBy = new Map<string, string[]>(); // victim -> [killers]
  const eventsByVictim = new Map<string, EventRec[]>();
  for (const e of events) {
    (eventsByVictim.get(e.eliminatedPlayerId) ?? eventsByVictim.set(e.eliminatedPlayerId, []).get(e.eliminatedPlayerId)!).push(e);
    if (!e.recordedBounty) continue;
    for (const kid of e.killerPlayerIds) {
      expectedBounty.set(kid, (expectedBounty.get(kid) ?? 0) + e.bountyShare);
      (expectedKills.get(kid) ?? expectedKills.set(kid, []).get(kid)!).push(e.eliminatedPlayerId);
      (expectedElimBy.get(e.eliminatedPlayerId) ?? expectedElimBy.set(e.eliminatedPlayerId, []).get(e.eliminatedPlayerId)!).push(kid);
    }
  }

  console.log(`\n=== Tournament ${tid}: ${events.length} elimination event(s) ===`);
  for (const e of events) {
    console.log(
      `  ${new Date(e.recordedAt ?? 0).toISOString()}  ${e.type.padEnd(5)}  victim=${label(e.eliminatedPlayerId)}  killers=[${e.killerPlayerIds.map(label).join(", ")}]  bounty=${e.recordedBounty ? e.bountyShare : 0}  ${e.eventId}`
    );
  }

  const fixes: string[] = [];

  // ── per-player checks ─────────────────────────────────────────────────────
  console.log(`\n=== Per-player consistency ===`);
  for (const [pid, s] of states) {
    const expB = expectedBounty.get(pid) ?? 0;
    const storedKills = await r.lrange(`${KILLS_PREFIX}.${tid}.${pid}`, 0, -1);
    const storedElimBy = await r.lrange(`${ELIMBY_PREFIX}.${tid}.${pid}`, 0, -1);
    const expKills = expectedKills.get(pid) ?? [];
    const expElimBy = expectedElimBy.get(pid) ?? [];
    const victimEvents = eventsByVictim.get(pid) ?? [];
    const lifeCount = s.totalReentryCount + (s.status === "Out" ? 1 : 0);

    const issues: string[] = [];
    if (!approxEqual(s.bountyCount, expB)) {
      issues.push(`bountyCount stored=${s.bountyCount} vs events=${expB}`);
      fixes.push(
        `# ${label(pid)}: set bountyCount to match events (${expB})\n` +
          `redis-cli hset '${STATE_PREFIX}.${tid}.${pid}' bountyCount ${expB}`
      );
    }
    if (!mapsEqual(multiset(storedKills), multiset(expKills))) {
      issues.push(`kills stored=[${storedKills.join(",")}] vs events=[${expKills.join(",")}]`);
      fixes.push(
        `# ${label(pid)}: rebuild kills list from events\n` +
          `redis-cli del '${KILLS_PREFIX}.${tid}.${pid}'` +
          (expKills.length ? `\nredis-cli rpush '${KILLS_PREFIX}.${tid}.${pid}' ${expKills.join(" ")}` : "")
      );
    }
    if (!mapsEqual(multiset(storedElimBy), multiset(expElimBy))) {
      issues.push(`eliminated_by stored=[${storedElimBy.join(",")}] vs events=[${expElimBy.join(",")}]`);
      fixes.push(
        `# ${label(pid)}: rebuild eliminated_by list from events\n` +
          `redis-cli del '${ELIMBY_PREFIX}.${tid}.${pid}'` +
          (expElimBy.length ? `\nredis-cli rpush '${ELIMBY_PREFIX}.${tid}.${pid}' ${expElimBy.join(" ")}` : "")
      );
    }
    if (victimEvents.length > lifeCount) {
      issues.push(
        `DUPLICATE EVENTS: ${victimEvents.length} elimination events but life-count is ${lifeCount} ` +
          `(totalReentryCount=${s.totalReentryCount}, status=${s.status}) — ${victimEvents.length - lifeCount} spurious. ` +
          `Review which to delete:\n      ` +
          victimEvents
            .map((e) => `redis-cli del '${EVENT_PREFIX}.${tid}.${e.eventId}'  # ${e.type} by [${e.killerPlayerIds.join(",")}] @ ${new Date(e.recordedAt ?? 0).toISOString()}`)
            .join("\n      ")
      );
    }

    if (issues.length) {
      console.log(`  ${label(pid)} [status=${s.status}, reentries=${s.totalReentryCount}, place=${s.placement}]:`);
      for (const i of issues) console.log(`    - ${i}`);
    }
  }

  console.log(`\n=== Proposed fix commands (review before running) ===`);
  if (fixes.length === 0) {
    console.log("  (none — bountyCount / kills / eliminated_by all match the events)");
  } else {
    for (const f of fixes) console.log(f);
    console.log(
      `\nNote: "DUPLICATE EVENTS" require a human call on WHICH event to delete (ambiguous), then re-run this script to resync bountyCount/kills/eliminated_by.`
    );
  }

  process.exit(0);
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

main().catch((err) => {
  console.error("✗ unhandled error:", err);
  process.exit(1);
});
