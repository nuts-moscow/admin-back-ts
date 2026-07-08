---
name: arch-existing
description: How to start an archi session on an existing codebase — explore, reverse-engineer the problem, and derive a starting spec before Step 1 of `arch`.
user_invocable: false
---

# Existing-Project Archi Onboarding

Read this when running the `archi` skill on a repo that already has code. It replaces Step 0 of `archi` with a codebase-first flow. When you reach Step 1 of `arch`, use the types/nodes you derived here instead of inventing from scratch.

## Guiding rule

Model **what the code actually does**, not what the README promises or what would be nice. Everything in the spec must correspond to a real component, store, queue, or edge you can point to in the source. Aspirational or TODO features are **candidate stressors** — not initial requirements.

## A. Map the codebase

Before writing anything to `archi`, build your own mental model.

- **Entrypoints** — `main.*`, `cmd/*/main.go`, `bin/*`, `src/index.*`, service `Dockerfile`s, `Procfile`, systemd units, Lambda/Cloud Run handlers.
- **Service boundaries** — separate processes, deployables, workers, cron jobs, long-running daemons.
- **Data stores** — databases, caches, object stores, search indexes. Check config/env files and ORM schema files.
- **Queues and event buses** — Kafka/SQS/NATS topics, in-process channels only if they span deployable boundaries.
- **External dependencies** — third-party APIs called from code (grep for HTTP clients, SDK imports).
- **Wiring** — what calls what: follow imports, RPC clients, HTTP handlers, message producers/consumers.

Tools: `Glob`, `Grep`, `Read`. Start broad (directory layout, top-level configs), narrow to specific call sites once you know what to look for.

## B. Reverse-engineer the problem statement

Draft a problem statement from: README, top-level docs, `package.json`/`Cargo.toml` descriptions, the names of entrypoints, the shape of the data model. **Show it to the user and confirm before running `archi problem set`** — your inferred problem drives everything else.

Record the implementation stack you observe (language, frameworks, infra) in the problem statement or a version note. The stack is a fact about this repo, not a constraint to be designed around.

## C. Propose the ontology

Build a type taxonomy that fits what you found — don't import a generic "Service/Store/Queue" set. Good taxonomies usually include:

- A root type (e.g. `Type`, `Component`) with subtyping via an edge type (e.g. `subtype_of`).
- Runtime categories you saw: `Service`, `Worker`, `Store`, `Queue`, `ExternalAPI`, `Schema`, etc. — pick what matches.
- Edge types for the relationships you saw: `calls`, `reads`, `writes`, `publishes_to`, `consumes_from`, `depends_on`.

## D. Populate the spec — and link it to the code

Instantiate nodes and edges **only for what exists in the code**.

- One node per deployable component, store, queue, or external dependency you identified in (A).
- Node `definition` = one prose sentence describing what this specific instance *is* in the system (not its tech — the tech lives in the problem-statement stack note).
- Edges = the wiring you traced. If you can't point to the call site, don't add the edge.
- Skip stubbed, commented-out, or TODO components. They become stressor-candidates in Step 2.

**Link each spec element to the code as you create it.** Reverse-engineering is when the file context is in hand — pin it before it goes stale. Run `archi link init` once, then immediately `archi link add <spec-ref> <code-ref>` for each node/edge against the code you traced it from (`<code-ref>` is `path`, `path::Symbol`, or `path:line-line`):

- Default to `--kind indirect` — a node is realized by many symbols, an edge by a call site inside a method; the code *participates in* the element, it doesn't encode it.
- Use `--kind literal` only when the code genuinely *is* the encoding: a schema file, a config value, a generated artifact.
- Populate-then-link, one ref at a time — the element must exist before you link it, and a deferred linking pass loses the file context.

## E. Derive initial requirements

Each requirement declares `--kind functional` or `--kind nonfunctional`. Functional reqs name capabilities the system must provide (and which existing nodes realize); non-functional reqs name constraints on how it provides them.

Only requirements that come directly from the **problem statement** (what this system is *for*) are `--origin initial`. Everything else waits:

- Promises visible in code that a stakeholder obviously cares about (SLAs in config, health checks, compliance annotations, authn/authz enforcement, data-retention policies) — these are typically `initial`.
- Behaviours the code happens to have but the problem doesn't demand (retry policies, cache tiers, specific scaling choices) — these are **not** initial. They'll show up as solutions to stressors in Step 2/3.
- Ambiguous cases — ask the user.

Satisfy the initial requirements the existing code already handles with `archi req sat <id> "<explanation referencing the implementing node(s)>"`.

Verifications are authored later on the plan (`archi plan task verification add`), not on the requirement itself. Pointers to existing tests / checks (health endpoint path, auth middleware file, integration test name) belong there.

## F. Confirm before saving

Before `archi version save`, summarize to the user:

- Inferred problem statement and stack.
- Full type taxonomy (node types + edge types).
- Node list (id + one-line definition).
- Initial requirements and which are already satisfied.
- Code-links authored — which spec elements are pinned to which files/symbols.
- What you **deliberately excluded** (stubs, aspirational features, behaviours that are stressor-candidates).

Save as `archi version save "Baseline from existing codebase"` once the user confirms — this snapshots the links alongside the spec. Then return to the `arch` skill at Step 2 — the first stress session runs against the reverse-engineered baseline.

## Common pitfalls

- **Modelling the wished-for architecture.** If the code does not have a circuit breaker, the spec should not have a circuit-breaker node. That absence is what stress testing will surface.
- **Treating imports as the only dependency signal.** Services talking over HTTP/gRPC/queues won't show up in imports; grep for URLs, topic names, env-provided addresses.
- **Conflating the code's structure with the architecture.** A monorepo of five packages may be one deployable service; one package may contain three. Group by deployment boundary, not directory.
- **Packing tech into definitions.** "A PostgreSQL store for user records" is wrong; "the canonical store of user records" is right. The stack goes in the problem-statement note.
