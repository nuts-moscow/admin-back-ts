#!/usr/bin/env bun
/**
 * One-shot seed: create a player_user (email + password) bound to a player row.
 *
 * Usage (all 3 forms):
 *
 *   # Bind to an existing player by id:
 *   PLAYER_USER_EMAIL=ivan@example.com \
 *   PLAYER_USER_PASSWORD='changeMe123!' \
 *   PLAYER_ID=42 \
 *   bun run apps/admin-back/scripts/seed-player-user.ts
 *
 *   # Bind to an existing player by nickname:
 *   PLAYER_USER_EMAIL=ivan@example.com \
 *   PLAYER_USER_PASSWORD='changeMe123!' \
 *   PLAYER_NICKNAME=ivan \
 *   bun run apps/admin-back/scripts/seed-player-user.ts
 *
 *   # Create a new player AND its login in one go:
 *   PLAYER_USER_EMAIL=ivan@example.com \
 *   PLAYER_USER_PASSWORD='changeMe123!' \
 *   CREATE_PLAYER_NICKNAME=ivan \
 *   CREATE_PLAYER_NAME='Ivan Petrov' \
 *   bun run apps/admin-back/scripts/seed-player-user.ts
 *
 * Requires the same DB env vars as the server (POSTGRES_URL or
 * POSTGRES_HOST/USER/PASSWORD/DATABASE), JWT_SECRET, and PLAYER_JWT_SECRET
 * (loadServerConfig() validates all three).
 *
 * Idempotent: if a player_user with this email already exists, the script
 * updates the password instead of failing.
 */
import { ApplicationConfigs } from "../src/configs";
import { initLogger } from "../src/logger";
import { playerRepository } from "../src/postgres/PlayerRepository";
import { PostgresClient } from "../src/postgres/PostgresClient";
import { playerUserRepository } from "../src/postgres/PlayerUserRepository";

function readEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const email = readEnv("PLAYER_USER_EMAIL");
  const password = readEnv("PLAYER_USER_PASSWORD");
  const playerIdStr = readEnv("PLAYER_ID");
  const playerNickname = readEnv("PLAYER_NICKNAME");
  const createNickname = readEnv("CREATE_PLAYER_NICKNAME");
  const createName = readEnv("CREATE_PLAYER_NAME");
  const createPhone = readEnv("CREATE_PLAYER_PHONE");

  if (!email) fail("PLAYER_USER_EMAIL is required");
  if (!password) fail("PLAYER_USER_PASSWORD is required");
  if (!playerIdStr && !playerNickname && !createNickname) {
    fail("Set one of: PLAYER_ID, PLAYER_NICKNAME, CREATE_PLAYER_NICKNAME");
  }
  if (password.length < 8) fail("PLAYER_USER_PASSWORD must be at least 8 chars");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("PLAYER_USER_EMAIL must be a valid email");

  ApplicationConfigs.init();
  await initLogger();
  await PostgresClient.init();

  // Resolve the target player row.
  let player =
    playerIdStr != null
      ? await playerRepository.findById(playerIdStr)
      : playerNickname != null
        ? await playerRepository.findByNickname(playerNickname)
        : null;

  if (!player && createNickname) {
    console.log(`• creating new player nickname=${createNickname}`);
    player = await playerRepository.create({
      nickname: createNickname,
      name: createName ?? null,
      phone: createPhone ?? null,
      tg: null,
      notes: null,
      signAgreement: false,
    });
    if (!player) fail("Failed to create player row");
  }

  if (!player) {
    fail(
      `Player not found. Searched by ${playerIdStr ? `id=${playerIdStr}` : `nickname=${playerNickname}`}. ` +
        `Pass CREATE_PLAYER_NICKNAME (+ optional CREATE_PLAYER_NAME / CREATE_PLAYER_PHONE) to create a new one.`,
    );
  }

  const passwordHash = await Bun.password.hash(password);
  const normalizedEmail = email.toLowerCase();

  const existingByEmail = await playerUserRepository.findByEmail(normalizedEmail);
  if (existingByEmail) {
    if (existingByEmail.playerId !== player.id) {
      fail(
        `Email ${normalizedEmail} is already bound to player_id=${existingByEmail.playerId}, ` +
          `but you asked to bind it to player_id=${player.id}. Refusing to silently rebind.`,
      );
    }
    const ok = await playerUserRepository.updatePassword(existingByEmail.id, passwordHash);
    if (!ok) fail("Failed to update password for existing player_user");
    console.log(
      `✓ updated password for existing player_user id=${existingByEmail.id} (email=${normalizedEmail}, player_id=${player.id})`,
    );
    process.exit(0);
  }

  const existingByPlayer = await playerUserRepository.findByPlayerId(player.id);
  if (existingByPlayer) {
    fail(
      `player_id=${player.id} already has a login (email=${existingByPlayer.email}). ` +
        `Reuse that email or delete the row first.`,
    );
  }

  const created = await playerUserRepository.create({
    email: normalizedEmail,
    passwordHash,
    playerId: player.id,
  });
  if (!created) fail("Failed to insert player_user row");

  console.log(
    `✓ created player_user id=${created.id} (email=${created.email}, player_id=${player.id}, nickname=${player.nickname})`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ unhandled error:", err);
  process.exit(1);
});
