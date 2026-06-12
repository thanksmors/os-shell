# modules/ — App Modules

## Purpose

Each subdirectory is a self-contained app module: custom HTML element, shadow DOM,
scoped styles. Modules communicate with the shell only through `el.api` and
`shell/api.js`. No module imports from another module (one named exception below).

## Ownership

This file owns: manifest field spec, `el.api` contract, `AppModuleBase` lifecycle,
collection registry, module roster, add-a-module checklist.

When `el.api` shape changes in `shell/store-os.js` or `shell/module-base.js`, update
this file in the same commit. When a new collection is added, add it to the registry
table below.

## Local Contracts

### Module anatomy

Every module: exactly three files.

```
modules/your-id/
├── manifest.json
├── index.js
└── styles.css
```

---

### manifest.json — full field reference

| Field | Type | Default | Description |
|---|---|---|---|
| `appId` | string | required | Unique identifier. Data key, manifest lookup key. |
| `tag` | string | required | Custom element name. Must contain `-`. Must match `customElements.define`. |
| `entry` | string | required | Absolute path to JS module. Lazy-loaded on first launch only. |
| `title` | string | required | Window titlebar label and launcher name. |
| `icon` | string | required | Emoji on desktop icon, taskbar, launcher. |
| `defaultSize` | `{w,h}` | required | Initial window size in pixels. |
| `singleton` | boolean | `false` | Second launch focuses existing window instead of opening another. |
| `generator` | boolean | `false` | Hidden from desktop and launcher. Appears only via `contextMenu`. Each invocation creates a persistent `instanceId`-keyed instance with its own desktop icon. |
| `hasSettings` | boolean | `false` | Shows ⚙️ in OS titlebar. Clicking fires `os:toggle-settings` on the module element. Module must listen for this event. |
| `resizable` | boolean | `false` | Enables drag handle on bottom-right corner. |
| `minSize` | `{w,h}` | `{w:240,h:180}` | Minimum dimensions enforced on resize. |
| `sync` | boolean | `false` | `AppModuleBase` subscribes to cross-device sync when true — SSE-driven (~1–2s), with polling fallback. On a remote change it re-runs `_load()` + `_render()`. |
| `dataCollections` | string[] | `[]` | Collection names owned by this module. `removeInstance()` deletes `os:{name}:{instanceId}` from localStorage for each. **Always declare** — omitting causes stale data accumulation. |
| `acceptsDroppedInstances` | boolean | `false` | Makes this instance a drop container on the desktop. Set on the folder module only. |
| `requiredCollections` | object[] | `[]` | Named collection slots needing user resolution on first launch. Shape: `{ slot, default, hint }`. `AppModuleBase._setupCollections()` shows a dialog. Projects module only. |
| `contextMenu` | object[] | `[]` | Entries in the desktop right-click menu. Shape: `{ label, config }`. Generator modules must have at least one or they are completely unreachable. |

---

### generator vs. singleton vs. plain

| Type | Desktop icon | Launcher | Multiple instances | Created by |
|---|---|---|---|---|
| Plain | Yes (auto) | Yes (auto) | Yes | Launcher or desktop icon click |
| Singleton | Yes (auto) | Yes (auto) | No — second launch focuses existing | Same |
| Generator | No | No | Yes — each `createInstance()` creates a new icon + data slot | Right-click context menu only |

---

### `el.api` contract

The shell sets `el.api` before appending the element to the DOM. Always wait one
tick in `connectedCallback` before reading:

```js
await new Promise(r => setTimeout(r, 0));
```

| Property / Method | Description |
|---|---|
| `windowId` | Ephemeral — `win-{timestamp}`, changes every launch. Use only for `requestClose()`. |
| `instanceId` | Stable — `inst-{timestamp}`, set once at `createInstance()`. **Always use as data key for generators.** |
| `config` | Config object from the `contextMenu` entry that triggered launch. |
| `mode` | `'windowed'` or `'fullscreen'`. |
| `isDark` | Current theme boolean. |
| `setTitle(t)` | Update the window titlebar title. |
| `notify(msg, type)` | Fire a toast. `type`: `'info'` / `'success'` / `'error'`. |
| `requestClose()` | Close this window programmatically. |
| `updateInstance(name, icon)` | Rename desktop icon + persist. Generator modules only. |
| `store` | Read-only `Alpine.store('os')`. See `shell/AGENTS.md` for the full public method list. |

