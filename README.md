# dsh-workorder-plugin

[English](README.md) | [中文](README.zh-CN.md)

> Write the work order with an expensive model, hand the labor to a cheap one.

A DeepSeek Harness plugin that splits a coding task in two. A strong model writes a **work order** — goal, files, constraints, acceptance commands, out-of-scope — and a cheap model executes it with a full agent loop. Nothing is accepted on the model's word: the acceptance commands decide, and the diff is reviewed afterwards.

## Why

Every step of an agent loop resends the whole history, so cost grows with the square of the step count. The saving is not "swap in a cheaper model" — it is **keeping the expensive model out of the loop**:

```
planner  (expensive, one call)     → work order
executor (cheap, N iterations)     → sees the work order only
acceptance (command line)          → real exit code + git diff
```

The executor never sees what the planner thought, or what you said. That isolation is exactly where the money is saved; the price is that the work order must be self-contained.

## Install

```powershell
dsh plugin --profile desktop add dsh-workorder-plugin
```

Or copy this repository into `~/.dsh/profiles/desktop/node_modules/dsh-workorder-plugin` and add both a dependency and a bundle entry to the profile's `package.json` (see the shape in `cordis.patch.yml`).

Restart DSH afterwards.

## Configure

Two steps.

**1. Generate the model list.** The dropdowns are built from your profile's provider config, so they start empty:

```powershell
node_modules\dsh-workorder-plugin\tools\sync-catalog.ps1
```

It reads `~/.dsh/profiles/desktop/cordis.patch.yml` — the same file the Models settings page writes to. Re-run it whenever you add or remove models, then restart.

**2. Pick the models.** Settings → Plugins → **Work orders**:

| Field | What it is |
|---|---|
| planner provider / model | Writes the work order. Called once per task, so it can be the expensive one. |
| executor provider / model | Does the work. Pick a large quota and a low unit price. |

The two roles may come from different providers.

## Usage

Just talk to the agent. The plugin injects an always-on gate into the system prompt:

- Executable acceptance command present → write the work order first, then execute
- "One file **and** fewer than 20 changed lines", or the user says "just do it" → do it directly
- Creating a file of 50 lines or more → delegation is mandatory

Every response starts with either `Work order: …` or `Not delegated: …`, so you can push back immediately.

## Turning it off

Disable the plugin (or drop it from the profile's bundles). The gate, the skill and the settings page disappear together and the agent returns to its native behaviour.

## Limitations

- **The dropdown list is static.** Model config changes require re-running `sync-catalog.ps1` and restarting — the browser half has no stable catalog API to rely on.
- **Work order quality decides everything.** If the planner writes a bad card, the executor will follow it very diligently. `out_of_scope` is not decoration.
- **`report.tests_passed` is a claim, not evidence.** Verify by running the commands, reading the diff, and confirming `tests/` is untouched.
- **Vision is declared, not detected.** Models whose provider config has no `image` input never show the 👁 marker, even if they can actually read images.

## License

MIT
