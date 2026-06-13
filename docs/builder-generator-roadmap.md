# Make the Build App generator more capable — assessment, roadmap, and a lint+repair slice

> Living roadmap. Pass 1 (the lint + auto-repair slice) is being implemented now.
> Later passes (helper-surface teaching, few-shots, selective injection, drift
> governance) are scoped in Part 2 and can be picked up independently.

## Context

The "Build App" module (`modules/builder/`) generates working app modules from natural
language via the backend AI route (`codehooks/routes/ai.js`). The goal is to make the
generator more capable, with **documentation and AGENTS.md** in scope — "assess what we
have and what it could be" and "increase potential to max."

After reading the actual prompt strings, the build flow, the four `AGENTS.md` files, the
boilerplate, and a survey of real modules, the finding is clear: **the generator is held
back by a knowledge gap, not a runtime limit.** The runtime supports rich capabilities
(live sync, settings panels, emoji pickers, cross-module reads, desktop-icon rename, file
upload, motion) that hand-written modules use to reach ~800 lines — but the generation
prompts teach almost none of it, so generated apps are capped near "counter / simple CRUD."

Chosen path: deliver the assessment + a prioritized roadmap, AND implement the first slice
now — the **lint + auto-repair pass** (the only piece that is deterministically
unit-testable and cannot silently regress currently-working builds).

---

## Part 1 — Assessment: what we have vs. what it could be

### Where the generator's "knowledge" lives
Entirely in **inline prompt-string constants** in `codehooks/routes/ai.js`:
`SYSTEM_PROMPT` (main.js, ~107 lines), `FEATURE_PROMPT`, `ARCHITECT_PROMPT`,
`STYLE_PROMPT`, `CLARIFY_PROMPT`, `PLAN_PROMPT`, `REVISE_SUFFIX`, `CONSOLIDATE_SUFFIX`.
The four `AGENTS.md` files and `modules/boilerplate/` are written for **humans** and are
**never sent to the model**.

### Capability gap (taught vs. supported-but-untaught)
| Capability | Runtime support | Taught to generator? |
|---|---|---|
| `AppModuleBase` + `_load/_render/_getTitle`, `getData/setData`, escaping, rem/dark/accent CSS, star-topology multi-file | yes | ✅ yes |
| **Live cross-client sync** (`manifest.sync:true` + `subscribe`) | yes (`shell/api.js`, module-base) | ❌ no — generated apps are single-client |
| **Settings panel** (`hasSettings` + `os:toggle-settings`) | yes | ❌ no |
| **Emoji/icon picker** (`showEmojiPicker`, `/shell/emoji-picker.js`) | yes, 5 modules use it | ❌ no |
| **Rename desktop icon** (`api.updateInstance(name, icon, extra)`) | yes | ❌ no — never mentioned |
| **Cross-module reads** (`requiredCollections` + `_collectionFor`) | yes (Load reads People) | ❌ no |
| **File upload** (FileReader → base64) + **image `src` post-render** | yes | ❌ no |
| `api.notify`, `motion`/`spring`, `this.api.store` methods | yes | ❌ no |

### Drift problem (concrete, already happening)
Human docs and the generator prompt are **two copies of one contract with no sync
mechanism**. Evidence: a prior task added `updateInstance(name, icon, extra?)` and the
`link` patterns to `modules/AGENTS.md`; `SYSTEM_PROMPT` mentions neither `updateInstance`
nor `sync`/`subscribe` at all. Every future contract change must be made in two places or
the generator silently falls behind.

