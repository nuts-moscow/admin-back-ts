import type { LoggerConfig } from "./LoggerConfig";
import type { MailConfig } from "./MailConfig";
import { loadMailConfig } from "./MailConfig";
import { loadLoggerConfig } from "./LoggerConfig";
import type { PostgresConfig } from "./PostgresConfig";
import { loadPostgresConfig } from "./PostgresConfig";
import type { RedisConfig } from "./RedisConfig";
import { loadRedisConfig } from "./RedisConfig";
import type { ServerConfig } from "./ServerConfig";
import { loadServerConfig } from "./ServerConfig";
import type { TelegramConfig } from "./TelegramConfig";
import { loadTelegramConfig } from "./TelegramConfig";

export class ApplicationConfigs {
  private static _instance: ApplicationConfigs | null = null;

  readonly logger: LoggerConfig;
  readonly mail: MailConfig;
  readonly postgres: PostgresConfig;
  readonly redis: RedisConfig;
  readonly server: ServerConfig;
  readonly telegram: TelegramConfig;

  private constructor(
    logger: LoggerConfig,
    mail: MailConfig,
    postgres: PostgresConfig,
    redis: RedisConfig,
    server: ServerConfig,
    telegram: TelegramConfig
  ) {
    this.logger = logger;
    this.mail = mail;
    this.postgres = postgres;
    this.redis = redis;
    this.server = server;
    this.telegram = telegram;
  }

  static init(): ApplicationConfigs {
    if (ApplicationConfigs._instance) {
      return ApplicationConfigs._instance;
    }
    ApplicationConfigs._instance = new ApplicationConfigs(
      loadLoggerConfig(),
      loadMailConfig(),
      loadPostgresConfig(),
      loadRedisConfig(),
      loadServerConfig(),
      loadTelegramConfig()
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
