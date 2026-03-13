---
name: using-redis
description: Initializes Redis once at app start and exposes a singleton client. All Redis files live in src/redis/. All Redis operations use try-catch with error logging and return safe results. Use this skill whenever adding Redis, cache, sessions, pub/sub, or key-value storage; when the user mentions Redis, caching, or in-memory store — even if they don't explicitly say "Redis".
---

# Using Redis

## Quick Start

1. Create Redis files in `src/redis/`
2. Init Redis once at app start in wiring: `RedisClient.init()` in `src/wiring/`
3. Access everywhere via `RedisClient.instance`
4. Wrap every Redis call in try-catch, log errors, and return a safe fallback (e.g. `null`, empty array, default value)

## Why Singleton + Safe Results

Multiple Redis connections waste resources and complicate connection pooling. A singleton ensures one client, one connection lifecycle. Try-catch with safe returns keeps the app running when Redis is down or flaky — the app degrades gracefully instead of crashing.

## Structure

All Redis files belong in `src/redis/`:

```
src/redis/
├── RedisClient.ts    # Singleton client — init and export
├── index.ts          # Re-exports RedisClient
└── (optional) helpers for common patterns
```

## Init in Wiring

Redis init belongs in wiring, not in the main entry. Call `RedisClient.init()` from `src/wiring/`:

```typescript
// src/wiring/index.ts (or wiring module)
import { RedisClient } from "../redis";

try {
  await RedisClient.init();
} catch (err) {
  console.error("[Redis] init failed:", err);
  throw err;
}
// RedisClient.instance is now available app-wide
```

The main entry imports and runs wiring; wiring performs Redis init.

## Access Pattern

```typescript
// Any module that needs Redis
import { RedisClient } from "./redis";

const client = RedisClient.instance;
```

## Try-Catch + Logging + Safe Result

Every Redis operation must be wrapped in try-catch. Log the error and return a safe value so callers can handle the failure without throwing.

**Example — get:**

```typescript
import { RedisClient } from "./redis";

async function getCachedUser(id: string): Promise<User | null> {
  try {
    const raw = await RedisClient.instance.get(`user:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("[Redis] get failed:", err);
    return null; // safe fallback — caller can proceed without cache
  }
}
```

**Example — set:**

```typescript
async function setCachedUser(id: string, user: User): Promise<boolean> {
  try {
    await RedisClient.instance.set(`user:${id}`, JSON.stringify(user), "EX", 3600);
    return true;
  } catch (err) {
    console.error("[Redis] set failed:", err);
    return false; // safe — caller knows it didn't persist
  }
}
```

**Example — list/array:**

```typescript
async function getCachedIds(): Promise<string[]> {
  try {
    const ids = await RedisClient.instance.smembers("active:ids");
    return ids;
  } catch (err) {
    console.error("[Redis] smembers failed:", err);
    return []; // safe — empty array instead of throwing
  }
}
```

## RedisClient Singleton

Use ioredis. Get Redis URL from `ApplicationConfigs`:

```typescript
// src/redis/RedisClient.ts
import Redis from "ioredis";
import { ApplicationConfigs } from "../configs";

export class RedisClient {
  private static _instance: Redis | null = null;

  static async init(): Promise<Redis> {
    if (RedisClient._instance) {
      return RedisClient._instance;
    }
    const url = ApplicationConfigs.instance.redis.url;
    RedisClient._instance = new Redis(url);
    await RedisClient._instance.ping();
    return RedisClient._instance;
  }

  static get instance(): Redis {
    if (!RedisClient._instance) {
      throw new Error("RedisClient not initialized. Call init() at app start.");
    }
    return RedisClient._instance;
  }
}
```

## Error Logging Format

Use a consistent prefix so logs are easy to filter:

```typescript
console.error("[Redis] <operation> failed:", err);
```

Include the operation name (get, set, del, etc.) when useful for debugging.

## Safe Result Guidelines

| Operation type | Safe fallback |
|----------------|---------------|
| Get single value | `null` |
| Get list/set | `[]` |
| Set/delete | `false` or `0` |
| Exists check | `false` |
| Increment | previous value or `0` if unknown |

Choose a fallback that lets the caller continue without Redis — e.g. return `null` for cache miss so the caller can fetch from DB.

## Parsing Redis Data (hash, JSON, etc.)

When parsing Redis data into domain objects (e.g. hash to state, JSON to entity), do **not** use placeholders for missing required fields. Validate required fields explicitly:

- If a required field is missing or invalid — log error with `[Redis]` prefix and return a safe value (e.g. `null`)
- Do not silently substitute `""`, `0`, or other defaults for missing required data — that hides corruption

```typescript
function parseHashToState(hash: Record<string, string>, playerId: PlayerId): InGameUserState | null {
  if (hash.status === undefined || hash.status === null) {
    console.error("[Redis] parseHashToState failed: missing required field 'status'", { hash });
    return null;
  }
  if (hash.bountyCount === undefined || hash.bountyCount === null) {
    console.error("[Redis] parseHashToState failed: missing required field 'bountyCount'", { hash });
    return null;
  }
  const bountyCount = parseInt(hash.bountyCount, 10);
  if (Number.isNaN(bountyCount)) {
    console.error("[Redis] parseHashToState failed: invalid bountyCount", { hash });
    return null;
  }
  return {
    playerId,
    status: hash.status,
    tableId: hash.tableId || null,
    bountyCount,
  };
}
```

## What to Avoid

- **Redis files outside `src/redis/`** — Put all Redis modules in `src/redis/`.
- **Redis init in main entry** — Put Redis init in wiring (`src/wiring/`), not in `src/index.ts`.
- **Creating new Redis clients in services** — Use `RedisClient.instance` only.
- **Using Bun's Redis** — Use ioredis for Redis client.
- **Letting Redis errors bubble up uncaught** — Wrap in try-catch and return safe values.
- **Silent failures** — Always log errors; use `[Redis]` prefix for grep-friendly logs.
- **Throwing on cache miss** — Cache miss is normal; return `null` and let the caller handle it.
- **Placeholders for missing required fields** — In parse/transform functions, validate required fields; log and return safe value if missing.