### Validation gap
`validateBuildResult` (ai.js:351) only checks: manifest present, js/files present, and
generator-has-contextMenu. It does **not** catch the documented gotchas the model can emit,
which then crash or break silently at runtime:
- own `connectedCallback` override → `_render` before `_state` → "this._state is null" (SYSTEM_PROMPT rule 12)
- `_load` that never assigns `this._state` (rule 13)
- `windowId` used as a persistence key (root gotcha #6)
- raw `localStorage` access (isolation rule)
- disallowed imports (npm/CDN/relative outside entry)
- feature file calling `customElements.define` or importing siblings (only a partial relative-import regex exists today at ai.js:460)

---

## Part 2 — Prioritized roadmap (recommended sequence)

1. **(PASS 1 — now) Lint + auto-repair pass** — catch the contract violations above before
   install; one targeted repair re-prompt; reject with a precise message otherwise.
   *Self-contained in ai.js + a pure lib; unit-testable; cannot regress valid builds.*
2. **Teach the helper surface (cheap version)** — add a tight `CAPABILITIES` section to
   `SYSTEM_PROMPT`/`ARCHITECT_PROMPT` with **minimal snippets** (not whole modules) for
   sync, settings panel, emoji picker, `updateInstance` icon rename, `notify`,
   image-`src`-post-render. *Empirically verified only (run sample builds, eyeball);
   watch `ai_stat:truncation`.*
3. **Curated few-shot exemplars** — replace the 2 toy examples (counter, fake game) with
   minimized real-pattern exemplars distilled from list/kanban/notes. Folds into (2).
4. **Measure, then decide on selective injection** — only if (2)/(3) push prompt size into
   truncation: have the architect emit `plan.capabilities: [...]` and inject only the needed
   snippets per build (a small extension of the existing architect→code step, **not** a new
   subsystem). Don't build speculatively — output budget is the binding constraint
   (SYSTEM_PROMPT rule 18, tracked by `ai_stat:truncation`).
5. **Drift governance (not unification)** — keep the capability snippets as constants in the
   codehooks code; have `modules/AGENTS.md` *point to that file* as canonical for the
   generator's knowledge (don't re-prose it); add a DOX rule: "contract change → update both
   the human docs and the generator prompt constants." The backend deploys separately and
   can't read frontend markdown at runtime, so a build-time single-source-of-truth isn't worth
   it; governance is.

---

## Part 3 — Pass 1 implementation: lint + auto-repair

### New file: `codehooks/lib/lint-module.js` (pure ESM, no `codehooks-js` import)
Mirrors the existing pure-lib pattern (`lib/merge.js`). Exports:
```js
export function lintModule(module) // → [{ file, message }]  (empty array = clean)
```
`module` is `{ manifest, js }` (single-file) or `{ manifest, files, entryFile }` (multi-file).
The entry file = the single `js`, or `files[entryFile]`; all other files are features.

**Entry-file rules** (high-precision — valid AppModuleBase modules never trip these):
- `E1` missing `import { AppModuleBase } from '/shell/module-base.js'`
- `E2` missing/mismatched `customElements.define('app-<appId>', …)` for `manifest.appId`
- `E3` overrides `connectedCallback(` (always wrong when extending AppModuleBase → the
  documented "this._state is null" crash)
- `E4` defines `_load(` but the file never assigns `this._state` (`/this\._state\s*=/`)
- `E5` `windowId` used in a persistence key — `/(get|set)Data\s*\([^)]*windowId/`
- `E6` raw `localStorage`/`sessionStorage` access
- `E7` import specifier not starting with `/shell/`, `/modules/`, `./`, or `../`
  (blocks npm/CDN/http imports)

**Feature-file rules:**
- `F1` contains `customElements.define` (only the entry may)
- `F2` any relative import (`from './…'`/`'../…'`) — supersedes the inline check at ai.js:460

Rules are deliberately conservative; the test suite includes **valid-module cases that must
yield zero violations**, guaranteeing clean builds pass untouched (no regression).

### Wire into `buildModule` (`codehooks/routes/ai.js`)
Reorder so lint/repair runs on the generated JS **before** CSS (CSS is generated from final
class names), in both single- and multi-file branches:
1. Generate `main.js` + feature files (unchanged).
2. `const violations = lintModule({ manifest, js|files, entryFile })`.
3. If violations **and** `repairBudget > 0`: for each offending file, one targeted repair
   call (`repairCode` below) sending that file + its violation messages; re-lint the result.
4. If violations remain (or `repairBudget === 0`): `return { ok:false, error: 'Generated code
   violated the module contract: <joined messages>' }` — deterministic, surfaced to the user
   (not auto-retried like timeouts).
5. Generate CSS from the **final** (possibly repaired) code; return `{ ok:true, module }`.

Remove the now-superseded relative-import check at ai.js:460 (F2 covers it).

### `repairCode` + `REPAIR_PROMPT` (new, in ai.js)
```js
async function repairCode({ model, fileName, code, violations, budgetMs }) // → fixed source
```
`REPAIR_PROMPT`: "You wrote a file that violates specific contract rules. Fix ONLY these
violations, change nothing else, output ONLY `{ "js": "<source>" }`." Reuses `runMiniMax`.

