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

### manifest.json

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
  "resizable": true,
  "minSize": { "w": 240, "h": 180 },
  "contextMenu": []
}
```

**`generator: true`** — Hides the module from the desktop and launcher entirely.
It only appears via right-click context menu entries defined in `contextMenu`.
Each context menu action creates a persistent instance with its own `instanceId`
and desktop icon. Use for apps that make sense to have multiple named copies of
(List, Kanban, Gantt).

**`singleton: true`** — Only one window can be open at a time. Focusing an
existing window instead of opening a new one (About, Settings).

**`contextMenu`** — Array of entries that appear in the desktop right-click menu.
Each entry has a `label` and optional `config` object passed to the module as
`el.api.config`. Generator modules must have at least one contextMenu entry or
they are completely unreachable.

### index.js

A standard Web Component class extending `HTMLElement`. Pattern:

```js
import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { getData, setData } from '/shell/api.js';

class AppYourId extends HTMLElement {
  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    // 1. Load styles
    const styleEl = document.createElement('style');
    styleEl.textContent = await fetch('/modules/your-id/styles.css').then(r => r.text());
    // 2. Create wrapper
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    // 3. Inject Tailwind + dark mode into shadow root
    await adoptTailwind(shadow, this._wrapper);
    // 4. Wait one tick — el.api is set by the shell after createElement,
    //    but before appendChild. The tick ensures it's available.
    await new Promise(r => setTimeout(r, 0));
    // 5. Load state using stable instanceId
    this._appId = this.api?.instanceId || this.api?.windowId || ('fallback-' + Date.now());
    this._state = await getData('your-collection', this._appId);
    // 6. Render
    this._render();
  }
}
customElements.define('app-your-id', AppYourId);
```

### styles.css

Scoped to the shadow root. Start with:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:host { display: flex; flex-direction: column; height: 100%; }

.wrapper { display: flex; flex-direction: column; height: 100%; background: #f2f2f7; }
.wrapper.dark { background: #1c1c1e; color: #f5f5f7; }
```

---

## el.api contract

The shell sets `el.api` before mounting:

| Property | Type | Description |
|---|---|---|
| `windowId` | string | Ephemeral window ID — changes every launch. Use only for closing. |
| `instanceId` | string | Stable ID (generator modules only). Use as the data key. |
| `config` | object | Config from the contextMenu entry that launched this instance. |
| `mode` | `'windowed'`\|`'fullscreen'` | Current window state. |
| `isDark` | boolean | Current theme. |
| `setTitle(t)` | fn | Update the titlebar title. |
| `notify(msg, type)` | fn | Fire a toast. `type`: `'info'`\|`'success'`\|`'error'`. |
| `requestClose()` | fn | Close this window programmatically. |
| `updateInstance(name, icon)` | fn | Rename the desktop icon and save. Generator modules only. |
| `store` | object | Read-only access to `Alpine.store('os')`. |

**CRITICAL:** Always use `instanceId` as the data persistence key, never `windowId`.
`windowId` is `win-{timestamp}` and changes every time the window is opened.
Using it means each launch creates a fresh empty state — data appears to vanish.

---

## Persistence inside modules

```js
import { getList, saveList } from '/shell/api.js';
// or for custom collections:
import { getData, setData } from '/shell/api.js';

// Load
this._state = await getList(this._appId);

// Save (call after every mutation)
await saveList(this._appId, this._state);
```

Data is written to localStorage immediately and synced to Codehooks in the
background. The module never needs to know or care which backend is active.

---

## Modules reference

### list — Task List ✅
**Generator.** Creates named to-do lists. Supports custom fields (text/number/date)
configurable in the settings panel. Each list is independent, keyed by `instanceId`.
Data shape: `{ name, items: [{id, text, checked, fieldValues}], fields: [{id, name, type}] }`.

### kanban — Kanban Board 🗂️
**Generator.** Drag-and-drop kanban with customisable column names. Cards belong to
columns; columns are ordered. Data shape:
`{ name, columns: [{id, name}], cards: [{id, colId, text, ...}] }`.

### gantt — Gantt Chart 📊
**Generator.** Project timeline view with quarter/month headers. 12/24/36 month
viewport. Bars are draggable to reorder. Projects have start/end dates and a colour.
Data shape: `{ name, viewMonths, projects: [{id, name, startDate, endDate, color}] }`.

### rocks — Rocks Board 🪨
**Non-generator** (appears on desktop). OKR-style: Functions contain Rocks (cards);
Rocks contain Milestones (checklist items with target dates). Milestone dates are
colour-coded by urgency. Non-generator means one shared board per launch.

### notepad — Notepad 📝
Simple plain-text editor. Non-generator. Persists content via `getData`/`setData`.

### files — Files 📁
File browser / explorer. Non-generator.

### settings — Settings ⚙️
System settings. Singleton — only one instance allowed. Controls theme, etc.

### about — About 🏔️
App info modal. Singleton, non-resizable.

### boilerplate — Template 🧩
**Not in registry.json.** Starting point for new modules. Copy the folder,
rename everything, add your `appId` to `registry.json`. See `boilerplate/README.md`.

---

## Adding a module: checklist

- [ ] Copy `modules/boilerplate/` → `modules/your-id/`
- [ ] Update `manifest.json` — appId, tag, title, icon, sizes, generator flag
- [ ] Update `index.js` — class name, `customElements.define` tag
- [ ] Update styles.css fetch path in `connectedCallback`
- [ ] Add `"your-id"` to `/registry.json`
- [ ] If generator: add at least one `contextMenu` entry in the manifest
- [ ] Use `instanceId` (not `windowId`) as the data key
