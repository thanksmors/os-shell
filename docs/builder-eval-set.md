# Build App — generation eval set

A fixed set of build prompts used to **manually** regression-check changes to the
generator prompts in `codehooks/routes/ai.js`. Prompt-quality changes are not
unit-testable (builds run on live MiniMax, no headless harness), so this is the
repeatable empirical check: run the same prompts before and after a change, eyeball
the output, and diff the durable counters.

## How to run a pass
1. Note the baseline counters: `coho kv:get ai_stat:success ai_stat:truncation
   ai_stat:invalid_json ai_stat:lint_caught ai_stat:lint_repaired ai_stat:lint_failed`.
2. In the Build App, run each prompt below to a finished install (answer clarify
   questions with the recommended option unless the prompt says otherwise).
3. For each: record install success/fail, whether the **core** feature works, and
   any obvious breakage. Open the code panel and skim for contract slips.
4. Re-read the counters; compute deltas. Truncation going **up** after a prompt
   change is a regression signal even if individual builds look fine.

## What each prompt is probing
| # | Prompt | Instance model | Probes |
|---|---|---|---|
| 1 | "a tip calculator" | singleton | smallest single-file shape; must stay tiny, no over-build |
| 2 | "a personal habit tracker with a daily checklist" | singleton | single-file CRUD + persistence; settings panel optional |
| 3 | "a shared shopping list my family can all edit" | generator | **sync** (collaborative) + multi-instance + rename |
| 4 | "a kanban board, one per project" | generator | multi-file split + drag + `sync` + settings/rename |
| 5 | "a markdown scratchpad" | singleton | larger single-file (text editing) near the truncation edge |
| 6 | "a Pac-Man game" | singleton | scope-split discipline — core must be the minimal playable slice, rest deferred |
| 7 | "a pomodoro timer with a settings panel for work/break lengths" | singleton | **settings panel** (`hasSettings` + `os:toggle-settings`) on a singleton |
| 8 | "a contact list where each contact has a name, phone, and emoji avatar" | generator | **emoji picker** + per-item fields + rename |

## Regression bar
- A change is safe to ship if: prompts 1–2 stay simple (no spurious sync/settings
  code), 3–4 still install and sync, 6 still defers (doesn't try to build all of
  Pac-Man), and `ai_stat:truncation` does not rise across the set.
- New capability work (Pass 2+) should show its capability appearing in the prompts
  that ask for it (3,4,7,8) and **absent** from the ones that don't (1,2,5,6).

## Log
> Append a dated row per pass: change shipped, per-prompt result, counter deltas.

| Date | Change | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | trunc Δ | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| _baseline_ | (pre-Pass-2) | | | | | | | | | | not yet run |