**CRITICAL:** Never use `windowId` as a persistence key.

---

### `AppModuleBase` — lifecycle

**ALL modules — generator AND singleton — must extend `AppModuleBase`.**
Never write your own `constructor` or `connectedCallback`. `AppModuleBase`
guarantees `_load()` (which sets `this._state`) completes before `_render()`
is called. Writing your own `connectedCallback` that calls `_render()` directly
crashes with `TypeError: this._state is null`.

> **Legacy reality (2026-06 audit):** 9 modules predate the base class and extend
> raw `HTMLElement`: `notes`, `emoji`, `files`, `chat`, `settings`, `about`,
> `builder`, `read`, and — despite being generators — `tier` and `folder`. Each
> hand-rolls shadow DOM setup and a theme MutationObserver. They work; do NOT
> refactor them opportunistically. The rule applies to **new** modules and to any
> legacy module receiving a substantial rewrite.

Generator modules extend `AppModuleBase` from `shell/module-base.js`. Ordered steps:

1. Shadow DOM + styles (`modules/{id}/styles.css` + `setup-dialog.css`)
2. `adoptTailwind(shadow, wrapper)` — Tailwind utilities + dark-mode sync
3. Await one tick — `el.api` is now available
4. `_resolveAppId()` — sets `this._appId`
5. `_setupCollections()` — shows setup dialog for unresolved `requiredCollections` slots
6. `await _load()` — subclass implements: fetch state into `this._state`
7. `_applyTheme()` + `_render()` — subclass implements: write DOM from `this._state`
8. `api.setTitle(_getTitle())` — subclass implements
9. `Alpine.effect()` watching `Alpine.store('os').theme` — keeps `.dark` class in sync reactively (replaces the old MutationObserver). `disconnectedCallback` calls `this._themeCleanup()`.
10. `subscribe()` if `manifest.sync === true` — cross-device sync (SSE primary, polling fallback)

**Hooks to override:**

```js
async _load()    // Fetch persisted state into this._state. Called once on mount.
_render()        // Write DOM from this._state into this._wrapper.innerHTML.
_getTitle()      // Return string for OS titlebar. Default: this._state?.name
_collection()    // Collection name for sync polling. Default: appId.
```

**Critical rules:**
- `_load()` MUST always assign `this._state` before returning. Use: `this._state = await getData(col, key) || { ...defaults }`. Singletons with no saved data: `this._state = { ...defaults }`.
- `_render()` may safely assume `this._state` is set. Always null-check `querySelector` results before using them.
- If overriding `disconnectedCallback` (e.g. to clear a `setInterval`), call `super.disconnectedCallback()` first.
- Singletons persist with a **fixed literal key**: `getData('myapp', 'data')` / `setData('myapp', 'data', ...)`. Do NOT use `this._appId` for singleton persistence — it is stable but semantically wrong for a shared single-instance resource.

**Properties available in subclasses:** `this._state`, `this._appId`, `this._wrapper`, `this.api`, `this.shadowRoot`

**Methods:** `this._esc(str)`, `this._applyTheme()`, `this._collectionFor(slot)`

---

### Appearance contract

Module CSS must respond to Settings > Appearance:

1. **Font sizes in `rem`** — Settings scales `html { font-size }`; rem cascades into shadow DOM. Never `px` for text.
2. **Primary action colors use `var(--os-accent, #3b82f6)`** — set on `:root` by Settings; custom properties inherit through shadow boundaries.
3. **No `font-family` declarations** — the family chosen in Settings inherits from `html`.

`.module-root` (shell.css) provides the rem base size. Note: shell CSS arrives in
shadow roots via `adoptedStyleSheets`, which cascade AFTER the module's own
`<style>` tag — to override a `.module-root` property, use a double-class
selector (e.g. `.module-root.settings-root`).

---

### Persistence — collection registry

All reads/writes via `getData(collection, id)` / `setData(collection, id, data)` in
`shell/api.js`. localStorage key format: `os:{collection}:{id}`.

