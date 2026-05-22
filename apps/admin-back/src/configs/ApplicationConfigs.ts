import type { LoggerConfig } from "./LoggerConfig";
import { loadLoggerConfig } from "./LoggerConfig";
import type { PostgresConfig } from "./PostgresConfig";
import { loadPostgresConfig } from "./PostgresConfig";
import type { RedisConfig } from "./RedisConfig";
import { loadRedisConfig } from "./RedisConfig";
import type { ServerConfig } from "./ServerConfig";
import { loadServerConfig } from "./ServerConfig";

export class ApplicationConfigs {
  private static _instance: ApplicationConfigs | null = null;

  readonly logger: LoggerConfig;
  readonly postgres: PostgresConfig;
  readonly redis: RedisConfig;
  readonly server: ServerConfig;

  private constructor(
    logger: LoggerConfig,
    postgres: PostgresConfig,
    redis: RedisConfig,
    server: ServerConfig
  ) {
    this.logger = logger;
    this.postgres = postgres;
    this.redis = redis;
    this.server = server;
  }

  static init(): ApplicationConfigs {
    if (ApplicationConfigs._instance) {
      return ApplicationConfigs._instance;
    }
    ApplicationConfigs._instance = new ApplicationConfigs(
      loadLoggerConfig(),
      loadPostgresConfig(),
      loadRedisConfig(),
      loadServerConfig()
    );
    return ApplicationConfigs._instance;
  }

  static get instance(): ApplicationConfigs {
    if (!ApplicationConfigs._instance) {
      throw new Error(
        "ApplicationConfigs not initialized. Call init() at app start."
      );
    }
    return ApplicationConfigs._instance;
  }
}
