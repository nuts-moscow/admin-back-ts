import { describe, expect, test } from "bun:test";

/**
 * The published store's guarantees are constraints, not code paths: one avatar
 * per player and erasure with the player are things the database enforces, so
 * they are checked where they live. There is no integration harness in this
 * repo to exercise them against a running Postgres.
 */
const MIGRATION = await Bun.file(
  new URL("../../db/migrations/028_player_avatars.sql", import.meta.url).pathname
).text();

describe("028_player_avatars", () => {
  test("one avatar per player is the primary key, not the caller's discipline", () => {
    expect(MIGRATION).toMatch(/player_id\s+integer\s+not null\s+primary key/i);
  });

  test("deleting a player takes the face with it", () => {
    expect(MIGRATION).toMatch(/references players\(id\) on delete cascade/i);
  });

  test("the address is unique, so it can be the capability", () => {
    expect(MIGRATION).toMatch(/address\s+text\s+not null\s+unique/i);
  });

  test("nothing in the published store depends on submissions", () => {
    expect(MIGRATION).not.toMatch(/submission/i);
  });
});
