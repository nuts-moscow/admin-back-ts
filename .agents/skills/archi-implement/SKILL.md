---
name: archi-implement
description: Drive the implementation of a started archi plan — wave by wave, sub-agents in parallel, until `archi plan next` says `DONE`.
user_invocable: true
---

# Implement an archi Plan

You are driving the implementation cycle of a plan authored via `/archi-plan`. The plan is the source of truth — briefs come from `archi plan task show`. The tool is `archi`. You stop when `archi plan next` prints `DONE`.

Ask every question to the user through the editor's poll tool (`AskUserQuestion` in Claude Code, the equivalent elsewhere) — never dump a freeform question when the answer is a choice.

## Step 1 — Pick the plan

```
archi plan list
```

If the list is empty, stop and send the user to `/archi-plan` — there is nothing to implement.

If a current plan is set, ask through the poll tool: **implement `<current_name>`**, **switch to a different plan**, **abort**. On "switch", or if there is no current plan, present the list through the poll tool. Selecting a plan runs:

```
archi plan use <name>
```

## Step 2 — Synchronize lifecycle state

```
archi plan status
```

Branch on the printed `status:`:

- `opened` → continue to Step 3.
- `in_progress` → already started; **skip Step 3** and jump to Step 4.
- `completed` or `closed` → ask through the poll tool: **reset and re-run**, **pick another plan**, **abort**. On reset, run `archi plan reset` and continue to Step 3.

## Step 3 — Verify and start

```
archi plan verify
archi plan start
```

If `verify` reports any `Broken`, surface the CLI output verbatim and send the user to `/archi-plan`. If `start` errors, surface the message verbatim — typical destinations: `/archi-plan` for unverified requirements, `/arch` for spec-readiness, Step 2 for closed/completed.

## Step 4 — Run waves

```
archi plan current-wave
archi plan task show <task_id>
```

For each task in the wave, read the brief verbatim. Single-task wave → implement yourself. Multi-task wave → dispatch one sub-agent per task in a single message so they run in parallel (see "Sub-agents" below).

Per-task contract (you or a sub-agent):

a. **TDD.** Write failing tests derived from the brief's `Acceptance criteria` and matched-requirement verifications. Confirm red.
b. **context7.** If `mcp__context7__*` tools are exposed, query them for current docs of every library/framework the brief lists in `stack_details`. Otherwise rely on what you know.
c. Implement until tests are green.
d. **Code-links.** For every `spec_ref` in the brief, run `archi link add` per `skills/code-link.md`.
e. `archi link verify --since HEAD` — must exit `0`.

Once every task in the wave is done:

```
archi plan next
```

- prints next wave ids → loop with the new wave.
- prints `# scenarios — end-to-end user-story coverage` → go to Step 5.
- prints `DONE` → stop.

## Step 5 — Scenarios step

`plan next` printed a task-shaped brief. Follow it: write one end-to-end test per scenario and iterate until every scenario is green, then:

```
archi plan next
```

It prints `DONE`.

## Sub-agents

For a multi-task wave, dispatch one Agent call per task, **all in a single message**, with `subagent_type: general-purpose`. Each prompt must be self-contained — sub-agents do not inherit conversation context. Include the working directory, the task id, instruction to start with `archi plan task show <id>`, and the per-task contract (TDD, context7 if available, `archi link add` per spec_ref, `archi link verify --since HEAD` clean). Wait for every sub-agent before you call `archi plan next`.

If a sub-agent will need a tool or permission the model has not yet been granted, ask the user through the poll tool **before** dispatching — sub-agents cannot prompt for permission on their own.

## Principles

- **Plan is the source of truth.** Read briefs through `archi plan task show`; do not improvise from memory.
- **TDD always.** Failing tests first; the brief's verifications are the contract.
- **Code-links seal each task.** A wave does not advance until every active task's `spec_refs` are covered at the Working version.
- **Parallel by default for multi-task waves.** One sub-agent per task, single message, wait for all returns.
- **Stop on plan errors.** Surface the CLI message verbatim and route the user back to `/archi-plan` or `/arch` as the message dictates.
- **CLI is the only author.** Reads through `archi plan …`, `archi plan task …`, `archi plan next`. Never hand-edit `plan.json`.
