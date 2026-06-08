# modules/ — App Modules

Each subfolder is a self-contained app module. Modules are completely isolated
from each other and communicate with the shell only through `el.api` and the
`shell/api.js` persistence layer.

---

## Module anatomy

Every module has exactly three files:

```
modules/your-id/
├── manifest.json   — registration + metadata
├── index.js        — custom element implementation
└── styles.css      — scoped styles (shadow DOM)
```

---

## manifest.json — full field reference

```json
{
  "appId": "your-id",
  "tag": "app-your-id",
  "entry": "/modules/your-id/index.js",
  "title": "Display Name",
  "icon": "🧩",
  "defaultSize": { "w": 560, "h": 380 },
  "singleton": false,
  "generator": false,
  "hasSettings": false,
  "resizable": true,
  "minSize": { "w": 240, "h": 180 },
  "sync": false,
  "dataCollections": [],
  "acceptsDroppedInstances": false,
  "requiredCollections": [],
  "contextMenu": []
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `appId` | string | required | Unique identifier. Used as data key, manifest lookup key, and CSS namespace. |
| `tag` | string | required | Custom element name. Must contain a hyphen. Must match `customElements.define`. |
| `entry` | string | required | Absolute path to the JS module. Lazy-loaded only on first launch. |
| `title` | string | required | Window titlebar label and launcher entry name. |
| `icon` | string | required | Emoji shown on desktop icon, taskbar, and launcher. |
| `defaultSize` | `{w,h}` | required | Initial window size in pixels. |
| `singleton` | boolean | `false` | If true, launching when a window is already open focuses the existing window instead of opening another. |
| `generator` | boolean | `false` | If true, hides from desktop and launcher. Module only appears via `contextMenu` entries. Each invocation creates a persistent `instanceId`-keyed instance with its own desktop icon. |
| `hasSettings` | boolean | `false` | If true, the OS titlebar shows a ⚙️ button. Clicking it fires `os:toggle-settings` on the module element. The module must listen for this event. |
| `resizable` | boolean | `false` | If true, a drag handle appears on the bottom-right corner of the window. |
| `minSize` | `{w,h}` | `{w:240,h:180}` | Minimum window dimensions enforced during resize. |
| `sync` | boolean | `false` | If true, `AppModuleBase` subscribes to cross-device sync polling for this module's collection. Triggers a `_load()` + `_render()` when remote data changes. |
| `dataCollections` | string[] | `[]` | Collection names owned by this module. `removeInstance()` deletes `os:{name}:{instanceId}` from localStorage for each. Always declare these — they won't be cleaned up otherwise. |
| `acceptsDroppedInstances` | boolean | `false` | If true, desktop drag-and-drop treats this instance as a container. Dropping another icon onto it calls `store.dropOnFolder(instanceId)`. Set on the folder module. |
| `requiredCollections` | object[] | `[]` | (Projects module) Declares named collection slots that the user must resolve on first launch. Each entry: `{ slot, default, hint }`. `AppModuleBase._setupCollections()` shows a setup dialog if the defaults don't exist yet. |
| `contextMenu` | object[] | `[]` | Entries added to the desktop right-click menu. Generator modules must have at least one or they are unreachable. Shape: `{ label, config }`. `config` is passed as `el.api.config`. |

### generator vs. singleton vs. plain

| Type | Desktop icon? | Launcher? | Multiple instances? | Created by |
|---|---|---|---|---|
| Plain (`generator: false, singleton: false`) | Yes (auto) | Yes (auto) | Yes — each launch opens a new independent window | Launcher / desktop icon click |
| Singleton (`singleton: true`) | Yes | Yes | No — second launch focuses existing window | Same |
| Generator (`generator: true`) | No | No | Yes — each `createInstance()` creates a new icon + data slot | Right-click context menu only |

---

## el.api contract

The shell sets `el.api` on the custom element before appending it to the DOM.
Always wait one tick in `connectedCallback` before reading it:

```js
await new Promise(r => setTimeout(r, 0));
```

| Property / Method | Type | Description |
|---|---|---|
| `windowId` | string | Ephemeral — changes every launch. `win-{timestamp}`. Use only for `requestClose()`. |
| `instanceId` | string | Stable — set once at `createInstance()`. `inst-{timestamp}`. **Always use this as the data key.** Generator modules only. |
| `config` | object | Config from the `contextMenu` entry that triggered this launch. |
| `mode` | `'windowed'`\|`'fullscreen'` | Current window state. |
| `isDark` | boolean | Current theme. |
| `setTitle(t)` | fn | Update the titlebar title string. |
| `notify(msg, type)` | fn | Fire a toast. `type`: `'info'`\|`'success'`\|`'error'`. |
| `requestClose()` | fn | Close this window programmatically. |
| `updateInstance(name, icon)` | fn | Rename the desktop icon and persist. Generator modules only. |
| `store` | object | Read-only reference to `Alpine.store('os')`. See store public API in `shell/CONTEXT.md`. |

**CRITICAL:** Never use `windowId` as a persistence key. It changes every launch, so
each open would load a fresh empty state and each save would write to a different key.
Use `instanceId` (generators) or a hardcoded stable key (singletons/plain modules).

---

## AppModuleBase

Generator modules should extend `AppModuleBase` from `shell/module-base.js` instead
of `HTMLElement` directly. It handles the full lifecycle:

```
connectedCallback()
  1. Shadow DOM + styles (modules/{id}/styles.css + setup-dialog.css)
  2. adoptTailwind(shadow, wrapper)           — Tailwind + dark-mode sync
  3. await one tick                           — el.api is now set
  4. _resolveAppId()                          — sets this._appId
  5. _setupCollections()                      — required collections dialog if needed
  6. await _load()                            ← subclass implements
  7. _applyTheme() + _render()                ← subclass implements
  8. api.setTitle(_getTitle())                ← subclass implements
  9. MutationObserver on <html>               — keeps .dark class in sync
 10. subscribe() if manifest.sync === true    — cross-device sync polling
