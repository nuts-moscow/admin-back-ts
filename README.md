# admin-back-ts

To install dependencies:

```bash
bun install
```

Required environment variables:

- `JWT_SECRET`, `PLAYER_JWT_SECRET` — at least 32 characters each (HS256 signing keys)
- `POSTGRES_URL` (or `POSTGRES_HOST`/`POSTGRES_USER`/etc.), `REDIS_URL`, `CORS_ORIGIN`, etc. — see `apps/admin-back/.env.example` for the full list and defaults

To run:

```bash
JWT_SECRET=your-32-plus-character-secret-here bun run src/index.ts
```

This project was created using `bun init` in bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
