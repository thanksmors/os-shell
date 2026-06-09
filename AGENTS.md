# Alpine OS Shell

Browser-based desktop OS shell: draggable/resizable windows, taskbar, launcher,
persistent desktop icons, and pluggable app modules. Stack: Alpine.js v3, Web
Components + Shadow DOM, plain ES modules, Netlify deployment, optional Codehooks
cloud backend.

## Ownership

Solo project. All changes commit directly to `main`. No feature branches — Netlify
deploys from `main`; branches make changes invisible until merged.

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
- `codehooks/AGENTS.md` — cloud backend: routes, Codehooks API constraints, data shapes, deploy
