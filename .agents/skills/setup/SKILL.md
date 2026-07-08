---
name: setup
description: Install and activate the `archi` CLI (archiplan). Read this only when `archi` is not on PATH; otherwise skip — the main `archi` skill points here only when needed.
user_invocable: false
---

# archi Setup

Three steps: install, activate, initialize. Confirm each step succeeded before moving to the next. Ask every user question through the editor's poll tool (`AskUserQuestion` in Claude Code, the equivalent elsewhere) — never dump a freeform question.

## 1. Install

```
curl -sSf https://archiplan.ai/install.sh | sh
```

Verify with `command -v archi`. If it still doesn't resolve, the installer likely added `archi` to a shell-rc-managed PATH that the current shell hasn't picked up — ask the user to open a new terminal (or source their shell rc) and re-run, then continue here.

## 2. Activate

Activation needs the user's email and an activation code emailed to them. Drive it as two prompts, one round-trip each:

a. Ask the user for the email to register (`AskUserQuestion`, free-text). Do not guess from `git config user.email` or memory — the activation email goes to whatever you submit.

b. Run `archi activate` and supply the email when prompted. If unsure of the exact interface, run `archi activate --help` first; otherwise pipe the answer in (e.g. `printf '%s\n' "$EMAIL" | archi activate`) or use whatever flag `--help` reveals.

c. Tell the user to check their inbox, then ask for the activation code (`AskUserQuestion`, free-text).

d. Submit the code through whatever channel `archi activate` expects (continued prompt, follow-up subcommand, or flag — confirm via `--help` if unclear).

Confirm activation succeeded (`archi` should report an activated/authenticated state, or a follow-up command like `archi whoami` should resolve) before continuing.

## 3. Initialize

Ask the user (`AskUserQuestion`) whether to initialize archi in the **current directory** or in a **different project directory** (free-text path if the latter). `cd` into the chosen directory before running `init`.

Pick the model flag matching the editor you're running in: `claude` for Claude Code, `codex` for Codex, `cursor` for Cursor.

```
archi init --model claude    # or: --model codex | --model cursor
```

Setup is done. Return to the skill that sent you here (typically `archi`) and resume from where it called out to setup.
