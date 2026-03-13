---
name: creating-domain-models
description: Defines domain models as TypeScript interfaces in src/domain/. File name equals model name (e.g. User.ts for User). Use this skill when adding entities, data shapes, or domain types; when the user mentions domain model, entity, or data structure — even if they don't explicitly say "domain model".
---

# Creating Domain Models

## Quick Start

1. Create domain model files in `src/domain/`
2. File name = model name (e.g. `User.ts` → `User`, `Order.ts` → `Order`)
3. Use interface or type for the shape
4. Export from `domain/index.ts` for clean imports

## File Naming

`src/domain/<ModelName>.ts` — the exported interface/type name must match the file name (without extension).

| File | Model |
|------|-------|
| `src/domain/User.ts` | `User` |
| `src/domain/Order.ts` | `Order` |
| `src/domain/Session.ts` | `Session` |

## Structure

All domain models belong in `src/domain/`:

```
src/domain/
├── User.ts
├── Order.ts
├── Session.ts
└── index.ts    # Re-exports all models
```

## Template

```typescript
// src/domain/User.ts

/** User entity in the system */
export interface User {
  id: string;
  email: string;
  createdAt: Date;
}
```

## index.ts

Re-export models for convenient imports:

```typescript
// src/domain/index.ts
export { User } from "./User";
export { Order } from "./Order";
```

## Access Pattern

```typescript
// Any module that needs a domain model
import { User } from "./domain";
// or
import { User } from "./domain/User";
// (paths relative to src/)
```

## What to Avoid

- **Models outside `src/domain/`** — Put all domain interfaces in `src/domain/`.
- **Mismatched file and model names** — `User.ts` should export `User`, not `UserEntity` or `IUser`.
- **Classes when interface suffices** — Use interface/type for data shape; avoid classes unless you need methods or runtime behavior.
