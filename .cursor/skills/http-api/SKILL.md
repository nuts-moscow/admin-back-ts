---
name: http-api
description: Defines HTTP server structure in src/http/ with routes and services. Server init in wiring. Keeps OpenAPI docs in sync with routes. Use when adding HTTP API, REST endpoints, server routes, or API handlers; when the user mentions HTTP server, API, routes, or endpoints — even if they don't explicitly say "HTTP API".
---

# HTTP API

## Quick Start

1. Create HTTP server and structure in `src/http/`
2. Init server in wiring: call server init from `src/wiring/`
3. Routes in `src/http/routes/` — describe API methods
4. Services in `src/http/services/` — used by routes
5. Server registers all routes
6. **On every route change**: update `openapi/schemas.ts` and `openapi/registry.ts` so docs stay accurate

## Structure

All HTTP files belong in `src/http/`:

```
src/http/
├── server.ts         # Server creation, registers all routes
├── index.ts          # Re-exports
├── openapi/          # OpenAPI spec from Zod — keep in sync with routes
│   ├── schemas.ts    # Zod schemas with .openapi() metadata
│   ├── registry.ts   # registerPath() for each endpoint
│   └── generator.ts  # generateOpenAPIDocument()
├── routes/           # API method definitions
│   ├── users.ts
│   └── health.ts
└── services/         # HTTP services used by routes
    ├── UserService.ts
    └── ...
```

## Init in Wiring

HTTP server init belongs in wiring, not in the main entry:

```typescript
// src/wiring/index.ts
import { createHttpServer } from "../http";

export async function wireHttp(): Promise<void> {
  createHttpServer();
}
```

## Routes

Routes describe API methods. Each route file defines handlers for specific paths:

```typescript
// src/http/routes/users.ts
import { UserService } from "../services/UserService";

export function usersRoutes() {
  const userService = new UserService();

  return {
    "/api/users": {
      GET: async () => {
        const users = await userService.list();
        return Response.json(users);
      },
    },
    "/api/users/:id": {
      GET: async (req: Request) => {
        const id = req.params?.id;
        const user = await userService.get(id);
        return user ? Response.json(user) : new Response(null, { status: 404 });
      },
    },
  };
}
```

## Services

Services contain business logic used by routes. Routes call services; services do not know about HTTP:

```typescript
// src/http/services/UserService.ts
export class UserService {
  async list() {
    // ...
  }
  async get(id: string) {
    // ...
  }
}
```

## Server with All Routes

The HTTP server must register all routes. Collect routes from every route file and pass them to the server:

```typescript
// src/http/server.ts
import { usersRoutes } from "./routes/users";
import { healthRoutes } from "./routes/health";

export function createHttpServer() {
  const routes = {
    ...usersRoutes(),
    ...healthRoutes(),
  };

  Bun.serve({
    port: 3000,
    routes,
  });
}
```

## OpenAPI: Keep Descriptions in Sync

On **every** route change, update OpenAPI docs so `/openapi.json` and `/docs` stay accurate.

| Change | Update |
|-------|--------|
| Add route | Add handler in route file; add Zod schema in `src/http/openapi/schemas.ts`; add `registerPath()` in `src/http/openapi/registry.ts` |
| Change path/params | Update route; update path in registry; add/update param schema if needed |
| Change request body | Update route; add/update body schema in schemas; update `request.body` in registry |
| Change response shape | Add/update schema in schemas; update `responses` in registry |
| Remove route | Remove handler; remove `registerPath()` for that path |

**Files to touch:**
- `src/http/openapi/schemas.ts` — Zod schemas with `.openapi({ description, example })` for fields
- `src/http/openapi/registry.ts` — `registerPath()` with `summary`, `description`, `request`, `responses`

Always add `summary` and `description` for each path; add `description` and `example` for schema fields when they clarify usage.

## What to Avoid

- **HTTP files outside `src/http/`** — Put all HTTP server, routes, and services in `src/http/`.
- **Server init in main entry** — Put HTTP init in wiring (`src/wiring/`).
- **Business logic in routes** — Move logic to services; routes only handle HTTP concerns.
- **Unregistered routes** — Ensure the server includes all route modules.
- **Stale OpenAPI** — Never leave routes changed without updating schemas and registry.
