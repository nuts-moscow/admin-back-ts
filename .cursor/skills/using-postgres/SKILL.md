---
name: using-postgres
description: Initializes PostgreSQL connection pool once at app start and exposes a singleton. All Postgres files live in src/postgres/. Each repository: interface, implementation, exported instance. All consumers use the instance. Init in wiring. Use when adding PostgreSQL, database queries, repositories, or persistence — even if the user doesn't explicitly say "PostgreSQL".
---

# Using PostgreSQL

## Quick Start

1. Create Postgres files in `src/postgres/`
2. Init Postgres once at app start in wiring: `PostgresClient.init()` in `src/wiring/`
3. Access everywhere via `PostgresClient.instance`
4. Each repository: interface → implementation → exported instance; consumers use the instance only

## Structure

```
src/postgres/
├── PostgresClient.ts   # Singleton pool — init and export
├── index.ts            # Re-exports PostgresClient + repository instances
└── PlayerRepository.ts # Interface, implementation, instance (same file)
```

## Repository Pattern

Every repository file must follow this order in the same file:

1. **Interface** — defines the contract
2. **Implementation** — class implementing the interface, uses `PostgresClient.instance`
3. **Instance** — exported singleton used everywhere

```typescript
// src/postgres/PlayerRepository.ts
import { PostgresClient } from "./PostgresClient";

export interface PlayerRepository {
  getNicknameById(playerId: string): Promise<string | null>;
}

class PlayerRepositoryImpl implements PlayerRepository {
  async getNicknameById(playerId: string): Promise<string | null> {
    try {
      const result = await PostgresClient.instance.query(
        "SELECT nickname FROM players WHERE id = $1",
        [playerId]
      );
      const row = result.rows[0];
      return row?.nickname ?? null;
    } catch (err) {
      logger.info({ err }, "[Postgres] PlayerRepository.getNicknameById failed");
      return null;
    }
  }
}

export const playerRepository: PlayerRepository = new PlayerRepositoryImpl();
```

Consumers import and use the instance — never `new PlayerRepositoryImpl()`:

```typescript
import { playerRepository } from "../postgres";

const nickname = await playerRepository.getNicknameById(playerId);
```

## Init in Wiring

Postgres init belongs in wiring. Call `PostgresClient.init()` from `src/wiring/`:

```typescript
// src/wiring/index.ts
import { PostgresClient } from "../postgres";

try {
  await PostgresClient.init();
} catch (err) {
  logger.info({ err }, "[Postgres] init failed");
  throw err;
}
```

## Config

Postgres URL comes from `ApplicationConfigs.instance.postgres.url`. Add `PostgresConfig` in `src/configs/` and wire into `ApplicationConfigs`.

## Error Handling

Wrap DB calls in try-catch. Log errors with `[Postgres]` prefix. Return safe fallbacks (null, [], false) so callers can handle failures without crashing.

## What to Avoid

- **Postgres init in main entry** — Put init in wiring (`src/wiring/`).
- **Creating new Pool/Client in repositories** — Use `PostgresClient.instance` only.
- **Instantiating repository classes in services** — Use the exported instance (e.g. `playerRepository`).
- **Multiple connection instances** — One singleton pool for the whole app.
