---
name: archi-plan
description: Generate an implementation plan from a hardened archi architecture spec using the `archi plan` CLI.
user_invocable: true
---

# Generate Implementation Plan

You are generating an implementation plan from a **hardened** archi architecture spec. The spec must already have completed stress testing and nesting. The plan is authored entirely through `archi plan` subcommands. The tool is `archi`.

Ask every question to the user through the editor's poll tool (`AskUserQuestion` in Claude Code, the equivalent elsewhere) — never dump a freeform question when the answer is a choice.

## Step 1 — Name and create the plan

Decide the plan's name. If the user did not provide one with the skill invocation, ask through the poll tool with two options: **automation** (you derive a name from the problem statement) and a **free-text field** for the user to type their own.

Check whether a plan with that name already exists (`archi plan list`). If it does, ask through the poll tool with two options: **continue the existing plan** (keep the name and proceed as-is) or **pick a different name** (return to the naming prompt). Repeat until the name is fresh or the user opts to continue.

Open the plan:

```
archi plan use <name>
```

The CLI refuses with an explicit error if the spec is not ready for planning (unsatisfied requirements remain, or a stress session is open). If `plan use` errors, stop and surface the message verbatim to the user — send them back to `/arch` to finish hardening the spec.

On success, `<name>` becomes the default plan for subsequent commands. A fresh name creates an empty skeleton and pins the current spec version; an existing name reopens it as-is. Everything below authors this plan.

## Step 2 — Gather the Full Picture

```
archi scope map
archi req list
archi version list
archi stress list
```

Use these to build your mental model of the spec before cutting tasks.

## Step 3 — Determine Task Ordering

Implementation order is the dependency DAG — and you **author the DAG through `inputs[].from_task`**. Every `archi plan task input add --from <producer>` records both "what flows in" and a dependency edge. The producer must exist before the consumer — CLI rejects forward references.

Getting inputs right therefore governs execution order directly: `archi plan show` lays tasks out in waves derived from these edges, and `archi plan next` advances them in the same order.

Analyze the graph to determine implementation order:
1. **Leaf nodes first** — components with no dependencies
2. **Data stores before services** — schema/storage before logic
3. **Shared types/contracts before consumers** — interfaces before implementations
4. **Bottom-up through nesting** — child-scope components before parents

## Step 4 — Author the Plan

### Envelope — the plan-level frame

Author once, before any task.

```
archi plan problem "<what this plan delivers, in product terms>"
archi plan tech provenance "<where the stack decision came from>"
archi plan tech add <concern> <technology>                     # repeat per concern
archi plan architecture-summary add <node> "<one-line role>"   # one entry per top-level node
archi plan stack-mapping add <node> "<which concrete tech realizes this node>"
```

Cover **every top-level node** with both a summary entry and a mapping entry. Derive tech-stack concerns from the project context — one per top-level node's type (runtime for `Service` / `Client`, engine for `Store`, provider for `ExternalProvider`) plus the always-ask cross-cutting layer: **test frameworks and libraries the user actually uses** (unit, integration, e2e). Ask every choice through the poll tool — never assume.

If the `context7` MCP server is configured in the user's environment, consult it for up-to-date docs of the candidate technologies before offering poll options; otherwise rely on what you know.

The task DAG and execution order are derived from `inputs[].from_task` and rendered by `archi plan show`.

### Tasks — one task per node

For each node (bottom-up):

```
archi plan task add <task_id> <scope> <node_id>
```

