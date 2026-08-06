import { describe, expect, test } from "bun:test";

/**
 * The queue's two load-bearing promises are schema-shaped: at most one waiting
 * picture per player, and no bytes left behind once a verdict is in. Both are
 * constraints, so both are checked against the migration; there is no
 * integration harness here to exercise them against a running Postgres.
 */
const MIGRATION = await Bun.file(
  new URL("../../db/migrations/029_player_avatar_submissions.sql", import.meta.url).pathname
).text();

const REPOSITORY = await Bun.file(
  new URL("./PlayerAvatarSubmissionRepository.ts", import.meta.url).pathname
).text();

describe("029_player_avatar_submissions", () => {
  test("one waiting picture per player is the primary key", () => {
    expect(MIGRATION).toMatch(/player_id\s+integer\s+not null\s+primary key/i);
  });

  test("a second upload displaces the first instead of adding a row", () => {
    expect(REPOSITORY).toMatch(/ON CONFLICT \(player_id\) DO UPDATE/i);
  });

  test("only a pending row holds bytes — a decided one cannot", () => {
    expect(MIGRATION).toMatch(/check \(\(state = 'pending'\) = \(image is not null\)\)/i);
  });

  test("the queue index covers pending rows only", () => {
    expect(MIGRATION).toMatch(/where state = 'pending'/i);
  });

  test("refusals are remembered as fingerprints, never as pictures", () => {
    const refusals = MIGRATION.slice(MIGRATION.indexOf("player_avatar_refusals"));
    expect(refusals).toMatch(/fingerprint\s+text\s+not null/i);
    expect(refusals).not.toMatch(/\bbytea\b/i);
  });

  test("a waiting picture goes with its player", () => {
    const cascades = MIGRATION.match(/references players\(id\) on delete cascade/gi) ?? [];
    expect(cascades.length).toBe(2);
  });
});

describe("PlayerAvatarSubmissionRepository", () => {
  test("a verdict only lands while the submission id still matches", () => {
    expect(REPOSITORY).toMatch(
      /WHERE player_id = \$1 AND submission_id = \$2 AND state = 'pending'/i
    );
  });

  test("a refusal clears the picture and an approval deletes the row", () => {
    expect(REPOSITORY).toMatch(/SET state = 'refused',\s*\n\s*image = NULL/);
    expect(REPOSITORY).toMatch(/DELETE FROM player_avatar_submissions/);
  });
});
