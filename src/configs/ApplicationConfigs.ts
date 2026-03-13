import { loadRedisConfig, RedisConfig } from "./RedisConfig";
import { loadServerConfig, ServerConfig } from "./ServerConfig";

export class ApplicationConfigs {
  private static _instance: ApplicationConfigs | null = null;

  readonly redis: RedisConfig;
  readonly server: ServerConfig;

  private constructor(redis: RedisConfig, server: ServerConfig) {
    this.redis = redis;
    this.server = server;
  }

  static init(): ApplicationConfigs {
    if (ApplicationConfigs._instance) {
      return ApplicationConfigs._instance;
    }
    ApplicationConfigs._instance = new ApplicationConfigs(
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
