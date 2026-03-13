---
name: using-cache
description: Defines cache as interface + implementation in the same file, with singleton instance. All cache files live in src/cache/. Interface on top, implementation next, instance last. All interface methods have JSDoc comments. Use this skill when adding cache, caching layer, or key-value store; when the user mentions cache, get/set cache, or cache invalidation — even if they don't explicitly say "cache".
---

# Using Cache

## Quick Start

1. Create cache files in `src/cache/`
2. Define interface at top of file with JSDoc on every method
3. Add implementation in the same file (implements interface)
4. Export singleton instance at bottom of file
5. Access cache via the singleton
6. Log entry (input params) and result for each API method in human-readable format

## File Layout

Each cache file follows this order:

1. **Interface** — at top, all methods documented
2. **Implementation** — class that implements the interface
3. **Instance** — singleton, initialized and exported

## Why Interface + Same File

The interface documents the contract and enables swapping implementations (e.g. in-memory for tests, Redis for prod). Keeping interface and implementation in one file keeps related code together; the singleton in the same file avoids extra init wiring.

## Structure

All cache files belong in `src/cache/`:

```
src/cache/
├── UserCache.ts      # IUserCache + UserCache + instance
├── SessionCache.ts   # ISessionCache + SessionCache + instance
└── index.ts         # Re-exports instances
```

## Template

```typescript
// src/cache/UserCache.ts

/** Cache for user data by ID */
export interface IUserCache {
  /**
   * Gets a cached user by ID.
   * @param id - User ID
   * @returns Cached user or null if miss/expired
   */
  get(id: string): Promise<User | null>;

  /**
   * Stores a user in cache.
   * @param id - User ID
   * @param user - User to cache
   * @param ttlSeconds - TTL in seconds (default 3600)
   * @returns true if stored, false on error
   */
  set(id: string, user: User, ttlSeconds?: number): Promise<boolean>;

  /**
   * Removes a user from cache.
   * @param id - User ID
   * @returns true if removed, false on error
   */
  delete(id: string): Promise<boolean>;
}

class UserCacheImpl implements IUserCache {
  async get(id: string): Promise<User | null> {
    try {
      const raw = await RedisClient.instance.get(`user:${id}`);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error("[Cache] UserCache.get failed:", err);
      return null;
    }
  }

  async set(id: string, user: User, ttlSeconds = 3600): Promise<boolean> {
    try {
      await RedisClient.instance.set(
        `user:${id}`,
        JSON.stringify(user),
        "EX",
        ttlSeconds
      );
      return true;
    } catch (err) {
      console.error("[Cache] UserCache.set failed:", err);
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await RedisClient.instance.del(`user:${id}`);
      return true;
    } catch (err) {
      console.error("[Cache] UserCache.delete failed:", err);
      return false;
    }
  }
}

export const UserCache: IUserCache = new UserCacheImpl();
```

## Interface Comments

Every method in the interface must have JSDoc:

- **Summary** — brief description of what it does
- **@param** — for each parameter
- **@returns** — for return value

```typescript
/**
 * Gets a value by key.
 * @param key - Cache key
 * @returns Cached value or null if miss
 */
get(key: string): Promise<User | null>;
```

## Entry and Result Logging

Log every cache API method call with human-readable entry (inputs) and result (output):

- **Entry**: At the start of each method, log the method name and all input parameters in a human-readable format
- **Result**: Before returning, log the result in a human-readable format

Use `console.log` with a consistent prefix that includes the cache name (e.g. `[InGameUserStateCache]`) so logs are filterable when there are many caches. Keep output readable — avoid dumping raw objects; summarize or format key fields.

```typescript
const LOG_PREFIX = "[InGameUserStateCache]";

async get(playerId: PlayerId, tournamentId: TournamentId): Promise<InGameUserState | null> {
  console.log(`${LOG_PREFIX} InGameUserStateCache.get entry:`, { playerId, tournamentId });

  try {
    const k = key(tournamentId, playerId);
    const hash = await RedisClient.instance.hgetall(k);
    if (!hash || Object.keys(hash).length === 0) {
      console.log(`${LOG_PREFIX} InGameUserStateCache.get result: miss (no data)`);
      return null;
    }
    const state = parseHashToState(hash, playerId);
    console.log(`${LOG_PREFIX} InGameUserStateCache.get result:`, state ? `hit (playerId=${state.playerId}, bountyCount=${state.bountyCount})` : "miss (parse failed)");
    return state;
  } catch (err) {
    console.error(`${LOG_PREFIX} InGameUserStateCache.get failed:`, err);
    console.log(`${LOG_PREFIX} InGameUserStateCache.get result: error (returning null)`);
    return null;
  }
}
```

For `set` and other mutating methods, log entry params and result (e.g. `stored` or `failed`).

## Access Pattern

```typescript
// Any module that needs cache
import { UserCache } from "./cache";  // from src/

const user = await UserCache.get("user-123");
```

## What to Avoid

- **Cache files outside `src/cache/`** — Put all cache modules in `src/cache/`.
- **Interface in one file, implementation in another** — Keep both in the same file.
- **Implementation without interface** — Always define the interface first.
- **Methods without comments** — Document every interface method.
- **Instance in a separate init file** — Instantiate at bottom of the same file as the implementation.
- **Exporting the implementation class** — Export the interface type and the singleton instance; the implementation class can stay private.
- **Skipping entry/result logs** — Log inputs and outputs for every cache API method; keep format human-readable.