```

### Hooks to override

```js
async _load()    // Load persisted state into this._state. Called once on mount.
_render()        // Write DOM from this._state into this._wrapper.innerHTML.
_getTitle()      // Return string for the OS titlebar. Default: this._state?.name
_collection()    // Return collection name for sync polling. Default: this._manifestId()
```

### Properties available in subclasses

| Property | Description |
|---|---|
| `this._state` | Your data object. Set in `_load()`, read in `_render()`. |
| `this._appId` | Stable data key — `instanceId` for generators, fallback otherwise. |
| `this._wrapper` | Root `div.wrapper` in the shadow DOM. |
| `this.api` | Full shell API (see el.api contract above). |
| `this.shadowRoot` | The shadow root (standard Web Component). |

### Methods available in subclasses

| Method | Description |
|---|---|
| `this._esc(str)` | HTML-escape a string for safe use in `innerHTML`. |
| `this._applyTheme()` | Sync `.dark` class to `this._wrapper`. Called automatically on mount and theme change. |
| `this._collectionFor(slot)` | Resolve a `requiredCollections` slot name to the actual collection name. |

### Minimal generator module using AppModuleBase

```js
import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';

class AppTodo extends AppModuleBase {
  async _load() {
    this._state = await getData('todos', this._appId) || { name: 'Todo', items: [] };
  }

  _render() {
    this._wrapper.innerHTML = `
      <div class="body">
        ${this._state.items.map(i => `<div>${this._esc(i.text)}</div>`).join('')}
      </div>
    `;
  }

  _getTitle() { return this._state.name; }
}

customElements.define('app-todo', AppTodo);
```

---

## Persistence and collections

All reads/writes go through `shell/api.js`. Never touch `localStorage` directly.

```js
import { getData, setData } from '/shell/api.js';

