import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import pretty from "pino-pretty";
import pinoRoll from "pino-roll";

/**
 * `next start` on its own only prints to stdout, which only screen sees —
 * nothing survives a restart. This wraps it with the same rotation policy as
 * admin-back's logger (see apps/admin-back/src/logger/index.ts): daily
 * files, 2g cap each, last 30 kept.
 */

const LOG_DIR = process.env.LOG_DIR ?? "/data/logs/player-web";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

const prettyOptions = {
  translateTime: "yyyy-mm-dd HH:MM:ss.l",
  ignore: "pid,hostname",
};

async function main(): Promise<void> {
  const fileStream = await pinoRoll({
    file: join(LOG_DIR, "app"),
    frequency: "daily",
    dateFormat: "yyyy-MM-dd",
    size: "2g",
    limit: { count: 30 },
    mkdir: true,
    symlink: true,
  });

  const logger = pino(
    { level: LOG_LEVEL },
    pino.multistream([
      { stream: pretty({ ...prettyOptions, colorize: true }), level: LOG_LEVEL },
      {
        stream: pretty({ ...prettyOptions, colorize: true, destination: fileStream }),
        level: LOG_LEVEL,
      },
    ])
  );

  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const nextBin = join(appDir, "node_modules", ".bin", "next");
  // No extra args: same invocation as the plain `next start` this replaces,
  // so PORT/hostname env behavior is unchanged.
  const child = spawn(nextBin, ["start"], {
    cwd: appDir,
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  createInterface({ input: child.stdout! }).on("line", (line) => logger.info(line));
  createInterface({ input: child.stderr! }).on("line", (line) => logger.error(line));

  // Forward Ctrl+C / stop signals to the actual Next.js process instead of
  // just killing this wrapper and leaving it running.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

void main();
