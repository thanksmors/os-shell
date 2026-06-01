import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { getList, saveList } from '/shell/api.js';

class AppList extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this._appId = null;
    this._settingsOpen = false;
  }

  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    const css = await fetch('/modules/list/styles.css').then(r => r.text());
    styleEl.textContent = css;

    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);

    // wait one tick for el.api to be set by shell
    await new Promise(r => setTimeout(r, 0));

    this._appId = this.api?.instanceId || this.api?.windowId || ('list-' + Date.now());
    // If launched with a config name (first launch), use it as the list name
    const cfg = this.api?.config || {};
    this._state = await getList(this._appId);
    if (cfg.name && this._state.items.length === 0 && this._state.name === 'My List') {
      this._state.name = cfg.name;
      await saveList(this._appId, this._state);
    }
    this._applyTheme();
    this._render();

    // watch theme changes
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    if (this.api) this.api.setTitle(this._state.name);
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
  }

  _applyTheme() {
    if (document.documentElement.classList.contains('dark')) {
      this._wrapper.classList.add('dark');
    } else {
      this._wrapper.classList.remove('dark');
    }
  }

  async _save() {
    await saveList(this._appId, this._state);
  }

  _render() {
    const { name, items } = this._state;
    const done = items.filter(i => i.checked).length;
    const total = items.length;

    this._wrapper.innerHTML = `
      <div class="header">
        <input class="list-title" value="${this._esc(name)}" placeholder="List name…" title="Click to rename" />
        <button class="header-btn" data-action="toggle-settings" title="Settings">⚙️</button>
        <button class="header-btn" data-action="clear-done" title="Clear completed">🗑</button>
      </div>
      ${this._settingsOpen ? `
        <div class="settings-panel">
          <div class="settings-row">
            <label class="settings-label">Name</label>
            <input class="settings-input" id="settings-name" value="${this._esc(name)}" placeholder="List name…" />
          </div>
          <div class="settings-row">
            <label class="settings-label">Icon</label>
            <input class="settings-input settings-icon" id="settings-icon" value="${this._esc(this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '✅')}" placeholder="Emoji…" maxlength="4" />
          </div>
          <div class="settings-row" style="justify-content:flex-end;gap:8px;">
            <button class="settings-cancel" data-action="toggle-settings">Cancel</button>
            <button class="settings-save" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="add-row">
        <input class="add-input" placeholder="Add an item…" />
        <button class="add-btn">Add</button>
      </div>
      <div class="items">
        ${total === 0 ? `
          <div class="empty">
            <div class="empty-icon">✅</div>
            <div>Nothing here yet — add something above</div>
          </div>
        ` : items.map(item => `
          <div class="item" data-id="${item.id}">
            <div class="item-check ${item.checked ? 'checked' : ''}" data-action="toggle" data-id="${item.id}"></div>
            <div class="item-text ${item.checked ? 'done' : ''}">${this._esc(item.text)}</div>
            <button class="item-del" data-action="delete" data-id="${item.id}" title="Delete">✕</button>
          </div>
        `).join('')}
      </div>
      <div class="footer">
        <span>${done} / ${total} done</span>
        ${done > 0 ? `<button class="clear-btn" data-action="clear-done">Clear completed</button>` : ''}
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const shadow = this.shadowRoot;

    // rename list
    const titleInput = shadow.querySelector('.list-title');
    titleInput.addEventListener('input', () => {
      this._state.name = titleInput.value;
      if (this.api) this.api.setTitle(this._state.name || 'List');
      this._save();
    });

    // add item
    const addInput = shadow.querySelector('.add-input');
    const addBtn = shadow.querySelector('.add-btn');
    const doAdd = () => {
      const text = addInput.value.trim();
      if (!text) return;
      this._state.items.push({ id: 'item-' + Date.now(), text, checked: false });
      addInput.value = '';
      this._save();
      this._render();
      shadow.querySelector('.add-input').focus();
    };
    addBtn.addEventListener('click', doAdd);
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    // toggle / delete
    shadow.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => {
        const action = el.dataset.action;
        const id = el.dataset.id;
        if (action === 'toggle') {
          const item = this._state.items.find(i => i.id === id);
          if (item) { item.checked = !item.checked; this._save(); this._render(); }
        } else if (action === 'delete') {
          this._state.items = this._state.items.filter(i => i.id !== id);
          this._save();
          this._render();
        } else if (action === 'toggle-settings') {
          this._settingsOpen = !this._settingsOpen;
          this._render();
          return;
        } else if (action === 'save-settings') {
          const nameEl = this.shadowRoot.querySelector('#settings-name');
          const iconEl = this.shadowRoot.querySelector('#settings-icon');
          const newName = nameEl?.value.trim() || this._state.name;
          const newIcon = iconEl?.value.trim() || '✅';
          this._state.name = newName;
          await this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
          else if (this.api?.setTitle) this.api.setTitle(newName);
          this._settingsOpen = false;
          this._render();
          return;
        } else if (action === 'clear-done') {
          this._state.items = this._state.items.filter(i => !i.checked);
          this._save();
          this._render();
        }
      });
    });
  }

  _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

customElements.define('app-list', AppList);