| Collection | Module | Key |
|---|---|---|
| `lists` | list | `instanceId` |
| `boards` | kanban | `instanceId` |
| `gantt` | gantt | `instanceId` |
| `rocks` | rocks | `instanceId` |
| `tierlists` | tier | `instanceId` |
| `grids` | grid | `instanceId` |
| `projects` | projects | `instanceId` |
| `people-charts` | people | `instanceId` |
| `load-plans` | load | `instanceId` |
| `roadmaps` | roadmap | `instanceId` |
| `pm-data` | pm | `instanceId` |
| `notes` | notes | `'data'` (singleton) |
| `chat` | chat | `'data'` — channel list (singleton) |
| `chat-messages` | chat | `channelId` — per-channel messages |
| `chat-read` | chat | `'data'` — per-channel read markers |
| `files-meta` | files | `'data'` — folder/file tree (singleton) |
| `files-data` | files | `fileId` — base64 file blobs |
| `module-settings` | AppModuleBase | `instanceId` (slot resolutions for `requiredCollections`) |
| `meta` | shell | `'instances'` (desktop instance registry) |
| `generated-modules` | builder | `'index'` — `{ [appId]: { manifest, js, css } }` |
| `build-jobs` | builder | `'index'` — `{ [jobId]: { status, plan, messages, module, … } }` |

Collections backing **collaborative** modules (`load-plans`, `roadmaps`, `pm-data`,
`boards`, `gantt`, `chat`, `chat-messages`) are registered in `TOP_ARRAYS` in
`codehooks/lib/merge.js` for concurrent-edit merging. A new collaborative collection
must be added there too — see `codehooks/AGENTS.md`.

When adding a new collection: declare it in `manifest.dataCollections` and add a row here.

---

### Custom events

| Event | Direction | When |
|---|---|---|
| `os:instances-changed` | on `window` | After any create/remove/move/reorder of instances |
| `os:toggle-settings` | on module element | ⚙️ titlebar button clicked. Handle: `this.addEventListener('os:toggle-settings', () => this._toggleSettings())` |

---

### Generated modules (`modules/builder/` — "Build App")

The Build App module generates new app modules via AI and installs them at runtime
without touching the filesystem. Flow: **clarify** (1-3 multiple-choice questions,
one recommended, "🎲 Choose for me" auto-picks) → **plan** (card with title/type/
features, user approves or requests changes) → **build** (queued job, sequential
queue runner). Past jobs live in the `build-jobs` collection and can be **revised**:
another clarify/plan round, then a `revise` build that keeps the same `appId` so
user data survives; the revised code auto-reinstalls.

**Singleton is the default.** The backend (`codehooks/routes/ai.js`) enforces
`plan.type` after generation: anything not explicitly planned as `generator` is
forced to `singleton: true, generator: false` with `contextMenu` removed.
The `plan` prompt only allows `generator` when the user explicitly asked for
multiple named instances.

Backend modes: `POST /w/:ws/ai-generate` takes `{ mode: clarify|plan|build|revise,
messages, plan, existing }` (frontend wrapper: `aiRequest(mode, payload)` in
`shell/api.js`). Same job/poll mechanics for all modes.

**Storage:** Generated module code lives in the `generated-modules` collection under the key `'index'`:
```js
// shape: { [appId]: { manifest, js, css } }
getData('generated-modules', 'index')
```

**Blob URL import rewriting — critical:** Generated JS contains imports like
`import { AppModuleBase } from '/shell/module-base.js'`. Blob URLs have no origin,
so the browser cannot resolve bare absolute paths from them. Before creating a blob,
rewrite all absolute imports to full URLs:

