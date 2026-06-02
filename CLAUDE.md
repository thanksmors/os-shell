# Alpine OS Shell — Claude Context

This is a browser-based desktop OS shell: draggable/resizable windows, a taskbar,
a launcher, persistent desktop icons, and pluggable app modules. Everything runs
client-side; the optional Codehooks backend adds cross-device sync.

---

## Stack & Key Choices

### Alpine.js v3 (not React/Vue)
All UI reactivity is Alpine. `Alpine.store('os')` in `shell/store.js` is the single
source of truth for windows, apps, instances, theme, toasts, and context menus.
Plugins loaded: Focus, Anchor, Collapse, Persist, Sort.

**Critical Alpine rule**: always replace object/array refs — never mutate in place.
```js
// ✅ correct — Alpine detects the new ref
this.apps = { ...this.apps, [id]: manifest };
this.instances = [...this.instances, newOne];

// ❌ wrong — Alpine won't react
this.apps[id] = manifest;
this.instances.push(newOne);
```

### Web Components + Shadow DOM for modules
Every module is a custom element (`<app-list>`, `<app-kanban>`, etc.) with an
attached shadow root. This isolates module styles completely from the shell.
Tailwind utility classes are injected via `adoptedStyleSheets` (see
`shell/shadow-tailwind.js`) because the CDN Play CDN can't scan shadow roots.

### Script ordering in index.html matters
The `alpine:init` listener **must be registered before Alpine core loads**. Both
are `defer` + ES module scripts; browsers execute them in document order. The
module script block that calls `initStore()` comes first in `<head>`, Alpine core
comes after. Getting this wrong means the store never initialises and the launcher
is empty.

### x-show + inline display styles conflict
`x-show` toggles `element.style.display`. If you also set `display:flex` inline,
Alpine resets it to `''` on show, reverting the element to `block`. Always use a
CSS class for non-default display values (`os-taskbar-windows`, `os-launcher-grid`).

---

## Module System

### How modules are discovered
`registry.json` lists app IDs in load order. `store._loadManifests()` fetches
`/registry.json`, then fetches `/modules/{id}/manifest.json` for each ID and calls
`registerApp(manifest)`. Modules lazy-import their entry JS only when first launched.

### Manifest shape
```json
{
  "appId": "unique-id",
  "tag": "app-unique-id",
  "entry": "/modules/unique-id/index.js",
  "title": "Display Name",
  "icon": "🧩",
  "defaultSize": { "w": 560, "h": 380 },
  "singleton": false,
  "generator": false,
  "resizable": true,
  "minSize": { "w": 240, "h": 180 },
  "contextMenu": []
}
```

### Generator pattern (List, Kanban, Gantt)
Generator modules (`"generator": true`) are **hidden everywhere** — no desktop icon,
no launcher entry. They only appear via right-click context menu. Each right-click
action calls `createInstance(appId, config)` which:
1. Generates a stable `instanceId` (`inst-<timestamp>`)
2. Persists the instance in the instance registry
3. Adds a desktop icon with the instance's name + icon
4. Opens the window

The module's `el.api.instanceId` is the stable key used for all data persistence.
This means you can have multiple Lists open with different names/data — each keyed
by its own `instanceId`, not by `windowId` (which changes every launch).

Non-generator modules get desktop icons and launcher entries automatically.

### el.api contract
The shell sets `el.api` on the custom element before appending it to the DOM:
```js
el.api = {
  windowId,          // current window ID (changes each launch)
  instanceId,        // stable ID (generators only)
  config,            // launch config from contextMenu entry
  get mode(),        // 'fullscreen' | 'windowed'
  get isDark(),      // current theme
  setTitle(t),       // update titlebar
  notify(msg, type), // fire toast
  requestClose(),    // close this window
  updateInstance(name, icon), // rename desktop icon + save (generators only)
  store,             // Alpine.store('os') — read-only access
}
```

### Module-driven context menu
`buildDesktopContextMenu()` iterates all registered manifests and collects their
`contextMenu` arrays. Generator manifests produce `createInstance()` actions;
non-generator manifests produce `launch()` actions. System items (Change Theme,
About) are appended at the bottom. This means adding a new module with a
`contextMenu` array automatically adds entries to the right-click menu — no shell
changes needed.

### Adding a new module (5 steps)
1. Copy `modules/boilerplate/` to `modules/your-id/`
2. Edit `manifest.json` — set `appId`, `tag`, `title`, `icon`, sizes
3. Edit `index.js` — rename the class, update `customElements.define`
4. Edit `styles.css`
5. Add `"your-id"` to `registry.json`