### Budget routing (respect inline's tight 65s POST abort)
Add a `repairBudget` param to `buildModule`:
- Worker path (ai.js:510): pass a real budget (e.g. `repairBudget: codeBudget`) → repair enabled.
- Inline path (ai.js:614): pass `repairBudget: 0` → lint **rejects** on violation with the
  precise message but skips the extra LLM call (keeps inline fast).

### Stats (reuse `bumpStat`)
New durable counters so the lint's real effect is measurable with `coho kv:get`:
`ai_stat:lint_caught` (a build had ≥1 violation), `ai_stat:lint_repaired` (repair cleared
them), `ai_stat:lint_failed` (violations survived repair → build rejected).

### Build probe
Bump `AI_BUILD` in ai.js (e.g. `'2026-06-14-lint-v1'`) so `/ai/ping` confirms the deploy.

---

## DOX

- **`codehooks/AGENTS.md`** — document the new lint+repair stage in the build pipeline
  section (rules enforced, repair-once-then-reject, inline=reject-only, new `ai_stat:lint_*`
  counters) and add `lib/lint-module.js` to its file list.
- **`modules/AGENTS.md`** — one line in the "Generated modules" section noting that generated
  code is now contract-linted before install (forward-pointer to `codehooks/routes/ai.js` +
  `lib/lint-module.js`). This is also where roadmap item 5's governance note will later land.
- No new child `AGENTS.md`. Run the root orphan-check at closeout since docs changed.

---

## Verification

**Deterministic (this slice IS unit-testable — the reason it was chosen first):**
- New `codehooks/lib/lint-module.test.js` using `node:assert` (no test framework exists yet;
  establish the plain-node pattern). Cases:
  - each rule `E1–E7`, `F1–F2`: a known-bad module string → asserts the expected violation
  - **valid single-file and multi-file modules → assert `lintModule` returns `[]`** (proves
    clean builds are untouched — the no-regression guarantee)
- Run: `node codehooks/lib/lint-module.test.js` → exits 0, prints pass count.

