# admin-back-ts

To install dependencies:

```bash
bun install
```

Required environment variables:

- `JWT_SECRET` — at least 32 characters (HS256 signing key for admin JWTs)
- `DATABASE_URL`, Redis, etc. as configured in `src/configs/`

To run:

```bash
JWT_SECRET=your-32-plus-character-secret-here bun run src/index.ts
```

This project was created using `bun init` in bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