See `modules/boilerplate/README.md` for full walkthrough.

---

## Persistence Layer

### Dual storage: localStorage + Codehooks
`shell/api.js` is the single persistence adapter. All reads/writes go through it.

**Local-first strategy:**
- `setData` writes localStorage immediately (synchronous, instant)
- Then fires the cloud PUT in the background (async, fire-and-forget)
- `getData` returns the local cache if it exists (fast path)
- Falls through to cloud only on a fresh device (no local cache)

This means the UI never blocks on network and data is never lost if the cloud
is slow or unreachable.

### Codehooks learnings (hard-won)

**The right API endpoint format:**
```
https://test-tp2u.api.codehooks.io/dev   ← correct
https://crunchy-universe-a06e.codehooks.io/dev  ← alias, works for some calls
```

**Authentication:** Pass the token as a query param, NOT a request header:
```
?apikey=your-token
```
Using `x-apikey` as a custom HTTP header triggers CORS preflight. Codehooks'
built-in CORS does not include custom headers in `Access-Control-Allow-Headers`,
so the browser blocks the request silently. The query param avoids preflight entirely.

**Do NOT add a CORS middleware using Express-style methods.** codehooks-js `res`
does not have `.header()` or `.sendStatus()` — calling them throws on every request
and surfaces as "CORS request did not succeed, status null" in the browser.
codehooks-js handles CORS natively.

**res.status() does not chain** in codehooks-js. `res.status(404).json({})` crashes.
Call them separately or just use `res.json({})` with an empty object for "not found".

**getOne throws when no record exists** (does not return null). Always `.catch(() => null)`.

**upsertOne may not exist** in some versions. Use `getOne` → `insertOne`/`updateOne` pattern.

### Instance registry race condition (fixed)
`_loadInstances()` is async and can take 1–3 seconds on cold start. If the user
creates an instance while it's loading, the eventual `this.instances = await getInstances()`
would overwrite the new instance. Fixed by merging loaded instances with any already
in the store instead of blindly overwriting.

### Key names in localStorage
```
os:lists:{instanceId}      — List module data
os:boards:{instanceId}     — Kanban module data
os:gantt:{instanceId}      — Gantt module data
os:meta:instances          — Desktop instance registry
os-theme                   — 'light' | 'dark'
```

---

## Window System

### Window state machine
Each window object has `state`: `'normal'` | `'minimized'` | `'maximized'`.
`prev` stores the pre-maximise geometry for restore. Mobile windows are always
maximised (`window.innerWidth × window.innerHeight - 48px`).

### Window controls
Located upper-right of titlebar, order: minimize → maximize → close (traffic light
order reversed from macOS convention by design decision).

### Drag / resize
Drag is implemented inline in `index.html` via `@mousedown` on the titlebar.
Resize via `@mousedown` on `.os-resize-handle` (bottom-right corner).
Both use `window.addEventListener('mousemove'/'mouseup')` for smooth dragging
outside the window bounds.

---

## CSS Architecture

`shell/tailwind.build.css` is hand-crafted CSS with Tailwind-compatible class names.
There is no build step — all needed classes are written directly. This file is also
injected into every module's shadow root via `adoptedStyleSheets`.

The `build/` folder contains `tailwind.config.js` and `input.css` for if a proper
build pipeline is ever set up, but it is not currently used.

---

## Theme System

Theme is stored in `localStorage` as `'light'` or `'dark'`. On init the store
applies it to `document.documentElement` (`class="dark"`). Tailwind dark-mode
variants (`dark:...`) cascade from there. Shadow DOM modules sync the dark class
via a `MutationObserver` in `shadow-tailwind.js`.

---

## Animations

`shell/motion.js` dynamically imports Motion 11 from CDN. If the CDN fails, all
animations degrade gracefully (final keyframe applied instantly). Respects
`prefers-reduced-motion`. Three spring presets: `snappy` (520/30), `smooth`
(280/30), `gentle` (120/26).

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl/Cmd + K | Toggle launcher |
| Ctrl/Cmd + W | Close focused window |
| Escape | Hide context menu |

---

## Known Gotchas

1. **`x-show` + inline `display:flex`**: use CSS classes, never inline style
2. **Alpine store reactivity**: replace refs, never mutate
3. **Script order**: store init script must precede Alpine core `<script defer>`
4. **codehooks auth**: query param `?apikey=` not request header
5. **codehooks res**: no `.header()`, no `.sendStatus()`, no method chaining on `.status()`
6. **Module data key**: always use `instanceId` (stable), never `windowId` (ephemeral)
7. **Generator modules**: must have a `contextMenu` array or they are completely unreachable
