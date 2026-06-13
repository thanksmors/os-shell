# shell/ — OS Shell Kernel

## Purpose

The runtime kernel. Loaded once at startup; never reloaded. Provides the Alpine
store, persistence adapter, module base class, CSS pipeline, auth, animations, and
keyboard shortcuts. Nothing in this directory imports from `modules/`, with one
exception: `module-base.js` and `store-os.js` import the internal collection API
`modules/data/api.js`.

## Ownership

`shell/` is a read-only dependency for all modules. Changes here affect every
module. If the `el.api` shape changes or `api.js` collection contracts change,
`modules/AGENTS.md` must be updated in the same commit.

## Local Contracts

### `store-os.js` — `Alpine.store('os')`

Single source of truth for windows, app registry, desktop instances, drag state,
theme, toasts, and context menu.

**Init sequence:**
1. `init()` — starts `Alpine.effect` for dark-mode class sync, starts mobile-breakpoint watcher
2. `_loadManifests()` — fetches `/registry.json`, then each `/modules/{id}/manifest.json`
3. `loadWorkspaceData()` — called by auth-store after login; loads persisted instances

**Theme persistence:** `theme` is initialised from `localStorage.getItem('os-theme')`. An `Alpine.effect` in `init()` keeps both `document.documentElement.classList` and `localStorage` in sync reactively — do NOT duplicate the `classList.toggle` or `localStorage.setItem` calls elsewhere (e.g. in `toggleTheme()`).

**Desktop order persistence:** `desktopOrder` is initialised from `localStorage.getItem('os:desktopOrder')`. `reorderDesktop()` writes back to localStorage after updating the reactive property.

**Why not `Alpine.$persist`:** `Alpine.$persist(value)` is only valid as a magic inside Alpine component `x-data` scopes (where `this.$persist` is injected). Calling `Alpine.$persist(...)` in a plain object literal passed to `Alpine.store()` throws `TypeError: Alpine.$persist is not a function` at runtime. Use `localStorage` directly for initial values + `Alpine.effect` for reactive persistence.

**Window mount sequence:**
```
launch() / createInstance()
  → push win object to windows[]
  → Alpine.nextTick()
  → _mount() / _mountInstance()
    → await import(app.entry)      ← lazy, first launch only
    → el.api = { ... }             ← attach shell API
    → win.hostEl = hostEl          ← stored for close animation
    → shadow.host.appendChild(el)
    → Motion scale-in animation on .os-window
```

**Window close:** `close(id)` is `async` — it runs a 150ms Motion scale-out animation on the window element before splicing it from `windows[]`. Any code that closes a window must `await` or ignore the returned promise.

**Instance lifecycle:**
- `createInstance(appId, config)` — generates `instanceId = inst-{timestamp}`, adds desktop icon, opens window
- `removeInstance(instanceId)` — closes window, removes icon, deletes `os:{col}:{instanceId}` from localStorage for each name in `manifest.dataCollections`

**Link shortcuts (`appId === 'link'`) — special-cased in three handlers:**
- `el.api.updateInstance(name, icon, extra?)` merges an optional `extra` object onto the instance. The `link` module uses it to persist `url` directly on the instance object (no data collection), so the URL survives the `meta/instances` JSON round-trip.
- `clickDesktopIcon` opens `inst.url` via `window.open(...)` synchronously when a link instance has a url (an `await` first would lose user-activation and be popup-blocked). A url-less link falls through to `launchInstance` (opens the editor).
- `buildInstanceContextMenu` adds an **Edit** entry (→ `launchInstance`) for link instances; all other instance types get Delete only.

**Public store methods modules may call via `el.api.store`:**

| Method | Description |
|---|---|
| `launch(appId, config)` | Open a non-generator app window |
| `launchInstance(instanceId)` | Open an existing instance window |
| `createInstance(appId, config)` | Create a new generator instance |
| `removeInstance(instanceId)` | Delete an instance permanently |
| `notify(msg, type)` | Toast: `'info'` / `'success'` / `'error'` |
| `showContextMenu(x, y, items)` | Open context menu at a position |
| `moveToFolder(id, folderId)` | Move an instance into a folder |
| `moveToDesktop(id)` | Move an instance out of a folder |
| `reorderInstance(dragId, targetId)` | Swap two instances in the array |
| `beginInstanceDrag(id)` | Start dragging an instance (sets drag state) |
| `endInstanceDrag()` | Clear drag state after drag ends |
| `renameInstance(instanceId, name)` | Rename instance + update titlebar |
| `toggleWindowSettings(windowId)` | Fire `os:toggle-settings` on the module element |
| `iconUrl(emoji)` | Convert emoji to Twemoji SVG data URL |

