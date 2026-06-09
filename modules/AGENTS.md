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
| `sync` | boolean | `false` | `AppModuleBase` subscribes to cross-device sync polling when true. |
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

Generator modules extend `AppModuleBase` from `shell/module-base.js`. Ordered steps:

1. Shadow DOM + styles (`modules/{id}/styles.css` + `setup-dialog.css`)
2. `adoptTailwind(shadow, wrapper)` — Tailwind utilities + dark-mode sync
3. Await one tick — `el.api` is now available
4. `_resolveAppId()` — sets `this._appId`
5. `_setupCollections()` — shows setup dialog for unresolved `requiredCollections` slots
6. `await _load()` — subclass implements: fetch state into `this._state`
7. `_applyTheme()` + `_render()` — subclass implements: write DOM from `this._state`
8. `api.setTitle(_getTitle())` — subclass implements
9. `MutationObserver` on `<html>` — keeps `.dark` class in sync
10. `subscribe()` if `manifest.sync === true` — cross-device polling

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
| `module-settings` | AppModuleBase | `instanceId` (slot resolutions for `requiredCollections`) |
| `meta` | shell | `'instances'` (desktop instance registry) |

When adding a new collection: declare it in `manifest.dataCollections` and add a row here.

---

### Custom events

| Event | Direction | When |
|---|---|---|
| `os:instances-changed` | on `window` | After any create/remove/move/reorder of instances |
| `os:toggle-settings` | on module element | ⚙️ titlebar button clicked. Handle: `this.addEventListener('os:toggle-settings', () => this._toggleSettings())` |

---

### Generated modules (`modules/builder/`)

The builder module lets users generate new app modules via AI and install them at runtime without touching the filesystem.

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
| `folder` | Generator | Container for other instances. `acceptsDroppedInstances: true`. | none |
| `emoji` | Singleton | Browse emojis by category or search, click to copy. CDN-backed. | none |
| `notepad` | Singleton | Plain text editor. | `notepad` |
| `files` | Plain | File browser. | none |
| `settings` | Singleton | Theme and system settings. | none |
| `about` | Singleton | App info. | none |
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
