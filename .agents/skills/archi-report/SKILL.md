---
name: archi-report
description: Pull a snapshot of the archi spec via CLI and write an engaging narrative report — metrics, hotspots, stress findings, decisions, evolution.
user_invocable: true
---

# Report the archi spec

Generate a self-contained, engaging report from the current archi spec. **Read only via the CLI** — never inspect `.fractal/` files. The tool is `archi`.

## Pull the snapshot

Run in parallel; read the JSON / dashboard output:

```
archi problem show                  # the framing
archi version list                  # evolution trajectory
archi check                         # NKP + spec health + guidance + Decisions line
archi query score                   # K̄, P̄, regime
archi query stats                   # graph statistics
archi query hotspots                # coupling hotspots
archi query corridors               # safe refactor zones + suggested actions
archi query subgraph                # full graph (filter as needed)
archi query unsatisfied             # open requirements
archi query ontology report         # epistemic-layer health
archi query incidence               # stressor × component analysis
archi query incidence-findings      # all severities
archi query decisions --json        # decision set (with alternatives + links)
archi decision list --dangling      # decisions whose targets were deleted
archi stress list                   # all sessions
archi scope map                     # nesting structure
```

Drill in as needed: `archi query reqs --elements <ref>`, `archi decision show <id>`, `archi stress show <id>`, `archi query nodes --types <t>`.

## Write the report

Structure — omit empty sections:

1. **Headline.** One sentence: problem, current version, `Regime  K̄  P̄`.
2. **Architecture at a glance.** Top-level nodes by role (from `scope map` + `query stats`); notable edge types; nesting depth.
3. **Where it bends.** Hotspots cross-referenced with incidence: which stressors land on each. Compound vulnerabilities. Under-stressed components worth probing next.
4. **Where it gives.** Corridors and their suggested actions (ENCAPSULATE, EXTRACT_MODULE, SIMPLIFY_INTERFACE).
5. **Decisions that shaped it.** Most recent and most-linked decisions with their alternatives. Surface `orphan`/`dangling` counts from `check`.
6. **Evolution.** Version notes in order — what each iteration addressed; P̄ trajectory.
7. **Open promises.** Unsatisfied requirements grouped by `--origin`; surviving stressors with no derived reqs.
8. **What to look at next.** Concrete suggestions grounded in the queries (e.g. "decompose `gateway` — `STRESS_HOTSPOT` for s3, s7"). No speculation.

## Style

- **Concrete, not abstract.** Quote node ids, stressor descriptions, finding kinds verbatim.
- **Numbers earn their place.** K̄, P̄, edge counts, finding counts — show them, don't paraphrase.
- **Story arc.** Evolution reads as a sequence of pressures and responses, not a changelog.
- **Trade-offs visible.** Each decision's alternatives go in the report — "X over Y because Z."
- **Markdown for density.** Tables for incidence findings; code fences for command output; bold for finding kinds.
- **Never invent.** If a query returned nothing for a section, drop the section.
