# Module Boilerplate

Copy this folder to create a new Alpine OS Shell module.

---

## 5-step quickstart

1. **Copy** `modules/boilerplate/` → `modules/your-id/`
2. **Edit `manifest.json`** — set `appId`, `tag`, `title`, `icon`, `defaultSize`, `minSize`
3. **Edit `index.js`** — rename the class and `customElements.define` tag
4. **Edit `styles.css`** — styles are shadow-DOM scoped and won't leak
5. **Add `"your-id"` to `/registry.json`** — the shell auto-discovers it on next reload

---

## Module types

Choose the type that fits before you start:

| Type | generator | singleton | What it does |
|---|---|---|---|
| **Plain** | `false` | `false` | Desktop icon + launcher entry. Multiple windows can be open simultaneously. |
| **Singleton** | `false` | `true` | Desktop icon + launcher entry. Second launch focuses the existing window. |
| **Generator** | `true` | — | No icon, not in launcher. Creates named instances via right-click menu. Multiple independent instances with separate data. |

**Use generator** when it makes sense to have several named copies — e.g., "Work List",
"Personal List". Each instance gets its own desktop icon and its own persisted data.

**Use plain or singleton** for tools with one shared state — e.g., Notepad, Settings.

---

## Generator module step-by-step

For generator modules, each instance is created via a right-click context menu entry.

### 1. manifest.json

```json
{
  "appId": "todo",
  "tag": "app-todo",
  "entry": "/modules/todo/index.js",
  "title": "Todo",
  "icon": "✅",
  "defaultSize": { "w": 400, "h": 500 },
  "singleton": false,
  "generator": true,
  "hasSettings": false,
  "resizable": true,
  "minSize": { "w": 280, "h": 300 },
  "sync": false,
  "dataCollections": ["todos"],
  "contextMenu": [
    { "label": "✅ New Todo List", "config": { "name": "New List", "icon": "✅" } }
  ]
}
```

`dataCollections` must list every localStorage collection you write to. The shell
reads this to clean up data when the user deletes an instance.

### 2. index.js — using AppModuleBase

Generator modules should extend `AppModuleBase`. It handles shadow DOM setup,
Tailwind injection, dark-mode sync, theme observer, and cross-device sync.
Implement exactly three methods:

```js
import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';

class AppTodo extends AppModuleBase {
  // Called once after mount. Load persisted state into this._state.
  async _load() {
    this._state = await getData('todos', this._appId)
      || { name: 'New List', items: [] };
  }

  // Called after _load() and on every state change. Write DOM here.
  _render() {
    this._wrapper.innerHTML = `
      <div class="body">
        <button data-action="add">＋ Add item</button>
        <ul>
          ${this._state.items.map(i => `
            <li data-id="${i.id}">${this._esc(i.text)}</li>
          `).join('')}
        </ul>
      </div>
    `;
    this._wrapper.querySelector('[data-action="add"]')
      ?.addEventListener('click', () => this._addItem());
  }

  // Return string for the OS titlebar.
  _getTitle() { return this._state.name; }

  async _addItem() {
    this._state.items.push({ id: Date.now(), text: 'New item' });
    await setData('todos', this._appId, this._state);
    this._render();
  }
}

customElements.define('app-todo', AppTodo);
```

Key points:
- `this._appId` — the stable `instanceId` set by `AppModuleBase`. Always use this as the data key.
- `this._wrapper` — the root `div.wrapper` in the shadow root. Write to `this._wrapper.innerHTML`.
- `this._esc(str)` — HTML-escape strings before putting them in `innerHTML`.
- `this.api` — shell API (set title, fire toasts, access store). Available after `_load()` is called.

### 3. Naming the instance

Users can rename instances via the OS titlebar. The module reflects this automatically
because the OS titlebar writes `instance.name` and calls `store.renameInstance()`.

If the module itself needs to update the name (e.g., on first load from config):

```js
async _load() {
  const config = this.api?.config;
  this._state = await getData('todos', this._appId)
    || { name: config?.name || 'New List', items: [] };
}
```

### 4. Settings panel

If your module has a settings panel, add `"hasSettings": true` to the manifest.
The OS titlebar will show a ⚙️ button. Handle it:

```js
connectedCallback() {
  super.connectedCallback(); // AppModuleBase sets everything up
  this.addEventListener('os:toggle-settings', () => this._toggleSettings());
}

_toggleSettings() {
  this._settingsOpen = !this._settingsOpen;
  this._render();
}
```

---

## Plain / singleton module step-by-step

For modules without per-instance data, skip `AppModuleBase` and write the custom
element directly:

```js
import { adoptTailwind } from '/shell/shadow-tailwind.js';

class AppMyTool extends HTMLElement {
  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const styleEl = document.createElement('style');
    styleEl.textContent = await fetch('/modules/my-tool/styles.css')
      .then(r => r.text()).catch(() => '');
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);
    await new Promise(r => setTimeout(r, 0)); // wait for el.api
    this._render();
  }

  _render() {
    this._wrapper.innerHTML = `<div class="body">Hello!</div>`;
  }
}

customElements.define('app-my-tool', AppMyTool);
```

---

## The `el.api` contract

The shell attaches `this.api` before the element is appended to the DOM.
Wait one tick before reading it (see examples above).

| Property | Description |
|---|---|
| `windowId` | Ephemeral — changes every launch. Use only for `requestClose()`. |
| `instanceId` | Stable — set once at `createInstance()`. **Always use this as the data key.** Generator modules only. |
| `config` | Config object from the `contextMenu` entry that triggered this launch. |
| `isDark` | Current theme boolean. |
| `mode` | `'windowed'` or `'fullscreen'`. |
| `setTitle(t)` | Update the window titlebar. |
| `notify(msg, type)` | Fire a toast. `type`: `'info'`, `'success'`, or `'error'`. |
| `requestClose()` | Close this window from inside the module. |
| `updateInstance(name, icon)` | Rename the desktop icon + persist. Generator modules only. |
| `store` | Read-only access to `Alpine.store('os')`. |

---

## Persistence

All reads/writes go through `shell/api.js`. Never touch `localStorage` directly.

```js
import { getData, setData } from '/shell/api.js';

// Load — returns null if no data exists yet
const state = await getData('todos', this._appId);

// Save — writes localStorage immediately, syncs to backend in background
await setData('todos', this._appId, state);
```

**localStorage key format:** `os:{collection}:{id}`

Declare every collection in `manifest.json → dataCollections` so the shell cleans
them up when the user deletes an instance.

---

## Dark mode

`AppModuleBase` (and `adoptTailwind`) handle syncing the `.dark` class to
`this._wrapper` automatically. In `styles.css`, use:

```css
.wrapper { background: #ffffff; color: #000000; }
.wrapper.dark { background: #1c1c1e; color: #f5f5f7; }
```

Or use the Tailwind utility classes (`bg-white dark:bg-zinc-900`) — they work
inside shadow roots because `adoptTailwind` injects the stylesheet.
