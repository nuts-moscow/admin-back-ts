import { join } from "node:path";
import pino from "pino";
import pretty from "pino-pretty";
import pinoRoll from "pino-roll";
import type { Level } from "pino";
import { ApplicationConfigs } from "../configs";

const prettyOptions = {
  translateTime: "yyyy-mm-dd HH:MM:ss.l",
  ignore: "pid,hostname",
};

export let logger: pino.Logger;

/**
 * Initializes the logger. Must be called at app startup after ApplicationConfigs.init().
 */
export async function initLogger(): Promise<void> {
  const config = ApplicationConfigs.instance.logger;
  const level = config.level as Level;
  const logDir = config.dir;

  const fileStream = await pinoRoll({
    file: join(logDir, "app"),
    frequency: "daily",
    dateFormat: "yyyy-MM-dd",
    size: "2g",
    limit: { count: 30 },
    mkdir: true,
    symlink: true,
  });

  logger = pino(
    { level },
    pino.multistream([
      {
        stream: pretty({ ...prettyOptions, colorize: true }),
        level,
      },
      {
        stream: pretty({
          ...prettyOptions,
          colorize: true,
          destination: fileStream,
        }),
        level,
      },
    ])
  );
}