**Custom events dispatched on `window`:**

| Event | When |
|---|---|
| `os:instances-changed` | After any create/remove/move/reorder of instances |

**Custom events dispatched on the module element:**

| Event | When |
|---|---|
| `os:toggle-settings` | When ⚙️ in the OS titlebar is clicked |

---

### `api.js` — persistence adapter

All reads/writes go through `getData(collection, id)` / `setData(collection, id, data)`.
Nothing in modules touches `localStorage` or `fetch` directly.

**Local-first strategy:**
- `setData` writes localStorage synchronously and returns **instantly**, then queues
  the cloud PUT in a persistent **outbox** (see below). Never `await` it for the
  write to land — the local write is already done.
- `getData` returns the localStorage cache immediately; falls through to cloud only
  if the cache is empty.

All cloud errors are silently caught — UI never breaks on network failure.

**`setData` stamps `_ts`:** every object payload gets `_ts: Date.now()` added before
it is stored and queued. The server-side merge (`codehooks/lib/merge.js`) uses this
timestamp to order concurrent writes from different members. **Do not strip `_ts`**
or filter it out of payloads — losing it breaks concurrent-edit merging.

**Persistent outbox (offline-durable writes):** `setData`/`deleteData` enqueue to an
`os:outbox` localStorage queue, drained in the background:
- Survives page reload — queued writes are replayed on next load.
- Coalesces by `collection:id` (last write wins; a `delete` supersedes a pending `put`).
- Exponential backoff on network failure / 401 / 429 (caps at 60s); resumes on the
  `online` event.
- Each entry snapshots its workspace + session context, so a write queued before
  login is sent with the right auth once available.

**Server-side merge, not last-write-wins:** the backend `PUT` merges the incoming doc
with stored state rather than overwriting, so two members editing at once don't
clobber each other. Details in `codehooks/AGENTS.md` → "Concurrent-edit merge".

**`forceGetData(collection, id)`:** bypasses the localStorage cache and refetches from
the server. Use before appending to a **shared array** so you build on the freshest
state instead of a stale local copy.

**localStorage key format:** workspace-scoped — `os:{workspaceId}:{collection}:{id}`
(falls back to `os:{collection}:{id}` before a workspace is active).

**Special keys (raw localStorage, not data records):**
- `os:outbox` — pending write queue
- `os:desktopOrder` — persisted icon order array
- `os:emoji-recent` — recent emoji selections
- `os-theme` — `'light'` or `'dark'`
- `os:{workspaceId}:sse-listener` — cached SSE listener id

**Auth:** API key sent as `?apikey=TOKEN` query param, not a request header. Custom
headers trigger CORS preflight; Codehooks native CORS doesn't whitelist them — the
browser blocks the request silently. Query param is a CORS "simple request".

**Cross-client sync — SSE primary, polling fallback:** `subscribe(collection, id,
callback)` registers interest; `AppModuleBase` subscribes automatically when
`manifest.sync === true`.
- **SSE (primary):** an `EventSource` on the Codehooks `/sync` realtime channel. A
  member's `PUT` publishes an event; other tabs clear that key's cache and fire the
  subscriber callback in **~1–2s**. The writing tab suppresses its own echo via
  `CLIENT_ID`.
- **Polling (fallback):** the `/w/:ws/changes` feed is polled every 5 minutes in case
  an SSE event is missed. Both paths converge on the same callback.

**Adding a collection:** call `getData`/`setData` with a new name. No registration
needed. Declare `"dataCollections": ["name"]` in the manifest for cleanup. For a
*collaborative* collection, also add it to `TOP_ARRAYS` in `codehooks/lib/merge.js`
(see `codehooks/AGENTS.md`) or concurrent edits fall back to overwrite.

**Active collection registry lives in `modules/AGENTS.md`.**

---

### `module-base.js` — `AppModuleBase`

Base class for **all** modules (generator and singleton). Extends `HTMLElement`.
Handles the full lifecycle so subclasses only implement 3–4 methods.