**This is the core CLI move.** `plan task add` auto-seeds the task with:
- `spec_refs` — the node plus its incoming edges, in canonical form.
- `requirements` — every req targeting those spec_refs, plus reqs on non-excluded endpoints of cross-scope edges. Each carries `home_scope` (the scope that owns the req in the spec), `matched_refs` (which of the task's own spec_refs pulled it in), and a stable local `slot_id` (`r1`, `r2`, …) for CLI addressing. Spec-side identity is `(req_id, home_scope)` — two scopes can mint reqs with the same id and stay distinct; `slot_id` disambiguates them for `verification add/remove`.

You **do not** run `archi req list --target <ref>` + `archi req show <id>` and paste text into a file. The reverse-lookup is done for you and re-runs on every mutation; the text is rendered by `archi plan task show`.

Inspect the seeded task:

```
archi plan task show <task_id>       # spec-enriched markdown brief
```

The auto-seed is conservative: **node + incoming edges only**. Outgoing edges the task realizes (the task as caller), sibling nodes it logically participates with (a shared type, a configuration), or cross-scope edges it crosses are not seeded. If the task owns any of these, add them explicitly — each new ref triggers a resync that pulls in its requirements:

```
archi plan task spec-ref add <task_id> <node_id_or_edge_ref>
```

Edge refs use the canonical form `from->to:edge_type`.

Then fill in what the spec cannot provide:

```
archi plan task desc <task_id> "<what this task delivers, in product terms>"
archi plan task stack-detail add <task_id> "<specific library / API / pattern>"
archi plan task input add <task_id> "<concrete artifact that flows in — file path, interface signature, schema, DTO, contract>" --from <producer_task_id>
archi plan task output add <task_id> "<what this output is>" --file <relative/path>
```

Inputs are keyed by the producing task and carry the full dependency graph — every `--from` marks a prerequisite task. Outputs are keyed by the produced file.

The **input note** is the one place the plan records *what actually crosses the task boundary*. Write it concretely — name the artifact kind (schema, interface, union type, config file, generated client, migration, etc.) and what the consumer takes from it. This note appears verbatim in `archi plan show` under each dependency arrow and in `archi plan task show` — both human reviewers and downstream implementation sub-agents read it to understand the contract. Weak notes ("data from X", "stuff from Y") break that contract and waste a coordination slot; if you can't name what flows, the dependency probably shouldn't be there.

List the task's matched requirements:

```
archi plan task req-list <task_id>
```

Each line starts with a `slot_id` (`r1`, `r2`, …) — that slot is what `verification add/remove` addresses, not the spec-side req id. Slots are stable across resyncs.

**For every slot printed, author at least one verification** — a concrete, observable check describing how the implementer will prove the req holds (a failing test, a type signature, a runtime contract, a migration assertion, a manual inspection — whatever the req's prose prescribes):

```
archi plan task verification add <task_id> <slot_id> "<observable check>"
```

If a requirement covers multiple distinct concerns, author one verification per concern (same slot, multiple `verification add` calls). Do not paraphrase the requirement — name the check. A task without at least one verification per matched req cannot be shipped; `archi plan verify` flags it.

### Task Granularity

- Top-level nodes **not** decomposed → one task each.
- Top-level nodes **decomposed** → one task per child-scope node **plus one integration task** for the parent.
- Shared types/contracts → one task.
- Data-store schemas → one task per store (or grouped if tightly coupled).
- **End-to-end coverage** → `archi plan scenarios add` (see below). Scenarios are envelope data, not tasks.

### Scenarios — end-to-end user-story coverage

A user story crosses many spec elements (Client → Gateway → Service → Store). Pinning it to one would lie about its scope, so scenarios live on the plan envelope as free-text, not on the spec.

```
archi plan scenarios add "<one user-visible flow>"
archi plan scenarios list
archi plan scenarios remove <index>          # 1-based, from `list`
```

Scenarios are not linked to spec requirements — `plan verify` doesn't gate them. Walk the architecture as a user, enumerate every distinct user-visible flow the product promises, one sentence each.

### Verify the plan

```
archi plan verify
```

Reports every structural issue: empty descriptions, missing outputs, unverified requirements, dangling deps, inputs pointing at tasks that don't exist, architecture-summary nodes without stack-mapping, and so on. Resolve every `Broken` finding before handing off; explain every `Drifted` finding to the user.

Present the final plan to the user:

```
archi plan show
archi plan task list
```

## Principles

- **archi spec is the source of truth.** Query it via `archi plan task add` + `archi plan task show`; do not paraphrase from memory and do not retype spec data into the plan.
- **Requirements are auto-pulled.** Every task's matched requirements and spec_refs come from reverse-lookup against the spec and re-sync on every mutation. Spec-side identity is `(req_id, home_scope)`; `matched_refs` tells you why each req is on a given task; `slot_id` is the stable local address you pass to `verification add/remove`.
- **Each task is a standalone brief.** `archi plan task show` renders everything a sub-agent needs — node definition, spec_refs, requirements, verifications, inputs, outputs, stack details, deps. No implicit context.
- **Plan reflects the hardened architecture.** The plan implements what survived stress testing, not what was first proposed.
- **Every task binds code to spec.** `spec_refs` are the contract; at implementation time, each ref must get at least one `archi link add` (see `skills/code-link.md`). The plan lists the refs; the code-link skill governs how they are satisfied.
- **Verifications pull the work.** Each verification is an observable check; implementation takes whatever shape the check asks for.
- **Scenarios are envelope user stories.** End-to-end user stories are free text on the plan; they are not tasks and not linked to specific requirements.
- **CLI is the only author.** Every mutation goes through `archi plan`; every read goes through `archi plan show` / `archi plan task show` / `archi plan task req-list`. Do not hand-write plan files or poke at on-disk storage.
