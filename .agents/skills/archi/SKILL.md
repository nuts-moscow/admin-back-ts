---
name: archi
description: Guide an architecture session using the archiplan methodology — from problem statement through stress testing to a hardened design.
user_invocable: true
---

# Architecture Session

Before anything else, check that `archi` is on PATH (`command -v archi`). If it is, proceed — do **not** read the `setup` skill. If it isn't, read the `setup` skill (installed alongside this one in your editor's skills directory) and complete install/activate/init, then return here.

Guide the user through an archiplan session. The tool is `archi`. Follow the steps in order. Before each step ask whether the user wants you to (1) complete it autonomously and summarize, or (2) collaborate — propose, discuss, execute only after alignment. After each step offer next directions. Ask every question to the user through the editor's poll tool (`AskUserQuestion` in Claude Code, the equivalent elsewhere) — never dump a freeform question when the answer is a choice.

## Core concepts

**Layers.** Every type declares `--layer epistatic` (runtime coupling: deployable components, stores, queues, and their wiring) or `--layer epistemic` (ontology, requirements, stressors, documentation edges). NKP queries default to `--layer epistatic`; epistemic structure does not affect K̄/P̄/regime. Optional `--only-edge-types t1,t2,…` narrows which epistatic edge types count.

**NKP dashboard** prints on every mutation: `Regime: CRITICAL   K̄=2.10  P̄=0.62`.
- **Regime** — target **CRITICAL** (K̄ ∈ [1.0, 3.0]). ORDERED = under-coupled. CHAOTIC = cascades.
- **K̄** — mean dependency edges per node.
- **P̄** — fraction of the architecture that can change without affecting global fitness. Higher is more evolvable.

**Incidence** is orthogonal to NKP: the stressor×component matrix (epistemic×epistatic). NKP shows declared coupling; incidence shows where stress actually lands. Auto-prints after a `version save` that closes a stress session (set `FRACTAL_REPORT_JSON=1` for JSON). Finding kinds:
- `HYPERLIMINAL_COUPLING` — nodes co-react to a stressor with no short epistatic path between them. Hidden dependency: add the missing edge or split the shared concern.
- `STRESS_HOTSPOT` — a component under disproportionate pressure. Candidate for decomposition (`scope enter`).
- `COMPOUND_VULNERABILITY` — a pair of breaking stressors whose combined affects cover an **initial** requirement's target. Individually survivable, together break an initial promise.
- `MERGE_CANDIDATE` / `EXTRACT_SHARED` — columns with near-identical stress response (Jaccard ≥ τ_J). Two nodes may be one, or share an extractable concern.
- `DENSITY_ALERT` — K_hyper above τ_D: stress is landing everywhere.
- `BOUNDARY_CROSSING_STRESSOR` — a stressor touching far more nodes than typical. Likely crosses a boundary the architecture should make explicit.
- `UNDER_STRESSED` — components no stressor has touched. Propose stressors targeting them next iteration.

**Definitions are meaning, not metadata.** Every type/node carries one prose `definition`. Not a tag, env, owner, or `key=value` — definitions express semantic meaning, not operational metadata. If a single node genuinely plays multiple semantic roles (e.g. a Store that is also a Queue), model the extra roles as separate nodes connected by edges.

**A definition is one identity sentence — not a requirement list.** State *what the node is*, in a single sentence, in ≤240 characters. Every capability the node carries — whether **functional** (what it does: "watches inbound transfers", "rejects cross-border requests") or **non-functional** (how it must do it: "p95 < 50 ms", "encrypts at rest") — belongs in a `req` node, not in the definition:

```
archi req add <id> "<desc>" --kind functional|nonfunctional --targets <node>
```

`node add`/`edit` and `type add-node`/`edit-node` **hard-reject** multi-sentence definitions, definitions over 240 characters, and comma-spliced clauses carrying modal verbs (must/should/shall/ensures/handles).

**Verifications live on the plan, not on the spec.** Requirements in the spec state *what* must hold; the plan ties each req to concrete verifications (test, type invariant, doc check, etc.) on a specific task. Use `archi plan task verification add <task_id> <req_id> "<how to prove it>"`. A plan cannot be started while any matched requirement lacks a verification. `satisfy` on a req is why the design meets it; the plan's verifications are how the implementation proves it.