**Lifecycle (in order):**
1. `setupShell(this, { cssUrl, extraCssUrls: ['/shell/setup-dialog.css'] })` (`shell-setup.js`) — shadow DOM + styles + `adoptTailwind` + one-tick wait for `el.api`
2. `_resolveAppId()` — `instanceId` → `windowId` → `{id}-{timestamp}` fallback
3. `_setupCollections()` — show setup dialog for unresolved `requiredCollections` slots
4. `await _load()` — **subclass implements**
5. `_applyTheme()` + `_render()` — **subclass implements**
6. `api.setTitle(_getTitle())` — **subclass implements**
7. `Alpine.effect()` watching `Alpine.store('os').theme` — keeps `.dark` class in sync reactively (replaces MutationObserver)
8. `subscribe()` if `manifest.sync === true` — cross-device polling

**Dark-mode sync:** Uses `Alpine.effect()` instead of a MutationObserver. The effect subscribes to `Alpine.store('os').theme` so updates are driven by Alpine's reactive graph, not DOM polling. `disconnectedCallback` calls `this._themeCleanup()` to stop the effect.

**Hooks to override:**

```js
async _load()    // Load persisted state into this._state. Called once on mount.
_render()        // Write DOM from this._state into this._wrapper. Called after _load() and on data changes.
_getTitle()      // Return string for OS titlebar. Default: this._state?.name
_collection()    // Collection name for sync polling. Default: this._manifestId()
```

**Available to subclasses:**

| | Description |
|---|---|
| `this._state` | Your data object. Set in `_load()`, read in `_render()`. |
| `this._appId` | Stable key for `getData`/`setData` — `instanceId` for generators. |
| `this._wrapper` | Root `div.wrapper` in shadow DOM. Write `innerHTML` here. |
| `this.api` | Full shell API — see `modules/AGENTS.md` for the el.api contract. |
| `this._esc(str)` | HTML-escape a string for safe use in `innerHTML`. |
| `this._applyTheme()` | Sync `.dark` class to `_wrapper`. Called automatically. |
| `this._collectionFor(slot)` | Resolve a `requiredCollections` slot name to the actual collection name. |

**CSS loading for generated modules:** `AppModuleBase` fetches styles from
`/modules/{moduleId}/styles.css` by default. Generated modules have no filesystem
path — pass `cssUrl` (a CSS blob URL) on the manifest and `AppModuleBase` reads it:
```js
// In connectedCallback, before fetching:
const cssUrl = window.Alpine?.store('os')?.apps?.[moduleId]?.cssUrl
  || `/modules/${moduleId}/styles.css`;
```
See `modules/AGENTS.md` → "Generated modules" for how to create the CSS blob URL.

**Runtime tag suffix:** `_moduleId()` strips a trailing `--v{n}` from the tag name
(`app-{id}--v3` → `id`). The builder registers each revision under a unique
`app-{id}--v{n}` tag so a custom element can't get stuck on a stale definition
(tags are immutable per session). `_moduleId` recovers the stable appId for
manifest/cssUrl/appId resolution. Stored code keeps the canonical `app-{id}` tag;
only the runtime blob is suffixed.

---

### `shell-setup.js` — shared component scaffolding (composition)

Small composable helpers, used by `AppModuleBase` **and** the standalone
`HTMLElement` components (`builder`, `chat`, `files`, `notes`) so the shadow-DOM
boilerplate lives in one place — composition, not a deeper class hierarchy.

- `setupShell(host, { cssUrl, extraCssUrls = [] })` → `attachShadow`, build
  `<style>` from `fetchCssCached(cssUrl)` + extras, create `div.wrapper`,
  `adoptTailwind`, then the one-tick wait for `el.api`. Returns `{ shadow, wrapper }`.
- `observeTheme(applyFn) → cleanupFn` → `MutationObserver` on `<html class>` for
  dark-mode flips; store the returned cleanup and call it in `disconnectedCallback`.
- `fetchCssCached(url)` → session-level CSS text cache (moved here from
  `module-base.js`; `store-os._prefetchModules` imports it from here).
