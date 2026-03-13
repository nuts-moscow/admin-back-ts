export interface LoggerConfig {
  level: string;
  dir: string;
}

export function loadLoggerConfig(): LoggerConfig {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    dir: process.env.LOG_DIR ?? "/data/logs/back-admin",
  };
}