**Decisions are history, not constraints.** A `Decision` records the trade-off behind a spec move: title, prose rationale, links to spec elements and/or stressors, and the alternatives that lost. Decisions are scope-local, snapshotted by `version save`, and surface in `archi check` (orphan and dangling counts) and plan task briefs (`archi plan task show` lists decisions whose links intersect the task's `spec_refs`). They do **not** participate in NKP, incidence, or `plan verify` — they explain *why*, not what must hold. Orphan = zero links (`warn`); dangling = all linked elements deleted (`alert`, remove or relink).

**Warnings.** Every mutation may emit warnings about unused elements. **Eliminate all warnings before moving to the next step** — either use the element or delete it. Ask the user if removal is non-obvious.

## Preparation

Check for an in-progress session with `archi problem show`, `archi version list`, `archi stress list`. If one exists, summarize state and ask where to pick up.

Otherwise, decide which Step 0 flow applies:
- **Scratch project** (no existing code, or code is irrelevant to what the user wants to model) — continue with Step 0 below.
- **Existing codebase** (user wants `archi` to describe a repo that already exists) — **read the `arch-existing` skill (installed alongside this one in your editor's skills directory) and follow it instead of Step 0**, then rejoin this skill at Step 2.

## Step 0 — State the problem (scratch projects)

```
archi problem set "<problem description>"
```

Ask the user to describe the problem and initial requirements. Discuss what follows directly from the problem — those are the initial requirements, added later with `--origin initial`. If the user names a tech stack, record it in the problem statement or a version note, but keep the spec abstract — the stack does not constrain the modeling.

## Step 1 — Naïve architecture

Design the simplest architecture that solves the problem.

1. **Types** — build your ontology (e.g. `Type`, `Service`, subtyping via an edge type like `subtype_of`). Don't take built-in type names literally.
   ```
   archi type add-node <name> "<definition>" --layer epistatic
   archi type add-edge <name> --from <type> --to <type> --layer epistatic
   ```
2. **Nodes and edges** — instantiate. Each node carries its own `definition`.
   ```
   archi node add <id> <type> "<definition>"
   archi edge add <from> <to> <edge_type>
   ```
3. **Initial requirements** — one per requirement from the problem statement. `--kind functional|nonfunctional` is required (functional = a capability the system must provide; non-functional = a constraint on how it provides it). `--targets` is optional; attach targets up-front when the elements already exist, or wire them later.
   ```
   archi req add <id> "<description>" --kind functional --origin initial
   archi req add <id> "<description>" --kind nonfunctional --targets <node_or_edge> --origin initial
   archi req target-add <req_id> <node_or_edge>,<node_or_edge>                    # attach targets later
   archi req target-remove <req_id> <node_or_edge>                                # detach targets
   archi req kind <req_id> functional|nonfunctional                               # reclassify
   ```
   Verifications are authored on the plan (`archi plan task verification add`), not on the spec.
4. **Satisfy** what the naïve design already handles: `archi req sat <req_id> "<explanation>"`.
5. **Save**: `archi version save "Naive architecture"`.

Run `archi check`. Expect ORDERED or CRITICAL (few edges at this stage). Address any early hotspots and eliminate all warnings before stress testing.

## Step 2 — Stress session

```
archi stress start
```

Iteratively discover stressors. For each one:

**a. Identify.** Think hyperliminarily — pick a stakeholder, failure mode, scale concern, or regulatory constraint the happy path ignores. `--affects` is required and must resolve to epistatic nodes in scope.

```
archi stress stressor <id> "<description>" --affects <node1>,<node2>,...
archi stress affect-add <stressor_id> <node1>,...          # edit the pressure surface
archi stress affect-remove <stressor_id> <node1>,...       # cannot empty the list
```

**b. Attractor.** What configuration does the system get pushed toward?
```
archi stress attractor <stressor_id> "<attractor description>"
```

**c. Verdict.**
- Survives: `archi stress survive <stressor_id>`
- Breaks: describe the solution, then derive each requirement the solution demands. If the target element doesn't exist yet (e.g. it's introduced by the solution in Step 3), omit `--targets` and wire them with `req target-add` after you mutate the spec.
  ```
  archi stress breaking <stressor_id> "<solution description>"
  archi req add <req_id> "<description>" --kind functional --origin stressor:<session>:<stressor_id>
  archi req add <req_id> "<description>" --kind nonfunctional --targets <target> --origin stressor:<session>:<stressor_id>
  archi req target-add <req_id> <target>                                                                # after Step 3 introduces it
  archi stress derive-req <stressor_id> <req_id>
  ```

Keep proposing stressors from different angles. Stop when the user agrees no new ones can be found. Review with `archi stress show`.

## Step 3 — Update architecture

For each breaking stressor, mutate the spec to address its solution and satisfy the derived requirements. Use `--redefine` to replace a definition:

```
archi node edit <id> --redefine "<new definition>"
archi type edit-node <name> --redefine "<new definition>"
archi req sat <req_id> "<explanation>"
```

When a mutation chose between real options, record the trade-off as a decision so future readers see *why*. Decisions link to the elements/stressors they touch and list the alternatives that lost:

```
archi decision add "<title>" "<rationale>" \
    --links spec:<ref>[,spec:<ref>,stressor:<id>]... \
    --alternatives "<alt_title>" "<rejected_because>"...
archi decision link add <id> <target>[,<target>...]
archi decision alternative add <id> "<alt_title>" "<rejected_because>"
archi decision edit <id> [--title "<...>"] [--body "<...>"]
archi decision remove <id>
```

Run `archi check`. If the regime shifted to CHAOTIC, you've over-coupled — inspect `query hotspots` and decouple. Check `query corridors` for safe refactor zones and their suggested actions (ENCAPSULATE, EXTRACT_MODULE, SIMPLIFY_INTERFACE). Remaining hotspots should be stress-tested first next session.

Save (this **closes the stress session** and auto-prints the incidence report — read it before iterating):

```
archi version save "<note describing what changed>"
```

Then return to Step 2 against the new version. Repeat until no new breaking stressors are found.

## Nesting (ask how deep to go)

Once the architecture stabilizes, consider whether any node deserves its own internal architecture. Candidates: coupling hotspots (`archi query hotspots`), nodes with many requirements, nodes that broke under multiple stressors, nodes described as "complex" or "multi-concern".

```
archi scope enter <node_id>                              # fresh workspace for this node's internals; problem auto-populated
archi scope inherit-reqs                                 # parent requirements that should inform this level
archi scope bubble "<description>"                       # creates a freestanding requirement in the parent scope targeting this node
archi scope show | list | map | leave
```

Verifications for bubbled requirements are authored later on the plan, via `archi plan task verification add`.

Run the full Step 0–3 flow at each level.

## Queries

```
# Spec inspection
archi query nodes --types <t1,t2>                 # nodes + their edges (JSON)
archi query stats                                 # graph statistics
archi query reqs --elements <id1,from->to:type>   # requirements on specific elements
archi query unsatisfied                           # all unsatisfied requirements
archi query subgraph [--layer ...] [--node-types ...] [--edge-types ...]  # filters combinable

# NKP (epistatic; --only-edge-types t1,t2 optional)
archi query regime                                # ORDERED | CRITICAL | CHAOTIC
archi query score                                 # K̄, P̄, regime dashboard
archi query nkp                                   # full landscape JSON: cluster decomposition, adaptive walk stats, full metrics; check `warnings`
archi query hotspots                              # coupling hotspot node IDs
archi query corridors [--tau-p 0.5]               # safe refactoring zones
archi check                                       # NKP + spec health + guidance

# Epistemic health (prefer this over NKP for the epistemic layer)
archi query ontology report | coverage [--via t1,t2] | consistency | provenance | density

# Incidence (stressor×component); auto-fires on version save
archi query incidence [--json] [--no-matrix] [--session <id>] [--since <version>]
                      [--exclude-pending] [--tau-j 0.7] [--tau-d 0.4]
                      [--path-limit N] [--depth D]
archi query incidence-density                     # K_hyper only (3 decimals); rising across iterations usually means stressors are getting broader, not that the architecture is worsening
archi query incidence-findings [--kind K1,K2] [--min-severity info|warn|alert]
archi query incidence-matrix                      # raw S×N JSON

# Decisions (descriptive history; ⊥ NKP/incidence; no `plan verify` gate)
archi decision list [--target <ref>]
archi decision show <id>
archi query decisions [--target <ref>] [--orphan] [--dangling] [--json]

# Trail
archi version list | checkout <id>                # save before checkout
archi stress list | show <id>
archi req list
archi req target-add <req_id> <target>,<target>   # attach target(s) to an existing req
archi req target-remove <req_id> <target>         # detach target(s) from a req
```

**Use `check` at decision points; `regime` for quick sanity after mutations; `hotspots` before stress testing; `corridors` when planning refactors; `incidence-findings --min-severity alert` for triage.** If `regime` says ORDERED with `K̄=0` but you expect coupling, confirm types/edges are `--layer epistatic` and that `--only-edge-types` is not over-restrictive.

## Linking code to spec

When implementation realizes spec elements, follow **`skills/code-link.md`**: use **`archi link`** to record **`CodeRef`** → **`SpecRef`** bindings, run **`archi link verify`** before handoff, and treat **`literal`** vs **`indirect`** + optional **`--role`** per that skill. Normative behavior is defined in **`kb/code-link.md`**.

## Principles

- **Spec is the source of truth.** Query it; don't guess.
- **Target CRITICAL.** K̄ ∈ [1.0, 3.0]. Hotspots are risks; corridors are opportunities.
- **Incidence ⊥ NKP.** Hyperliminal couplings and compound vulnerabilities only show up in incidence.
- **One thing = one meaning.** Split nodes instead of packing metadata into a definition.
- **Don't assume attractors.** Discover them through stressors.
- **No happy-path architecture.** The naïve version is a starting point.
- **Every requirement has provenance** via `--origin`; every iteration is recorded via `stress` + `version save`.
- **Verifications live on the plan.** Each req must get at least one verification on its plan task (`archi plan task verification add`) before the plan can be started.
- **Record decisions when alternatives were weighed.** Decisions document *why*, are scope-local, and reach implementers via plan task briefs — but never gate `plan verify`.
- **Zoom in when a node gets heavy.** Bubble up discoveries that the parent needs.