- `assembleModuleBlobs({ files, entryFile, fromTag, toTag })` / `moduleFiles(mod)`
  → build runtime blob URLs for generated apps (single- or multi-file), rewriting
  absolute + relative imports and optionally swapping the custom-element tag. Used
  by `store-os._loadGeneratedModules` and `builder._registerModule`. See
  `modules/AGENTS.md` → "Blob assembly".

**Why not collapse the standalone components into `AppModuleBase`?** Their
lifecycles differ (tabs/queues/SSE/no persisted state) and re-parenting them would
*add* inheritance. Sharing the scaffolding via a helper is the maxim-correct fix.
`AppModuleBase` keeps its own `Alpine.effect` theme sync; the standalones use
`observeTheme`.

---

### `shadow-tailwind.js`

`adoptTailwind(shadowRoot, wrapperEl)`:
1. Fetches `css/utils.css` + `css/shell.css` + `css/auth.css` and merges into one
   `CSSStyleSheet` adopted into the shadow root (shared/cached across all modules).
2. Observes `document.documentElement` and mirrors the `.dark` class to `wrapperEl`.

Called by every module in `connectedCallback`. This is what makes Tailwind utilities
work inside shadow DOM and keeps dark mode in sync with the OS toggle.

---

### `css/` pipeline

No build step. All files are hand-authored.

| File | Purpose |
|---|---|
| `utils.css` | Tailwind-compatible utility classes (layout, spacing, color, etc.) — written manually |
| `shell.css` | OS chrome styles: windows, titlebar, taskbar, launcher, context menu, toasts, desktop icons |
| `auth.css` | Login screen and workspace selector styles |

Adding a new utility: write it directly in `utils.css`. The `build/` directory at
repo root holds a Tailwind config that is **never used** — do not activate it unless
committing to a full build pipeline change (see repo root `build/`).

---

### `config.js`

```js
export const BACKEND_URL = 'https://...';  // Set '' for local-only mode
export const API_KEY = '...';
```

`BACKEND_URL = ''` → fully offline, localStorage-only mode.

---

### `motion.js`

Thin wrapper around Motion 11. Imported by `store-os.js` so the CDN fetch fires at
boot. Falls back gracefully if CDN is unavailable (final keyframe applied instantly).
Respects `prefers-reduced-motion`.

**Exports:**
- `motion(el, keyframes, options)` — thin wrapper around `animate()`. Returns `{ finished: Promise }`.
- `spring` — preset factory object. Call `spring.snappy()`, `spring.smooth()`, `spring.gentle()` as the `easing` option. They return Motion v11 spring easing functions. **Do not use as plain objects** — the old `{ type: 'spring', stiffness, damping }` shape is Framer Motion React syntax and is silently ignored by vanilla Motion v11.
- `inView`, `hover`, `press` — re-exported from the CDN bundle. May be `null` before the async import resolves.

Spring presets: `snappy` (stiffness 520 / damping 30), `smooth` (280/30), `gentle` (120/26).

---

### `auth.js` / `auth-store.js` / `workspace.js`

Login screen, Google OAuth, and workspace selection. After login, `auth-store.js`
calls `os.loadWorkspaceData()` to load the correct instance registry.

**OAuth return URL must keep the query string.** `startGoogleLogin()` builds the
`return=` URL from `origin + pathname + search`. Do not "simplify" away `search`:
`?invite=<id>` has to survive the Google round trip or invite links silently do
nothing for users who aren't signed in yet (which is every invited user). As a
second layer, `store-auth.js` stashes the invite id in localStorage
(`os-pending-invite`) before login and consumes it after.

---

### `icon.js`

`iconUrl(emoji)` — converts emoji to Twemoji SVG URL (jdecked CDN on jsDelivr).
Strips `fe0f` variation selectors. Accessible in modules via `this.api.store.iconUrl()`.

---

### `shortcuts.js`

Global keyboard shortcuts. Registered via `initShortcuts()`:
- `Ctrl/Cmd + K` — toggle launcher
- `Ctrl/Cmd + W` — close focused window
- `Escape` — hide context menu

## Verification

No unit tests. Verify via browser:
- After editing `store-os.js`: open/close/minimize/maximize windows; create and delete instances.
- After editing `api.js`: confirm `getData`/`setData` round-trip in browser console.
- After editing `shadow-tailwind.js`: open a module window, toggle dark mode, confirm styles update.

## Child DOX Index

None. `shell/` has no subdirectories with contracts.
