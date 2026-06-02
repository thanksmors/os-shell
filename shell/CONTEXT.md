# shell/ — OS Shell Core

This folder contains the runtime kernel of the OS shell. It is loaded once at
startup and never reloaded. Modules depend on it; it does not depend on modules.

---

## Files

### `store.js`
The heart of the OS. Exports `initStore()` which registers `Alpine.store('os')`.

All window state, app registry, desktop instances, theme, toasts, and the context
menu live here. Every module and every Alpine expression in `index.html` reads
from or writes to this store.

**Initialisation sequence:**
1. `init()` — applies saved theme, starts mobile watcher
2. `_loadManifests()` — fetches `registry.json`, then each module's `manifest.json`
3. `_loadInstances()` — loads persisted desktop instances from the backend/localStorage

**Window lifecycle:** `launch()` / `createInstance()` → push to `windows` array →
`Alpine.nextTick()` → `_mount()` / `_mountInstance()` → `customElements.define`
lazy-import → set `el.api` → `appendChild`.

**Instance lifecycle:** `createInstance()` → stable `instanceId` → `saveInstances()`
→ desktop icon appears → `_launchInstance()` opens window. `removeInstance()`
closes window + deletes persisted data.

### `api.js`
Persistence adapter. All modules import from here — nothing imports from
localStorage or fetch directly.

**Strategy: local-first, cloud-sync.**
- Writes go to localStorage synchronously first, then to Codehooks async.
- Reads return the local cache immediately if available; fall through to cloud
  only on first load on a new device (no local cache).
- All cloud errors are caught and silently ignored — the UI never breaks on
  network failure.

**Auth:** API key is sent as `?apikey=TOKEN` query param (not a request header)
to avoid CORS preflight on PUT requests. See CLAUDE.md for the full story.

**Collections:**
| Collection | Key format | Used by |
|---|---|---|
| `lists` | `instanceId` | List module |
| `boards` | `instanceId` | Kanban module |
| `gantt` | `instanceId` | Gantt module |
| `meta` | `'instances'` | Desktop instance registry |

### `config.js`
Two exports: `BACKEND_URL` and `API_KEY`. Set `BACKEND_URL = ''` to run fully
offline using only localStorage. Set to your Codehooks space URL to enable
cross-device sync.

```js
export const BACKEND_URL = 'https://test-tp2u.api.codehooks.io/dev';
export const API_KEY = 'ef1c4edb-8fc0-4e94-8bb8-3467b3633043';
```

### `tailwind.build.css`
Hand-written CSS covering all Tailwind utility classes used by the shell HTML,
plus all shell component styles (`.os-window`, `.os-titlebar`, `.os-taskbar`, etc.).

No build step. This file is also injected into every module's shadow root via
`adoptedStyleSheets` so modules can use Tailwind utilities inside shadow DOM
(the CDN Play CDN can't scan shadow roots at all).

If you add new Tailwind classes to `index.html` or module HTML that aren't in
this file, you must add them here manually.

### `shadow-tailwind.js`
Fetches `tailwind.build.css` once (cached as a `CSSStyleSheet`), then for any
shadow root that calls `adoptTailwind(shadow, wrapperEl)`:
- Adopts the stylesheet into the shadow root
- Observes `document.documentElement` class changes and mirrors the `dark` class
  to `wrapperEl` so Tailwind dark-mode variants work inside shadow DOM

Every module calls this in `connectedCallback`.

### `icon.js`
Converts an emoji string to a Twemoji SVG URL (jdecked CDN on jsDelivr).
Strips the `fe0f` variation selector from the codepoint sequence.

Used by the store's `iconUrl()` method, which is accessible to modules via `el.api.store.iconUrl(emoji)`.

### `motion.js`
Thin wrapper around Motion 11 (the successor to Framer Motion for vanilla JS).
Dynamically imported from CDN — if the CDN request fails, `_animate` stays null
and all calls fall back to instant style application. Respects
`prefers-reduced-motion`.

Three spring presets for consistent feel:
- `spring.snappy` — fast interactive feedback (stiffness 520)
- `spring.smooth` — standard transitions (stiffness 280)
- `spring.gentle` — slow/ambient (stiffness 120)

### `shortcuts.js`
Global keyboard shortcut handler. Exports `initShortcuts()`, called after Alpine
initialises. Handles Ctrl/Cmd+K (launcher), Ctrl/Cmd+W (close window), Escape
(hide context menu).

---

## What does NOT belong here

- Module-specific logic (goes in `modules/{id}/index.js`)
- Module styles (goes in `modules/{id}/styles.css`)
- Backend route handlers (goes in `codehooks/index.js`)
- Static assets
