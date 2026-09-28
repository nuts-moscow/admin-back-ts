#!/usr/bin/env bun
/**
 * One-shot: switch past Mystery tournaments to «bounty points only for Rebuy
 * knockouts» and reprice their rating.
 *
 * Picks completed tournaments whose name contains "mystery" (any case) — or
 * the ids passed on the command line — and, per tournament, prints each
 * player's bounty points now vs after the change. Nothing is written unless
 * `--apply` is given; then the tournament gets rating_bounty_rebuy_only = true
 * and repriceTournamentRating rebuilds its rating facts and results, exactly
 * as ticking the box in the admin and saving would.
 *
 * Tournaments with no stored elimination log are skipped: without it Rebuy and
 * Out knockouts can't be told apart, and repricing would wipe every bounty.
 *
 * Knockout counts (profile, achievements) are not touched — only points.
 *
 * Usage:
 *   bun run apps/admin-back/scripts/reprice-mystery-bounty.ts            # dry run, by name
 *   bun run apps/admin-back/scripts/reprice-mystery-bounty.ts 41 57      # dry run, these ids
 *   bun run apps/admin-back/scripts/reprice-mystery-bounty.ts --apply    # write
 *
 * Requires the same DB env vars as the server.
 */
import { ApplicationConfigs } from "../src/configs";
import { initLogger } from "../src/logger";
import { PostgresClient } from "../src/postgres/PostgresClient";
import {
  playerRepository,
  tournamentEliminationSnapshotRepository,
  tournamentRepository,
  tournamentResultRepository,
} from "../src/postgres";
import { normalizeTournamentRatingBreakdown } from "../src/domain/TournamentRatingBreakdown";
import { repriceTournamentRating } from "../src/http/services/TournamentRatingRepriceService";
import {
  TOURNAMENT_BOUNTY_RATING_BASE,
  ratedBountyCount,
} from "../src/http/services/tournamentRatingCompute";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  ApplicationConfigs.init();
  await initLogger();
  await PostgresClient.init();

  const all = await tournamentRepository.list({ limit: 1000 });
  const targets = all.filter(
    (t) =>
      t.status === "completed" &&
      (ids.length > 0 ? ids.includes(t.id) : /mystery/i.test(t.name))
  );

  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${targets.length} tournament(s)\n`);

  for (const t of targets) {
    const events = await tournamentEliminationSnapshotRepository.findByTournamentId(t.id);
    const date = new Date(t.date < 1e12 ? t.date * 1000 : t.date).toISOString().slice(0, 10);
    console.log(`#${t.id} «${t.name}» ${date}${t.ratingBountyRebuyOnly ? " (already rebuy-only)" : ""}`);
    if (!t.ratingEnabled) {
      console.log("  skipped: rating disabled\n");
      continue;
    }
    if (events == null || events.length === 0) {
      console.log("  skipped: no elimination log stored — can't tell Rebuy from Out\n");
      continue;
    }

    const rows = await tournamentResultRepository.findByTournamentId(t.id);
    const mystery = { ratingBountyRebuyOnly: true };
    let delta = 0;
    for (const row of rows) {
      if (row.bountyCount === 0) continue;
      const before =
        row.ratingPersisted != null
          ? normalizeTournamentRatingBreakdown(row.ratingPersisted).bountyPoints
          : 0;
      const rated = ratedBountyCount(row.playerId, row.bountyCount, mystery, events);
      const after = rated * TOURNAMENT_BOUNTY_RATING_BASE * t.ratingBountyCoefficient;
      delta += after - before;
      const nick = (await playerRepository.getNicknameById(row.playerId).catch(() => null)) ?? "?";
      console.log(
        `  ${nick.padEnd(20)} knockouts ${String(row.bountyCount).padStart(4)}  on-rebuy ${String(rated).padStart(4)}  bounty pts ${before} → ${after}`
      );
    }
    console.log(`  total change: ${delta}`);

    if (apply) {
      await PostgresClient.instance.query(
        "UPDATE tournaments SET rating_bounty_rebuy_only = true WHERE id = $1",
        [t.id]
      );
      const r = await repriceTournamentRating(t.id);
      console.log(r.ok ? `  ✓ repriced ${r.repriced} row(s)` : `  ✗ reprice failed: ${r.error}`);
    }
    console.log("");
  }

  if (!apply) console.log("Nothing written. Re-run with --apply to write.");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ unhandled error:", err);
  process.exit(1);
});
