---
name: archi-explain
description: Answer "why is X the way it is?" questions about an archi spec by walking decisions, requirements, stressors, and version history via the CLI.
user_invocable: true
---

# Explain an archi spec element

The user asks why something exists, why it's split or merged, why it has a particular shape, or what's happened to it over time. Pull the answer from the spec — never speculate. The tool is `archi`.

## Resolve what the user is asking about

Map the question to one or more `SpecRef`s: `<node_id>`, `<from>-><to>:<edge_type>`, or `scope:<scope_id>`. If ambiguous, disambiguate through the editor's poll tool (`AskUserQuestion`).

## Pull the explanation

Run in parallel:

```
archi decision list --target <ref>          # the *why* — trade-offs that shaped it
archi query reqs --elements <ref>           # the *what must hold* — requirements landing on it
archi query nodes --types <type>            # current node definition (filter to the relevant type)
archi version list                          # evolution timeline
archi stress list                           # sessions, for cross-reference
```

For each decision returned:

```
archi decision show <id>                    # body + alternatives + all links
```

For each requirement returned, follow its provenance:

- `--origin initial` → answered by the problem statement (`archi problem show`).
- `--origin stressor:<session>:<stressor_id>` → walk back to the pressure:
  ```
  archi stress show <stressor_id>           # description, attractor, verdict, derived reqs
  ```

To compare definitions across time, save first, then check out:

```
archi version save "before explain checkout"
archi version checkout <earlier_version>
archi query nodes --types <type>            # snapshot definition
archi version checkout <latest_version>     # always return
```

Prefer reading `version list` notes for evolution; only check out when the user needs a definition diff.

## Answer

Lead with the answer; back it with citations.

- **Quote decision titles and bodies verbatim.** Name the alternatives that lost and why.
- **Cite requirement ids and origins.** `r7 (--origin stressor:s2:overload) requires …`.
- **Show the pressure trail.** When a req came from a stressor, surface the stressor description and verdict.
- **Note absence.** No decision linked = no recorded trade-off. Say so — silence is a real answer ("the spec records no rationale; this has been here since v1 with no derived requirements").
- **Don't invent rationale.** If the spec is silent, the answer is "the spec doesn't say." Offer to record it: `archi decision add ...`.

## Principles

- **Decisions are the primary why.** Read them first; everything else corroborates.
- **Requirements are the what.** Pair the "why" with the constraints the element must meet.
- **Stressors are the pressure trail.** Every derived req points back to one.
- **Versions are the timeline.** `version list` notes answer most evolution questions without a checkout.
- **Silence is information.** No decision means no recorded trade-off — flag it instead of guessing.
