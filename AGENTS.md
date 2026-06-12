# Alpine OS Shell

Browser-based desktop OS shell: draggable/resizable windows, taskbar, launcher,
persistent desktop icons, and pluggable app modules. Stack: Alpine.js v3, Web
Components + Shadow DOM, plain ES modules, Netlify deployment, optional Codehooks
cloud backend.

This file is the root contract. `CLAUDE.md` imports it (`@AGENTS.md`) — never
duplicate rules between the two. All `AGENTS.md` files in this repo form the DOX
hierarchy defined below.

## Ownership

Solo project. All changes commit directly to `main`. No feature branches — Netlify
deploys from `main`; branches make changes invisible until merged.

## Precedence

1. Direct user instructions in the current session
2. The nearest `AGENTS.md` for local work details
3. Parent `AGENTS.md` files up to this root for repo-wide rules
4. No child doc may weaken the Behavioral Core or DOX rules below

## Behavioral Core

Applies to all work in all subtrees. Biases toward caution over speed; use judgment
on trivial tasks.

- **Think before coding.** State assumptions explicitly; if uncertain, ask. Present
  competing interpretations instead of picking silently. If a simpler approach
  exists, say so — push back when warranted.
- **Simplicity first.** Minimum code that solves the problem. No unrequested
  features, abstractions, configurability, or error handling for impossible cases.
- **Surgical changes.** Touch only what the request requires; match existing style.
  Don't refactor or "improve" adjacent code. Remove only orphans your own change
  created; mention pre-existing dead code, don't delete it. Exception: inside
  `AGENTS.md` files, stale or contradictory text must be deleted immediately.
- **Goal-driven execution.** Turn tasks into verifiable goals (failing test → make
  it pass). For multi-step work, state a brief plan with a verification per step.

## DOX: Documentation Governance

`AGENTS.md` files are binding contracts for their subtrees.

**Read before editing.** Walk root → each target path, reading every `AGENTS.md` on
the route. Nearest doc is the local contract; re-read the chain in the current
session — don't rely on memory.

**DOX pass after editing.** Before closing any task, update the closest owning
`AGENTS.md` if the change affects purpose, scope, contracts, workflows, constraints,
artifacts, user preferences, or any `AGENTS.md` index. Update parents when structure
or the child index changes; update children when parent changes alter local rules.
Pure code edits that change no contract leave docs unchanged — say so at closeout.

**Child docs.** Create one only when a folder is a durable boundary with its own
rules — never speculatively. Section order: Purpose, Ownership, Local Contracts,
Work Guidance, Verification, Child DOX Index. A child doc and its parent index entry
are one atomic unit — create, move, or delete them in the same change.

**No orphans.** Every `AGENTS.md` except this root must appear in its nearest
ancestor doc's Child DOX Index. Run at closeout whenever any `AGENTS.md` changed:

```bash
for f in $(find . -mindepth 2 -name AGENTS.md -not -path '*/node_modules/*' -not -path '*/.git/*'); do
  d=$(dirname "$f"); d=${d#./}; p=$(dirname "$d")
  while [ ! -f "$p/AGENTS.md" ] && [ "$p" != "." ]; do p=$(dirname "$p"); done
  grep -q "$d" "$p/AGENTS.md" 2>/dev/null || echo "ORPHAN: $f not indexed in $p/AGENTS.md"
done
```

**Closeout.** Re-check changed paths against the DOX chain → update owning docs →
refresh affected indexes → run orphan check if docs changed → run verification →
report docs intentionally left unchanged and why.

## Local Contracts

### Alpine reactivity — critical

Always replace object/array references. Never mutate in place.

```js
// correct — Alpine detects the new ref
this.apps = { ...this.apps, [id]: manifest };
this.instances = [...this.instances, newItem];

// wrong — Alpine will not react
this.apps[id] = manifest;
this.instances.push(newItem);
```

Scope: this applies to the **Alpine store** (`shell/store-os.js`, anything reached
via `el.api.store`). Module-local `this._state` is plain data — in-place mutation
followed by `_save()` + `_render()` is the established module pattern and is fine.
See "Isolation contract" in `modules/AGENTS.md`.

### Script load order in index.html

The `alpine:init` listener and `initStore()` call must appear in `<head>` **before**
the Alpine core `<script defer>` tag. Both are `defer` ES modules; browsers execute
them in document order. Wrong order produces a permanently empty launcher with no
error message.

### `x-show` + display styles

`x-show` toggles `element.style.display`. Never set `display:flex` inline on an
`x-show` element — Alpine resets it to `''` on show, reverting the element to
`block`. Always apply non-default display via a CSS class.

### Module data keys

Generator modules: always use `instanceId` (stable, `inst-{timestamp}`, set once at
`createInstance()`). Never use `windowId` (ephemeral — `win-{timestamp}`, changes
every launch). Wrong key means fresh empty state on every open plus orphaned
localStorage entries.

## Work Guidance

### Stack summary

- `Alpine.store('os')` in `shell/store-os.js` — single source of truth for windows,
  apps, instances, drag state, theme, toasts, context menus.
- Persistence goes through `shell/api.js` only — modules never touch localStorage
  directly. See `shell/AGENTS.md` for the full interface.
- Modules are Web Components with shadow DOM; styles are fully isolated.
- CSS: no build step. Utilities are hand-authored in `shell/css/utils.css`. The
  `build/` directory holds an unactivated Tailwind config — ignore it.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Toggle launcher |
| `Ctrl/Cmd + W` | Close focused window |
| `Escape` | Hide context menu |

### Known gotchas

1. `x-show` + inline `display:flex` — use a CSS class (see Local Contracts)
2. Alpine store reactivity — replace refs, never mutate (see Local Contracts)
3. Script order — `initStore()` must precede Alpine core `<script defer>`
4. Codehooks auth — `?apikey=TOKEN` query param, never a request header (detail: `codehooks/AGENTS.md`)
5. Codehooks `res` — no `.header()`, no `.sendStatus()`, no `.status().json()` chaining (detail: `codehooks/AGENTS.md`)
6. Module data key — always `instanceId`, never `windowId` (see Local Contracts)
7. Generator modules — must have a non-empty `contextMenu` array or they are completely unreachable
8. Codehooks KV — never raw `db.set`/`db.get` for objects; it stores `"[object Object]"` and silently breaks reads. Always use `kvSet`/`kvGet` (detail: `codehooks/AGENTS.md`)
9. Deploy verify — `coho deploy` ships *local* code, not git. `git pull` first, then confirm with a build probe (detail: `codehooks/AGENTS.md`)

## Verification

No build step. Open `index.html` over HTTP (must be served — ES modules don't work
on `file://`):

```bash
python3 -m http.server 8080
```

New module: add `appId` to `registry.json`, reload — launcher and desktop icons
appear automatically.

Backend optional: set `BACKEND_URL = ''` in `shell/config.js` for fully offline
operation.

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant
child AGENTS.md.

## Child DOX Index

- `shell/AGENTS.md` — runtime kernel: store, api, module-base, CSS pipeline, auth, motion, shortcuts
- `modules/AGENTS.md` — module system: manifest spec, el.api, AppModuleBase lifecycle, collection registry, all modules, add-a-module checklist
- `codehooks/AGENTS.md` — cloud backend: routes, Codehooks API constraints (KV serialization, auth, `res`), role authority, concurrent-edit merge, deploy discipline, data shapes
