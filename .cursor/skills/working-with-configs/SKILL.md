---
name: working-with-configs
description: Centralizes application configuration in a single ApplicationConfigs instance initialized at app start. Use this skill whenever adding configs, environment variables, or app settings; when refactoring scattered config access; when the user mentions configs, env vars, .env, or application settings; or when wiring up database URLs, API keys, ports, or any runtime configuration — even if they don't explicitly say "config".
---

# Working with Configs

## Quick Start

1. Init configs once at app start: `ApplicationConfigs.init()` in the main entry (e.g. `src/index.ts`)
2. Access everywhere via `ApplicationConfigs.instance.<domain>.<field>`
3. Add new config domains as modules in `src/configs/`, then wire them into `ApplicationConfigs`

## Why Centralize

Scattered `process.env` reads make it hard to see what the app depends on, complicate testing (no single place to inject mocks), and can cause init-order issues. A single `ApplicationConfigs` gives one source of truth, predictable startup, and a clear boundary for config.

## Structure

```
src/configs/
├── ApplicationConfigs.ts   # Main class — init and export singleton
├── index.ts                # Re-exports ApplicationConfigs
└── *.ts                    # Individual config modules (e.g. DatabaseConfig, ServerConfig)
```

## ApplicationConfigs

- Lives in `src/configs/ApplicationConfigs.ts`
- Initialized once when the app starts (e.g. in `src/index.ts` or main entry)
- Exposes typed getters for each config domain
- Holds references to all config modules

**Init at app start:**

```typescript
// src/index.ts (or main entry)
import { ApplicationConfigs } from "./configs";

const configs = ApplicationConfigs.init();
// configs is now available app-wide
```

**Access pattern:**

```typescript
// Any module that needs config
import { ApplicationConfigs } from "./configs";

const dbHost = ApplicationConfigs.instance.database.host;
const port = ApplicationConfigs.instance.server.port;
```

## Adding a New Config

1. Create a config module in `src/configs/` (e.g. `src/configs/RedisConfig.ts`)
2. Add it to `ApplicationConfigs` in the init flow
3. Expose via `ApplicationConfigs.instance.redis` (or similar)

**Example config module:**

```typescript
// src/configs/DatabaseConfig.ts
export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
}

export function loadDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    name: process.env.DB_NAME ?? "app",
  };
}
```

**Example ApplicationConfigs:**

```typescript
// src/configs/ApplicationConfigs.ts
import { loadDatabaseConfig, DatabaseConfig } from "./DatabaseConfig";
import { loadServerConfig, ServerConfig } from "./ServerConfig";

export class ApplicationConfigs {
  private static _instance: ApplicationConfigs | null = null;

  readonly database: DatabaseConfig;
  readonly server: ServerConfig;

  private constructor(database: DatabaseConfig, server: ServerConfig) {
    this.database = database;
    this.server = server;
  }

  static init(): ApplicationConfigs {
    if (ApplicationConfigs._instance) {
      return ApplicationConfigs._instance;
    }
    ApplicationConfigs._instance = new ApplicationConfigs(
      loadDatabaseConfig(),
      loadServerConfig()
    );
    return ApplicationConfigs._instance;
  }

  static get instance(): ApplicationConfigs {
    if (!ApplicationConfigs._instance) {
      throw new Error("ApplicationConfigs not initialized. Call init() at app start.");
    }
    return ApplicationConfigs._instance;
  }
}
```

## What to Avoid

- **Direct `process.env` in services/routes** — Use `ApplicationConfigs.instance` instead so config is testable and dependencies are explicit.
- **Multiple config instances or lazy-init in random places** — Init once at startup so the app has a predictable config state.
- **Importing individual config loaders outside `src/configs/`** — Treat `ApplicationConfigs` as the only public API; other modules should not import `DatabaseConfig`, `loadServerConfig`, etc.
