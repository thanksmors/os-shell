import { AppModuleBase } from '/shell/module-base.js';
import { getList, saveList } from '/shell/api.js';

class AppList extends AppModuleBase {
  constructor() {
    super();
    this._settingsOpen = false;
  }

  _collection() { return 'lists'; }

  async _load() {
    const cfg = this.api?.config || {};
    this._state = await getList(this._appId);
    if (cfg.name && this._state.items.length === 0 && this._state.name === 'My List') {
      this._state.name = cfg.name;
      await saveList(this._appId, this._state);
    }
  }

  _getTitle() { return this._state?.name || 'List'; }

  async _save() {
    await saveList(this._appId, this._state);
  }

  _fields() {
    return this._state.fields || [];
  }

  _render() {
    const { name, items } = this._state;
    const fields = this._fields();
    const done = items.filter(i => i.checked).length;
    const total = items.length;

    const fieldInputs = fields.map(f =>
      `<input class="add-field-input" data-field-id="${f.id}" placeholder="${this._esc(f.name)}…" />`
    ).join('');

    const fieldHeaders = fields.length > 0
      ? `<div class="item-fields-header">${fields.map(f => `<span class="field-col-label">${this._esc(f.name)}</span>`).join('')}</div>`
      : '';

    const curIcon = this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '✅';

    const settingsFields = fields.map((f, idx) => `
      <div class="settings-field-row" data-field-idx="${idx}">
        <input class="settings-input settings-field-name" data-field-idx="${idx}" value="${this._esc(f.name)}" placeholder="Field name…" />
        <select class="settings-select settings-field-type" data-field-idx="${idx}">
          <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${f.type === 'number' ? 'selected' : ''}>Number</option>
          <option value="date" ${f.type === 'date' ? 'selected' : ''}>Date</option>
        </select>
        <button class="settings-field-del" data-action="del-field" data-field-idx="${idx}" title="Remove field">✕</button>
      </div>
    `).join('');

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
            <input class="settings-input settings-icon" id="settings-icon" value="${this._esc(curIcon)}" placeholder="Emoji…" maxlength="4" />
          </div>
          <div class="settings-section-label">Custom Fields</div>
          ${settingsFields}
          <div class="settings-row">
            <button class="settings-add-field" data-action="add-field">＋ Add field</button>
          </div>
          <div class="settings-row" style="justify-content:flex-end;gap:8px;">
            <button class="settings-cancel" data-action="toggle-settings">Cancel</button>
            <button class="settings-save" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="add-row">
        <input class="add-input" placeholder="Add an item…" />
        ${fieldInputs}
        <button class="add-btn">Add</button>
      </div>
      ${fieldHeaders}
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
            ${fields.map(f => `<div class="item-field-val" title="${this._esc(f.name)}">${this._esc(item.fieldValues?.[f.id] || '')}</div>`).join('')}
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

    const titleInput = shadow.querySelector('.list-title');
    titleInput.addEventListener('input', () => {
      const name = titleInput.value || 'List';
      this._state.name = titleInput.value;
      if (this.api) this.api.setTitle(name);
      this._save();
      const inst = this.api?.store?.instances?.find(i => i.instanceId === this._appId);
      if (inst) {
        inst.name = name;
        this.api.store.instances = [...this.api.store.instances];
        clearTimeout(this._renameTimer);
        this._renameTimer = setTimeout(() => {
          if (this.api?.updateInstance) this.api.updateInstance(name, inst.icon);
        }, 600);
      }
    });

    const addInput = shadow.querySelector('.add-input');
    const addBtn = shadow.querySelector('.add-btn');
    const doAdd = () => {
      const text = addInput.value.trim();
      if (!text) return;
      const fields = this._fields();
      const fieldValues = {};
      fields.forEach(f => {
        const el = shadow.querySelector(`.add-field-input[data-field-id="${f.id}"]`);
        if (el) { fieldValues[f.id] = el.value.trim(); el.value = ''; }
      });
      this._state.items.push({ id: 'item-' + Date.now(), text, checked: false, fieldValues });
      addInput.value = '';
      this._save();
      this._render();
      shadow.querySelector('.add-input').focus();
    };
    addBtn.addEventListener('click', doAdd);
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    shadow.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async e => {
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
          const fields = this._fields();
          fields.forEach((f, idx) => {
            const nameInput = this.shadowRoot.querySelector(`.settings-field-name[data-field-idx="${idx}"]`);
            const typeSelect = this.shadowRoot.querySelector(`.settings-field-type[data-field-idx="${idx}"]`);
            if (nameInput) f.name = nameInput.value.trim() || f.name;
            if (typeSelect) f.type = typeSelect.value;
          });
          await this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
          else if (this.api?.setTitle) this.api.setTitle(newName);
          this._settingsOpen = false;
          this._render();
          return;
        } else if (action === 'add-field') {
          if (!this._state.fields) this._state.fields = [];
          this._state.fields.push({ id: 'field-' + Date.now(), name: 'Field', type: 'text' });
          this._render();
          return;
        } else if (action === 'del-field') {
          const idx = parseInt(el.dataset.fieldIdx, 10);
          if (!isNaN(idx) && this._state.fields) {
            const fid = this._state.fields[idx]?.id;
            this._state.fields.splice(idx, 1);
            if (fid) this._state.items.forEach(item => { if (item.fieldValues) delete item.fieldValues[fid]; });
          }
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
}

customElements.define('app-list', AppList);