```js
const origin = window.location.origin;
const absoluteJs = js
  .replace(/from '\/shell\//g, `from '${origin}/shell/`)
  .replace(/from "\/shell\//g, `from "${origin}/shell/`)
  .replace(/from '\/modules\//g, `from '${origin}/modules/`)
  .replace(/from "\/modules\//g, `from "${origin}/modules/`);
const blobUrl = URL.createObjectURL(new Blob([absoluteJs], { type: 'application/javascript' }));
```

This must be applied in **two places**: `modules/builder/index.js` (install) and
`shell/store-os.js` (`_loadGeneratedModules`, page-load replay).

**CSS blob URL:** Generated CSS is stored as a string and also turned into a blob
URL, then passed as `cssUrl` on the manifest so `AppModuleBase` loads it:
```js
const cssUrl = css ? URL.createObjectURL(new Blob([css], { type: 'text/css' })) : null;
this.api?.store?.registerApp({ ...manifest, entry: blobUrl, ...(cssUrl && { cssUrl }) });
```
`AppModuleBase` reads `store.apps[moduleId].cssUrl` and fetches it instead of
the default `/modules/{id}/styles.css` path.

**Registration on reload:** `shell/store-os.js._loadGeneratedModules()` runs at
workspace load and re-registers all stored modules from the `generated-modules`
collection. The rewrite + blob URL creation must happen here too.

---

### Cross-module dependency — named exception

`modules/projects/index.js` imports from `modules/data/api.js`. This is the **only**
inter-module import in the codebase. Do not model new modules on this pattern — all
others must be fully isolated, communicating only through `el.api` and `shell/api.js`.

---

### Isolation contract — what counts as a violation (2026-06 audit)

A full audit of all 21 modules established these rules. They separate true
violations from patterns that look wrong but are correct — past audits produced
false positives on the latter.

**Hard rules (violations):**

1. **No direct `localStorage`** — all persistence via `getData`/`setData` in
   `shell/api.js`. *Exception:* `settings/tabs/*` manage shell-global state
   (appearance keys `os:*`, auth session `os-session`/`os-workspace`) — that IS
   their job, not module data.
2. **Never `windowId` in a data key** — not even as a fallback. A fallback chain
   like `instanceId || windowId` silently degrades to per-launch state.
3. **Read the os store via `this.api.store`**, not `window.Alpine.store('os')`.
   *Exception:* the **auth** store is only reachable via `window.Alpine.store('auth')`
   — `el.api.store` exposes the os store only.
4. **Append nodes only inside your shadow root.** `document.createElement()` itself
   is fine — what matters is where the node is appended. (Drag ghosts in load/roadmap
   are appended to the shadow wrapper: correct.)
5. **Escape all user data in `innerHTML`** via `_esc()`/`esc()`.

**Patterns that are CORRECT — do not "fix" these:**

- **In-place mutation of module-local `this._state`** followed immediately by
  `_save()` + `_render()`. The "replace refs, never mutate" contract applies to the
  **Alpine store** (it's a reactive proxy); `this._state` is plain module state and
  modules fully re-render from it. Half the modules (list, kanban, rocks, gantt,
  grid, tier, l10) use `push`/`splice`/property assignment this way — it is fine.
- **Scalar assignment on top-level Alpine store props** (e.g. folder's drag
  handshake: `store.dragInstanceId = null`). Alpine proxies detect property
  assignment; the contract forbids mutating *nested objects/arrays* in place, not
  assigning top-level values.
- **Theme MutationObserver on `document.documentElement`** in legacy raw-HTMLElement
  modules — read-only global access for dark-mode sync. (AppModuleBase subclasses
  get this free via `Alpine.effect`.)
- **`window.addEventListener('os:instances-changed', ...)`** — the documented shell
  event, dispatched on `window` by design.
- **Lazy CDN library loading via `document.head` script injection with a `window._lib`
  cache** (`files/index.js:347`, mammoth/XLSX). UMD libraries cannot load inside a
  shadow root; the window cache prevents double-loading across instances. Sanctioned,
  but keep it to lazy, on-demand loads of large parsers.

**Known deviations (legacy debt — fix when touching the file, don't churn):**

All deviations from the 2026-06 audit were fixed in the same session. The table is
kept here for historical reference.

| File:line | Issue | Fixed |
|---|---|---|
| `tier/index.js:30` | `windowId` fallback in `_appId` chain | ✅ 2026-06 |
| `chat/index.js:40` | Direct `localStorage.getItem('os-user')` for identity | ✅ 2026-06 |
| `data/index.js:63,66`, `load/index.js:155,160` | `window.Alpine.store('os')` where `this.api.store` available | ✅ 2026-06 |
| `tier`, `folder` | Generators on raw `HTMLElement` instead of `AppModuleBase` | ✅ 2026-06 |

**Overriding lifecycle methods:** When a module genuinely needs to attach/detach a
`window` event listener (e.g. `os:instances-changed`), it is acceptable to override
`connectedCallback` and `disconnectedCallback`. Always call the super methods:

```js
async connectedCallback() {
  await super.connectedCallback(); // runs full AppModuleBase lifecycle first
  window.addEventListener('os:instances-changed', this._handler);
}

disconnectedCallback() {
  super.disconnectedCallback(); // cleans up theme effect and unsub
  window.removeEventListener('os:instances-changed', this._handler);
}
```

Do **not** call `_load()` or `_render()` manually in a `connectedCallback` override —
`super.connectedCallback()` already does that.

**Audit hygiene:** verify line-level claims with grep before recording them — the
2026-06 audit's subagents produced several false positives (drag-ghost appends,
`_state` mutation "violations") that died on inspection.

---

## Work Guidance

### Module roster

| Module | Type | Description | Collections |
|---|---|---|---|
| `list` | Generator | Named to-do lists with custom fields. Settings panel. | `lists` |
| `kanban` | Generator | Drag-and-drop board with configurable columns. Settings panel. | `boards` |
| `gantt` | Generator | Project timeline, 12/24/36-month viewport. Settings panel. | `gantt` |
| `rocks` | Generator | OKR board: Functions → Rocks → Milestones with target dates. | `rocks` |
| `tier` | Generator | S–F tier list. Cards support inline text + image upload (base64). | `tierlists` |
| `grid` | Generator | Spreadsheet-style grid. Settings panel. | `grids` |
| `projects` | Generator | Project management board. Links to Data module via `requiredCollections`. | `projects` |
| `people` | Generator | Visual org chart: person cards + SVG connectors, per-person detail modal, multiple roots. | `people-charts` |
| `load` | Generator | Resource timeline: per-person task bars (pointer drag to reassign/move, edge-resize), monthly load % cells, Bars/Load toggles. Reads `people-charts` (roster sync) and `roadmaps` (project link). | `load-plans` |
| `roadmap` | Generator | High-level project roadmap: projects with phase bars on a quarterly timeline, row reorder, bar drag/resize. Feeds Load via project linking. | `roadmaps` |
| `pm` | Generator | Project hub: folder/project sidebar (notes-style) with Brief / Roles / Milestones / Issues / Action Items / Decisions / Links tabs per project. | `pm-data` |
| `folder` | Generator | Container for other instances. `acceptsDroppedInstances: true`. | none |
| `emoji` | Singleton | Browse emojis by category or search, click to copy. CDN-backed. | none |
| `notes` | Singleton | Markdown notes with folders, preview, image/YouTube embeds. | `notes` |
| `chat` | Singleton | Channels + messages, unread badge, SSE-driven sync. | `chat`, `chat-messages`, `chat-read` |
| `files` | Singleton | Drive-style file manager: folders, base64 upload/download, in-app preview (images, PDF, text, MD, HTML, CSV, DOCX/XLSX via lazy CDN libs). | `files-meta`, `files-data` |
| `about` | Singleton | About/info page. | none |
| `settings` | Singleton | Appearance (theme/font/accent), workspace, about. | none |
| `builder` | Singleton | "Build App" — AI module generation: clarify → plan → queued build, revise. | `generated-modules`, `build-jobs` |
| `data` | (internal) | Shared collection management API for projects module. Not in registry. | — |
| `boilerplate` | (template) | Not in `registry.json`. Starting point for new modules. | — |

### Add-a-module checklist

- [ ] Copy `modules/boilerplate/` → `modules/your-id/`
- [ ] Edit `manifest.json` — `appId`, `tag`, `title`, `icon`, `defaultSize`, `minSize`
- [ ] Set `"generator": true` + add `contextMenu` entries if multi-instance
- [ ] Set `"singleton": true` if only one window at a time
- [ ] Set `"hasSettings": true` + listen for `os:toggle-settings` if there's a settings panel
- [ ] Set `"dataCollections": ["your-collection"]` for every localStorage collection written
- [ ] Set `"sync": true` for cross-device auto-sync
- [ ] Edit `index.js` — rename class, update `customElements.define` tag
- [ ] Edit `styles.css`
- [ ] Add `"your-id"` to `/registry.json`
- [ ] Add new collection rows to the registry table in this file

## Verification

- New module: add to `registry.json`, reload browser — launcher/desktop icon appears (plain/singleton) or right-click menu entry appears (generator).
- Generator: create instance, close and reopen — verify data persists using `instanceId`.
- Delete instance: verify localStorage entries from `dataCollections` are cleaned up.

## Child DOX Index

- `modules/boilerplate/README.md` — newcomer walkthrough with annotated code examples (references contracts defined in this file; not a contract document itself)
