# Module Boilerplate

Copy this folder to create a new Alpine OS Shell module.
For all contracts (manifest fields, el.api, collection rules) see `modules/AGENTS.md`.

---

## 5-step quickstart

1. **Copy** `modules/boilerplate/` → `modules/your-id/`
2. **Edit `manifest.json`** — set `appId`, `tag`, `title`, `icon`, `defaultSize`, `minSize`
3. **Edit `index.js`** — rename the class and `customElements.define` tag
4. **Edit `styles.css`** — scoped to shadow root, won't leak
5. **Add `"your-id"` to `/registry.json`** — shell discovers it on reload

---

## Choose your module type

| Type | `generator` | `singleton` | What it does |
|---|---|---|---|
| **Plain** | `false` | `false` | Desktop icon + launcher. Multiple windows. |
| **Singleton** | `false` | `true` | Desktop icon + launcher. Second launch focuses existing. |
| **Generator** | `true` | — | No icon, not in launcher. Named instances via right-click menu. Each instance has separate data. |

---

## Generator module (multi-instance, separate data per instance)

```json
{
  "appId": "todo",
  "tag": "app-todo",
  "entry": "/modules/todo/index.js",
  "title": "Todo",
  "icon": "✅",
  "defaultSize": { "w": 400, "h": 500 },
  "generator": true,
  "resizable": true,
  "minSize": { "w": 280, "h": 300 },
  "dataCollections": ["todos"],
  "contextMenu": [
    { "label": "✅ New Todo List", "config": { "name": "New List", "icon": "✅" } }
  ]
}
```

```js
import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';

class AppTodo extends AppModuleBase {
  async _load() {
    // this._appId is the stable instanceId — always use this as the data key
    this._state = await getData('todos', this._appId)
      || { name: this.api?.config?.name || 'New List', items: [] };
  }

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

  _getTitle() { return this._state.name; }

  async _addItem() {
    this._state.items.push({ id: Date.now(), text: 'New item' });
    await setData('todos', this._appId, this._state);
    this._render();
  }
}

customElements.define('app-todo', AppTodo);
```

---

## Plain / singleton module (shared state, no instanceId)

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

## Settings panel

Add `"hasSettings": true` to the manifest. The OS titlebar shows ⚙️. Handle:

```js
// in connectedCallback, after await new Promise(...)
this.addEventListener('os:toggle-settings', () => this._toggleSettings());
```

---

## Appearance integration

Modules respond live to **Settings > Appearance** if styles.css follows three rules:

1. **Font sizes in `rem`** — Settings scales `html { font-size }`; rem cascades into shadow DOM. Never `px` for text.
2. **Primary actions use `var(--os-accent, #3b82f6)`** — Settings sets `--os-accent` on `:root`; custom properties inherit through shadow boundaries.
3. **No `font-family` declarations** — the family Settings chose inherits from `html` automatically.

---

## Dark mode

`AppModuleBase` (and `adoptTailwind`) sync `.dark` to `this._wrapper` automatically.

```css
.wrapper { background: #ffffff; color: #000000; }
.wrapper.dark { background: #1c1c1e; color: #f5f5f7; }
```

Tailwind dark variants (`dark:bg-zinc-900`) also work inside shadow DOM.
