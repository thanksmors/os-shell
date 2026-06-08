# shell/ — OS Shell Core

The runtime kernel. Loaded once at startup; never reloaded. Modules depend on
this directory — this directory does not depend on modules.

---

## Files

### `store-os.js`
The Alpine store: `Alpine.store('os')`. Single source of truth for windows, app
registry, desktop instances, drag state, theme, toasts, and the context menu.

**Init sequence:**
1. `init()` — applies saved theme, starts mobile-breakpoint watcher
2. `_loadManifests()` — fetches `/registry.json`, then each `/modules/{id}/manifest.json`
3. `loadWorkspaceData()` — called by auth store after login; loads persisted instances

**Window lifecycle:**
```
launch() / createInstance()
  → push win object to windows[]
  → Alpine.nextTick()
  → _mount() / _mountInstance()
    → await import(app.entry)      ← lazy load, only on first launch
    → el.api = { ... }             ← attach shell API
    → el.api.store = this          ← read-only store reference
    → shadow.host.appendChild(el)
```

**Instance lifecycle:**
- `createInstance(appId, config)` — generates stable `instanceId`, adds desktop icon, opens window
- `removeInstance(instanceId)` — closes window, removes icon, cleans up localStorage via `manifest.dataCollections`
- `moveToFolder(id, folderId)` / `moveToDesktop(id)` — sets `instance.parentId`

**Public store methods modules may call via `el.api.store`:**
| Method | Description |
|---|---|
| `launch(appId, config)` | Open a non-generator app window |
| `launchInstance(instanceId)` | Open an existing instance window |
| `createInstance(appId, config)` | Create a new generator instance |
| `removeInstance(instanceId)` | Delete an instance permanently |
| `notify(msg, type)` | Show a toast (`'info'`/`'success'`/`'error'`) |
| `showContextMenu(x, y, items)` | Open the context menu at a position |
| `moveToFolder(id, folderId)` | Move an instance into a folder |
| `moveToDesktop(id)` | Move an instance out of a folder |
| `reorderInstance(dragId, targetId)` | Swap two instances in the array |
| `beginInstanceDrag(id)` | Start dragging an instance (sets drag state) |
| `endInstanceDrag()` | Clear drag state after a drag ends |
| `renameInstance(instanceId, name)` | Rename instance + update titlebar |
| `toggleWindowSettings(windowId)` | Fire `os:toggle-settings` on module element |
| `iconUrl(emoji)` | Convert emoji to Twemoji SVG data URL |

**Custom events dispatched on `window`:**
| Event | When |
|---|---|
| `os:instances-changed` | After any create/remove/move/reorder of instances |

**Custom events dispatched on the module element:**
| Event | When |
|---|---|
| `os:toggle-settings` | When the ⚙️ button in the OS titlebar is clicked |

---

### `api.js`
Persistence adapter. All reads/writes go through here — nothing in modules
touches `localStorage` or `fetch` directly.

**Local-first strategy:**
- `setData(collection, id, data)` — writes to localStorage synchronously, then fires a cloud PUT (fire-and-forget)
- `getData(collection, id)` — returns localStorage cache immediately; falls through to cloud only if cache is empty (first load on new device)

All cloud errors are silently caught — the UI never breaks on network failure.

**Auth:** API key is sent as `?apikey=TOKEN` query param, not as a request header.
Using a custom header triggers CORS preflight; Codehooks' native CORS doesn't whitelist it.

**Collection → localStorage key format:**
```
os:{collection}:{id}
```

**All active collections:**
| Collection | Module | Key type |
|---|---|---|
| `lists` | List | `instanceId` |
| `boards` | Kanban | `instanceId` |
| `gantt` | Gantt | `instanceId` |
| `rocks` | Rocks | `instanceId` |
| `tierlists` | Tier List | `instanceId` |
| `grids` | Grid | `instanceId` |
| `projects` | Projects | `instanceId` |
| `module-settings` | AppModuleBase | `instanceId` (collection slot resolutions) |
| `meta` | shell | `'instances'` (desktop instance registry) |
| `os:desktopOrder` | shell | localStorage key (no collection wrapper) |
| `os:emoji-recent` | emoji-picker.js | localStorage key (no collection wrapper) |

**Adding a new collection:** Just call `getData('your-name', id)` / `setData('your-name', id, data)`.
Declare `"dataCollections": ["your-name"]` in the module manifest so `removeInstance()` cleans it up.

**Cross-client sync:** `subscribe(collection, id, callback)` polls every 5 minutes. Modules
declare `"sync": true` in their manifest; `AppModuleBase` subscribes automatically in `connectedCallback`.