**Honest scope limits:**
- This slice changes **what gets rejected/repaired**, not prompt wording. A module that
  lints clean flows through unchanged, so it can't silently *alter* a valid build — verified
  on **synthetic, contract-valid** examples only (the test's valid cases). It is **not** yet
  proven that real generator output lints clean; that is the pre-deploy gate below.
- Already-installed apps are replayed via `_loadGeneratedModules` **without** linting, so
  this pass cannot break existing apps — worst case is a *future* build getting rejected
  (and the worker path repairs once before rejecting).
- **Pre-deploy gate:** pull a handful of real entries from the `generated-modules` collection
  (`coho`) and run `lintModule` over each. If a currently-working installed app trips a rule,
  refine that rule before deploying. NOTE: the repo's hand-written modules are **not** a valid
  corpus — `chat`/`notes`/`files` are standalone `HTMLElement` modules that legitimately
  override `connectedCallback` and don't import `AppModuleBase`, so they'd (correctly) trip
  E1/E3. The lint assumes the AppModuleBase pattern, which only generator output guarantees.
- A full end-to-end build runs on MiniMax with 300s budgets against the live Codehooks
  backend; there is **no headless build harness**, so the repair re-prompt's real-world
  behavior is only observable by deploying and watching the `ai_stat:lint_*` counters. The
  roadmap's prompt-quality items (2/3) are likewise **empirically** verifiable only.
- Deploy discipline (root gotcha #9): `coho deploy` ships local code; `git pull` first, then
  confirm via `/ai/ping` returning the bumped `AI_BUILD`.

---

## Progress log
- **Pass 1 — DONE (not yet deployed):** lint + auto-repair.
  - `codehooks/lib/lint-module.js` — pure `lintModule(module)`, rules E0–E7 + F1–F2.
  - `codehooks/lib/lint-module.test.js` — 14 `node:assert` checks (incl. valid-module
    no-regression cases). Run: `node codehooks/lib/lint-module.test.js`.
  - `codehooks/routes/ai.js` — `REPAIR_PROMPT`, `repairCode`, `lintAndRepair`; wired into
    `buildModule` before CSS (worker `repairBudget:60000`, inline `0`=reject-only);
    removed the superseded relative-import check; `AI_BUILD = '2026-06-14-lint-v1'`.
  - DOX: `codehooks/AGENTS.md` (build-pipeline step 3 + `ai_stat:lint_*`), `modules/AGENTS.md`
    (contract-lint note + "update prompt AND lint together" governance seed).
  - **Remaining to ship:** deploy backend (`git pull` → `coho deploy` → `/ai/ping` shows
    `2026-06-14-lint-v1`), then watch `ai_stat:lint_{caught,repaired,failed}` via `coho`.
- **Pass 2 — DONE (not yet deployed):** teach the helper surface (gated) + eval set.
  - **Key finding that reshaped the design:** every `sync:true` module in the repo is a
    **generator**, and auto-sync subscribes on `this._appId` (= the data key only for
    generators) and needs a `_collection()` override. So **auto-sync and `updateInstance`
    icon-rename are generator-only** — not the singleton freebie originally assumed.
    Capabilities are now taught **scoped by instance model**.
  - `codehooks/routes/ai.js` — `SYSTEM_PROMPT`: amended rule 12 (constructor allowed for the
    settings listener; only `connectedCallback` is forbidden — matches lint E3) + a gated
    "Optional capabilities" section (settings panel, `updateInstance`, `showEmojiPicker`,
    `notify`, sync). `ARCHITECT_PROMPT`: `manifest.sync`/`hasSettings` template + guidance.
  - **Consistency verified statically:** a generator using *all* taught patterns lints clean
    against Pass-1 `lintModule` (so we don't teach code our own lint would reject).
  - `docs/builder-eval-set.md` — 8-prompt manual regression set (the only way to verify
    prompt-quality changes; no headless harness).
  - DOX: `codehooks/AGENTS.md` (taught-capabilities bullet, instance-model scoping).
  - **Remaining to ship:** deploy (`git pull` → `coho deploy` → `/ai/ping`); run the eval set
    before/after and log results + `ai_stat` deltas in `docs/builder-eval-set.md`.
- **Decision point after Pass 2 deploys:** only build archetype/selective injection
  (roadmap item 4) if the eval set shows you want the heavier capabilities (cross-module
  reads, file upload) AND prompt size starts driving `ai_stat:truncation` up. Otherwise stop —
  the gated section already covers the high-leverage surface.
- **Pass 3 REFRAMED by eval evidence — from "capability/archetype" to "reliability".**
  The live eval run (logged in `docs/builder-eval-set.md`) showed `success` counts installs,
  not working apps (~1/8 actually worked), the lint caught the wrong layer (1/8), and **every
  multi-file app crashed while the single-file one ran**. So capability/archetype expansion is
  **deferred**; the real bottleneck is generation reliability + plan fidelity.

- **Phase A — DONE (not yet deployed):** reliability / the crash class.
  - `codehooks/lib/lint-module.js` — new rules **D1** (feature calls must pass exactly `this`;
    catches pac-man `host is undefined` + habit `host._state is undefined`) and **D2** (no
    `this._state`/`_wrapper`/`_render()` in the constructor's top-level — callback bodies
    excluded so the settings-listener stays clean). 20 unit checks pass.
  - `codehooks/routes/ai.js` — `ARCHITECT_PROMPT` now **prefers single-file** (split only for
    large apps; if split, call features with `this`); `SYSTEM_PROMPT` forbids re-render on every
    keystroke (tip-calc focus bug); `REPAIR_PROMPT` aligned (constructor allowed; pass `this`).
    `AI_BUILD = 2026-06-14-reliability-a-v1`.
  - Menu emoji dropped from all 10 module `contextMenu` labels + `ARCHITECT_PROMPT` teaches it.
  - DOX: `codehooks/AGENTS.md` (D1/D2, single-file bias, re-render rule, no-emoji), `modules/AGENTS.md`.
  - **Remaining to ship:** deploy → re-run the 8-prompt eval set → log a new row. **Gate Phase B
    on that re-run.**
- **Phase B — PENDING (after Phase A eval re-run):** plan fidelity — generator detection
  (shopping list), scope-split reliability (pac-man), capability-survives-Revise (pomodoro).
- Drift governance (item 5) partially seeded in `modules/AGENTS.md` + `codehooks/AGENTS.md`.