const data = await getData('todos', this._appId);
await setData('todos', this._appId, this._state);
```

**localStorage key format:** `os:{collection}:{id}`

### Active collection registry

| Collection | Module | Key |
|---|---|---|
| `lists` | list | `instanceId` |
| `boards` | kanban | `instanceId` |
| `gantt` | gantt | `instanceId` |
| `rocks` | rocks | `instanceId` |
| `tierlists` | tier | `instanceId` |
| `grids` | grid | `instanceId` |
| `projects` | projects | `instanceId` |
| `module-settings` | AppModuleBase | `instanceId` (slot resolutions for requiredCollections) |
| `meta` | shell | `'instances'` (desktop instance registry) |

> Always declare `"dataCollections": ["your-collection"]` in the manifest so
> `removeInstance()` cleans up data when the user deletes the instance.
> Without this, stale data accumulates in localStorage.

---

## Custom events

| Event | Direction | When |
|---|---|---|
| `os:instances-changed` | `window` | After any create/remove/move/reorder of instances. Folder module listens to re-render. |
| `os:toggle-settings` | module element | Dispatched by `store.toggleWindowSettings()` when ⚙️ is clicked in the OS titlebar. Handle with `this.addEventListener('os:toggle-settings', ...)`. |

---

## Modules reference

### list — Task List ✅
**Generator.** Creates named to-do lists. Supports custom fields (text/number/date)
configurable via the settings panel (⚙️ in titlebar). Each list is independent.
Collections: `lists`. Schema: `{ name, items: [{id, text, checked, fieldValues}], fields: [{id, name, type}] }`.

### kanban — Kanban Board 🗂️
**Generator.** Drag-and-drop kanban with customisable column names. Columns and
cards ordered by array position. Settings panel for column management.
Collections: `boards`. Schema: `{ name, columns: [{id, name}], cards: [{id, colId, text}] }`.

### gantt — Gantt Chart 📊
**Generator.** Project timeline with 12/24/36-month viewport toggle. Bars draggable
to reorder. Settings panel for project management. Collections: `gantt`.
Schema: `{ name, viewMonths, projects: [{id, name, startDate, endDate, color}] }`.

### rocks — Rocks Board 🪨
**Generator.** OKR-style board: Functions contain Rocks; Rocks contain Milestones
with target dates. Collections: `rocks`.

### tier — Tier List 🏆
**Generator.** S–F ranked rows plus an unranked card pool. Cards support inline
text editing and image uploads (base64). Collections: `tierlists`.
Schema: `{ name, tiers: [{id, label, color}], cards: [{id, tierId, text, image}] }`.

### grid — Grid ⊞
**Generator.** Spreadsheet-style grid. Settings panel available.
Collections: `grids`.

### projects — Projects 📋
**Generator.** Project management board. Uses `requiredCollections` to link to
shared Data module collections for team members and project records.
Collections: `projects`. Imports from `modules/data/api.js` (only module with
a cross-module import — treat as a known exception, not a pattern to copy).

### folder — Folder 📁
**Generator.** Container for other instances. `acceptsDroppedInstances: true` in
manifest causes desktop drag-and-drop to route drops to `store.dropOnFolder()`.
Listens to `os:instances-changed` to re-render when children change.
Collections: none (`dataCollections: []`).

### emoji — Emoji Picker 😀
**Singleton.** Browses emojis by category (8 groups) or search. Click copies to
clipboard and fires a success toast. Fetches from CDN with module-level cache.
No persistent data.

### notepad — Notepad 📝
Plain text editor. Non-generator singleton. Persists content to `getData`/`setData`.

### files — Files 📁
File browser. Non-generator.

### settings — Settings ⚙️
System settings (theme, etc.). Singleton.

### about — About 🏔️
App info. Singleton, non-generator.

### data — Data 🗄️
Shared data layer for the Projects module. Not a visible app — provides a collection
management API used by `modules/projects/`. The only inter-module dependency in
the codebase; treat as a known exception.

### boilerplate — Template 🧩
**Not in registry.json.** Starting point for new modules. Copy the folder, rename
everything, add your `appId` to `registry.json`. See `boilerplate/README.md`.

---

## Adding a module: checklist

- [ ] Copy `modules/boilerplate/` → `modules/your-id/`
- [ ] Edit `manifest.json` — `appId`, `tag`, `title`, `icon`, `defaultSize`, `minSize`
- [ ] Set `"generator": true` if this is a multi-instance app (and add `contextMenu`)
- [ ] Set `"singleton": true` if only one window should open at a time
- [ ] Set `"hasSettings": true` + listen for `os:toggle-settings` if there's a settings panel
- [ ] Set `"dataCollections": ["your-collection"]` for every localStorage collection you write
- [ ] Set `"sync": true` if changes should sync across devices automatically
- [ ] Edit `index.js` — rename class, update `customElements.define` tag
- [ ] Edit `styles.css`
- [ ] Add `"your-id"` to `/registry.json`