---

### `module-base.js`
Base class for generator modules. Extends `HTMLElement`. Handles the full
lifecycle so subclasses only need to implement 3–4 methods.

**Lifecycle (in order):**
1. Shadow DOM + styles set up (CSS from `modules/{id}/styles.css` + `setup-dialog.css`)
2. `await new Promise(r => setTimeout(r, 0))` — wait one tick for `el.api`
3. `_resolveAppId()` — picks `instanceId` → `windowId` → fallback
4. `_setupCollections()` — auto-resolve or show dialog for `requiredCollections`
5. `await _load()` ← **subclass implements**
6. `_applyTheme()` + `_render()` ← **subclass implements**
7. `api.setTitle(_getTitle())` ← **subclass implements**
8. Theme observer — syncs `.dark` class to wrapper
9. Cross-client sync — subscribes if `manifest.sync === true`

**Hooks to override:**
```js
async _load()    // Fetch state into this._state. Called once on mount.
_render()        // Write DOM from this._state. Called after _load() and on data changes.
_getTitle()      // Return string for OS titlebar. Called after _render().
_collection()    // Return collection name for sync polling. Defaults to appId.
```

**Available to subclasses:**
- `this._state` — your module's data object
- `this._appId` — stable key for getData/setData (= `instanceId` for generators)
- `this._wrapper` — the root `div.wrapper` in the shadow DOM
- `this.api` — full shell API (see modules/CONTEXT.md)
- `this._esc(str)` — HTML-escape a string for use in innerHTML
- `this._applyTheme()` — sync `.dark` class to wrapper (called automatically)
- `this._collectionFor(slot)` — resolve a requiredCollections slot name to actual collection name

---

### `config.js`
```js
export const BACKEND_URL = 'https://...';  // Set '' for local-only mode
export const API_KEY = '...';
```
Set `BACKEND_URL = ''` to run fully offline. Backend is completely optional.

---

### `shadow-tailwind.js`
Exports `adoptTailwind(shadowRoot, wrapperEl)`. Called by every module in
`connectedCallback`. Does two things:
1. Fetches `css/utils.css`, `css/shell.css`, `css/auth.css` and adopts them into the shadow root as a single `CSSStyleSheet` (cached after first fetch — shared across all modules)
2. Observes `document.documentElement` and mirrors the `dark` class to `wrapperEl`

This is what makes Tailwind utility classes work inside shadow DOM and what
keeps dark mode in sync with the OS theme toggle.

---

### `emoji-picker.js`
Floating emoji picker popover. Exports `showEmojiPicker(anchorEl, current, onPick)`.
Fetches emoji data from `https://cdn.jsdelivr.net/npm/emoji.json/emoji.json` once
(cached in memory). Falls back to 20 hardcoded emojis if CDN fails.
Recent selections stored in `localStorage` under `os:emoji-recent`.

---

### `css/`

| File | Purpose |
|---|---|
| `utils.css` | Hand-written Tailwind-compatible utility classes (layout, spacing, color, etc.) |
| `shell.css` | OS chrome styles — windows, titlebar, taskbar, launcher, context menu, toasts, desktop icons |
| `auth.css` | Login/workspace selector screen styles |

**No build step.** Utilities are written manually in `utils.css`. The `build/`
directory at the repo root contains a Tailwind config that was never activated —
see `build/README.md`.

---

### `auth.js` / `auth-store.js` / `workspace.js`
Authentication and workspace management. Handles the login screen, Google OAuth,
and workspace selection. After login, `auth-store.js` calls `os.loadWorkspaceData()`
to load the correct instance registry.

---

### `icon.js`
Converts an emoji string to a Twemoji SVG URL (jdecked CDN on jsDelivr).
Strips `fe0f` variation selectors from codepoint sequences.
Used by `store.iconUrl(emoji)`, accessible in modules via `this.api.store.iconUrl()`.

---

### `motion.js`
Thin wrapper around Motion 11. Dynamically imported from CDN on first use.
Falls back gracefully if CDN is unavailable. Respects `prefers-reduced-motion`.

Spring presets: `spring.snappy` (520/30), `spring.smooth` (280/30), `spring.gentle` (120/26).

---

### `shortcuts.js`
Global keyboard shortcuts. Registered via `initShortcuts()`.
- `Ctrl/Cmd + K` — toggle launcher
- `Ctrl/Cmd + W` — close focused window
- `Escape` — hide context menu

---

## What does NOT belong here
- Module business logic → `modules/{id}/index.js`
- Module styles → `modules/{id}/styles.css`
- Backend route handlers → `codehooks/index.js`
