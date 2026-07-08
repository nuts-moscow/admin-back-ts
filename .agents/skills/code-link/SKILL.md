---
name: code-link
description: Record and verify code-links — pinned claims that code realizes spec elements — using archi link commands.
user_invocable: false
---

# Code-Link Workflow

A **code-link** pins a claim that some **code** (`CodeRef` = file + optional `::symbol` + content hash) **realizes** a **spec element** (`SpecRef` = node id, or edge `from=<id> to=<id> type=<t>`) within a `(scope_path, version_id)` slot. CLI binary: **`archi`**.

Not the same as: `Requirement`/`Sat` (obligation, not realization), test coverage, `archi search`, or `archi query`.

## When to link

**After** the code exists (or as you finish the edit), **before** you call the task done. Never premature (pins wrong bytes); never as a deferred pass (loses file context).

## Loop

1. `archi show <spec-ref>` — load spec element.
2. `archi link ls --spec <spec-ref>` — see existing realizations.
3. `archi link verify --spec <spec-ref>` — fix in-scope drift first; flag drift that needs product input.
4. Implement the change.
5. `archi link add <spec-ref> <code-ref> --kind literal|indirect` — one per artifact. Add `--role <str>` for fan-out only. `--dedupe` if you might double-add. `--force-literal` only when a file-level ref truly is the encoding.
6. `archi link verify --since HEAD` — catch collateral drift.
7. Hand off: spec elements touched, links added/removed, intentional leftover drift (why + how tracked).

## Kind

- **`literal`** — code **is** the encoding. Body drift is meaningful (`Drifted` → Review).
- **`indirect`** — code **participates in** a distributed/architectural property. Body drift is expected; severity focuses on missing/moved.

If unsure, prefer `indirect`. CLI/serde lowercase.

**File-level refs (no symbol path) default to `indirect`**; `--kind literal` warns and may downgrade unless you pass `--force-literal` (use only for small config, lockfile, generated artifact).

## Role

`--role <str>` is free-form, for **fan-out** (one spec element → handler/validator/storage). Omit for 1:1. Don't invent a vocabulary.

## Spec-first escape

If the **spec** is wrong, **edit spec first with `archi`**, then code. Code never rewrites the spec graph. Renames cascade spec-side at `WORKING` in the edited scope only — saved snapshots are immutable, and code-side renames/moves never auto-cascade (verify reports `Moved`/`Missing`; you fix explicitly).

## Drift and severity

| State | Meaning |
|-------|---------|
| `Clean` | Exists; hash matches at stored `canonicalizer_version`. |
| `Drifted { current_hash }` | Exists; hash changed post-canonicalization. |
| `Moved { new_file, new_symbol }` | Stored path/symbol missing; heuristic found candidate (skip with `--fast`). |
| `Missing` | File or symbol no longer locatable. |
| `CanonicalizerMismatch { stored, current }` | Versions differ; hashes not comparable — rehash + re-pin, never fold into `Clean`/`Drifted`. |

| State \ Kind | `literal` | `indirect` |
|---|---|---|
| `Clean` | Ok | Ok |
| `Drifted` | Review | Ok |
| `Moved` | Review | Review |
| `Missing` | Broken | Broken |
| `CanonicalizerMismatch` | Review | Review |

Verify exit codes: `0` all Ok; `1` any Review, none Broken; `2` any Broken.

## Failure playbook

| Symptom | Action |
|---|---|
| `Moved` | `link add` at new location; `link rm <id>` on stale row. |
| Under-realized (audit) | Add links, reclassify kind, or leave spec-only with rationale in spec prose. |
| Mass `Drifted` after refactor | Cosmetic → bulk re-pin; behavioral → update spec/kinds first. |
| `Missing` / Broken | Restore artifact or remove obsolete links after confirming spec still expects them. |
| `CanonicalizerMismatch` | Rehash + re-pin under current canonicalizer. |

## Scope & version discipline

- **Scope.** Node ids are unique per scope. `link add` uses the active scope and rejects refs that don't resolve inside it. No cross-scope edges or links. Rename cascades touch only the edited scope. `link rm --scope <path>` required before removing a scope that has links.
- **Version.** Keyed by `(scope_path, version_id)`. `WORKING` is the only mutable slot. `version save` snapshots links + spec; `version checkout <v>` copies `Saved(v)` into `WORKING` and **discards** prior `WORKING` — save first if needed. `link add`/`rm` against a saved slot errors (`ImmutableVersion`); fix drift via checkout → edit `WORKING` → save.
- **Spec removal.** Removing a node / edge type with links is rejected; error hints at `link rm --spec …`. A product-level `--force` may cascade-delete.

## Paths

`code_ref.file` is **relative to the fractal root** (dir containing `.fractal/`), canonicalized. `link add` rejects absolute paths and `..` escapes (`PathAbsolute`/`PathEscapesRoot`). Verify never reads outside the root. Root is discovered by walking upward for `.fractal/`.

## Hashing (why hashes can churn)

`symbol_hash = blake3(canonical_body)` over a **byte slice** of the source (never an AST re-emission). Canonicalization: normalize `\n`, strip trailing whitespace per line, enforce one final newline. **Comments and `#[...]` attributes are kept** — changing them changes the hash. No rustfmt re-pass. Each `CodeRef` stores `canonicalizer_version = { parser, rules }` (e.g. `syn@2`/`v1` for Rust, `bytes`/`v1` for file/line refs); verify only compares hashes when versions match.

## CLI

`SPEC_REF`: `node_id` or `from=<id> to=<id> type=<edge_type>`. `CODE_REF`: `path`, `path::Symbol`, or `file:line-line`. All commands accept `--format text|json` and `--scope <path>` where applicable.

- **`archi link add <SPEC_REF> <CODE_REF> --kind literal|indirect`** — flags: `--role <str>`, `--dedupe`, `--force-literal`, `--format`, `--scope`. Implicit `version_id = WORKING`; saved-slot writes rejected; errors on unresolved refs or root-escaping paths.
- **`archi link ls`** — AND-composed filters: `--spec`, `--file`, `--symbol`, `--kind`, `--role`, `--scope`, `--format`.
- **`archi link rm <ID>`** / `archi link rm --spec <SPEC_REF> [--scope …] --yes` / `archi link rm --file <path> [--scope …] --yes`. Saved slots rejected.
- **`archi link verify`** — `--spec`, `--file` (repeatable), `--since <git-ref>`, `--fast`, `--format`. Exit codes above.
- **`archi link audit [--min-literal N] [--max-distinct-specs N] [--format …]`** — read-only aggregates; exit `1` on any finding.
- **`archi link init`** — idempotent; creates empty `.fractal/links.json`.

## Example

Implement `gateway.auth` in `src/auth.rs::validate_token`:

```
archi show gateway.auth
archi link ls --spec gateway.auth                        # empty
archi link verify --spec gateway.auth                    # clean
# ... edit src/auth.rs ...
archi link add gateway.auth src/auth.rs::validate_token --kind literal
archi link verify --since HEAD                           # Clean
```
