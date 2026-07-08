---
name: archi-stress
description: Run a stress-testing session against an archi spec — discover stressors, apply verdicts, derive requirements, close with a version save.
user_invocable: true
---

# Stress an archi spec

The spec must be saved (`archi version save`) and free of unresolved warnings. The tool is `archi`. Ask every choice through the editor's poll tool (`AskUserQuestion`) — never dump a freeform question when the answer is a choice.

## Open the session

```
archi stress start
archi check               # baseline regime/hotspots — stress hotspots first
```

## For each stressor

**a. Identify.** Pick a stakeholder, failure mode, scale concern, regulatory or operational constraint the happy path ignores. Think hyperliminarily: cross a boundary the architecture treats as separate. `--affects` is required and must resolve to epistatic nodes in scope.

```
archi stress stressor <id> "<description>" --affects <node1>,<node2>,...
archi stress affect-add    <stressor_id> <node>,...
archi stress affect-remove <stressor_id> <node>,...   # cannot empty the list
```

**b. Attractor.** Where does the system get pushed under this pressure?

```
archi stress attractor <stressor_id> "<attractor description>"
```

**c. Verdict.**

- *Survives*: `archi stress survive <stressor_id>` — still informs the incidence matrix.
- *Breaks*: describe the solution, then derive one requirement per concrete obligation it implies. Omit `--targets` if the target doesn't exist yet (Step 3 of `arch` introduces it) and wire later with `req target-add`.
  ```
  archi stress breaking <stressor_id> "<solution description>"
  archi req add <req_id> "<desc>" --origin stressor:<session>:<stressor_id> [--targets <ref>]
  archi stress derive-req <stressor_id> <req_id>
  ```

When the verdict involved a real trade-off (accept the risk, pick one solution over another), record it:

```
archi decision add "<title>" "<rationale>" \
    --links stressor:<stressor_id>[,spec:<ref>...] \
    --alternatives "<alt_title>" "<rejected_because>"...
```

## Iterate

Propose stressors from different angles — scale, security, regulation, failure modes, multi-tenancy, operational load, long-term evolution — until the user agrees no new ones surface. Review with `archi stress show <id>` and `archi stress list`.

## Close

```
archi version save "<note describing this iteration>"
```

This closes the session and auto-prints the incidence report. Triage before iterating:

```
archi query incidence-findings --min-severity alert
archi query incidence
```

Finding kinds prescribe the move: `HYPERLIMINAL_COUPLING` (add edge or split shared concern), `STRESS_HOTSPOT` (decompose via `scope enter`), `COMPOUND_VULNERABILITY` (compound breaks an initial req), `MERGE_CANDIDATE` / `EXTRACT_SHARED` (near-identical response), `DENSITY_ALERT` (stress everywhere), `BOUNDARY_CROSSING_STRESSOR` (make a boundary explicit), `UNDER_STRESSED` (target next round).

Hand back to `arch` Step 3 to mutate the spec against breaking stressors, or open the next session against the new version.

## Principles

- **Hyperliminal first.** The valuable stressors cross boundaries the happy path treats as separate.
- **One stressor = one pressure.** Don't bundle multiple concerns.
- **`--affects` targets nodes, not edges.** Epistatic only.
- **Surviving ≠ irrelevant.** The matrix still records the pressure.
- **`version save` closes the session.** Until then the incidence report is incomplete.
