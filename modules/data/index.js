import { AppModuleBase } from '/shell/module-base.js';
import { showEmojiPicker } from '/shell/emoji-picker.js';
import {
  getCollections, createCollection, deleteCollection, renameCollection,
  addItem, updateItem, deleteItem, subscribeCollections,
} from '/modules/data/api.js';

class AppData extends AppModuleBase {
  constructor() {
    super();
    this._collections = {};
    this._expanded = {};    // collectionName → bool
    this._pendingIcon = {}; // collectionName → emoji picked but not yet submitted
    this._unsubData = null;
  }

  _getTitle() { return 'Data'; }

  async _load() {
    this._collections = await getCollections();
  }

  async connectedCallback() {
    await super.connectedCallback();
    this._unsubData = subscribeCollections(async () => {
      this._collections = await getCollections();
      this._render();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubData?.();
  }

  _render() {
    const names = Object.keys(this._collections);

    this._wrapper.innerHTML = `
      <div class="header">
        <span class="header-title">Collections</span>
      </div>
      <div class="body" id="body">
        ${names.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">🗄️</div>
            <div class="empty-hint">No collections yet.<br>Create one to share data across modules.</div>
          </div>
        ` : names.map(name => this._renderCollection(name)).join('')}
        <div class="new-col-form">
          <input class="new-col-input" id="new-col-input" placeholder="New collection name…" />
          <button class="new-col-btn" id="new-col-btn">＋ Create</button>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _ownerBadge(col) {
    const owner = col?._owner;
    if (!owner?.instanceId) return '';
    const instances = window.Alpine?.store('os')?.instances || [];
    const alive = instances.some(i => i.instanceId === owner.instanceId);
    if (alive) {
      const app = window.Alpine?.store('os')?.apps?.[owner.appId];
      const label = app?.title || owner.appId;
      return `<span class="col-owner-badge" title="Created by ${this._esc(label)}">🔗 ${this._esc(label)}</span>`;
    }
    return `<span class="col-owner-badge col-owner-orphan" title="Owning instance was deleted">⚠️ orphaned</span>`;
  }

  _renderCollection(name) {
    const col = this._collections[name];
    const items = col?.items || [];
    const open = this._expanded[name] !== false; // default open
    const pendingIcon = this._pendingIcon[name] || '📄';
    const ownerBadge = this._ownerBadge(col);

    const itemRows = items.map(item => `
      <div class="item-row" data-item-id="${item.id}" data-col="${this._esc(name)}">
        <span class="item-icon">${item.icon || '▪'}</span>
        <input class="item-label" data-action="rename-item" data-col="${this._esc(name)}" data-item-id="${item.id}"
          value="${this._esc(item.label || '')}" placeholder="Label…" />
        <button class="item-del" data-action="del-item" data-col="${this._esc(name)}" data-item-id="${item.id}" title="Delete">✕</button>
      </div>
    `).join('');

    return `
      <div class="collection" data-col="${this._esc(name)}">
        <div class="col-header" data-action="toggle-col" data-col="${this._esc(name)}">
          <span class="col-chevron ${open ? 'open' : ''}">▶</span>
          <input class="col-name-input" data-action="rename-col" data-col="${this._esc(name)}"
            value="${this._esc(name)}" placeholder="Collection name…" />
          ${ownerBadge}
          <span class="col-count">${items.length}</span>
          <button class="col-del" data-action="del-col" data-col="${this._esc(name)}" title="Delete collection">✕</button>
        </div>
        ${open ? `
          <div class="items-list">
            ${itemRows}
            <div class="add-item-form" data-col="${this._esc(name)}">
              <button class="add-item-icon-btn" data-action="pick-item-icon" data-col="${this._esc(name)}" title="Pick icon">${pendingIcon}</button>
              <input class="add-item-input" data-add-col="${this._esc(name)}" placeholder="Add item…" />
              <button class="add-item-btn" data-action="add-item" data-col="${this._esc(name)}">Add</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  _bindEvents() {
    const root = this.shadowRoot;

    // New collection
    const newInput = root.querySelector('#new-col-input');
    const newBtn = root.querySelector('#new-col-btn');
    if (newBtn) {
      const doCreate = async () => {
        const name = newInput?.value.trim();
        if (!name) return;
        this._expanded[name] = true;
        await createCollection(name);
        newInput.value = '';
        // subscribeCollections will re-render; also re-render immediately
        this._collections = await getCollections();
        this._render();
        root.querySelector('#new-col-input')?.focus();
      };
      newBtn.addEventListener('click', doCreate);
      newInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); });
    }

    // Delegated events
    root.querySelector('#body')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const col = btn.dataset.col;

      if (action === 'toggle-col') {
        // Don't toggle when clicking name input or del button
        if (e.target.closest('.col-name-input') || e.target.closest('.col-del')) return;
        this._expanded[col] = !(this._expanded[col] !== false);
        this._render();

      } else if (action === 'del-col') {
        e.stopPropagation();
        await deleteCollection(col);
        this._collections = await getCollections();
        this._render();

      } else if (action === 'add-item') {
        const form = root.querySelector(`.add-item-form[data-col="${col}"]`);
        const input = form?.querySelector(`.add-item-input`);
        const label = input?.value.trim();
        if (!label) return;
        const icon = this._pendingIcon[col] || undefined;
        await addItem(col, { label, ...(icon ? { icon } : {}) });
        delete this._pendingIcon[col];
        if (input) input.value = '';
        this._collections = await getCollections();
        this._render();
        root.querySelector(`.add-item-form[data-col="${col}"] .add-item-input`)?.focus();

      } else if (action === 'del-item') {
        const itemId = btn.dataset.itemId;
        await deleteItem(col, itemId);
        this._collections = await getCollections();
        this._render();

      } else if (action === 'pick-item-icon') {
        const cur = this._pendingIcon[col] || '📄';
        showEmojiPicker(btn, cur, emoji => {
          this._pendingIcon[col] = emoji;
          const iconBtn = root.querySelector(`.add-item-form[data-col="${col}"] .add-item-icon-btn`);
          if (iconBtn) iconBtn.textContent = emoji;
        });
      }
    });

    // Add item on Enter in the add-item input
    root.querySelectorAll('.add-item-input').forEach(input => {
      input.addEventListener('keydown', async e => {
        if (e.key !== 'Enter') return;
        const col = input.dataset.addCol;
        const label = input.value.trim();
        if (!label) return;
        const icon = this._pendingIcon[col] || undefined;
        await addItem(col, { label, ...(icon ? { icon } : {}) });
        delete this._pendingIcon[col];
        input.value = '';
        this._collections = await getCollections();
        this._render();
        root.querySelector(`.add-item-form[data-col="${col}"] .add-item-input`)?.focus();
      });
    });

    // Rename collection (on blur)
    root.querySelectorAll('.col-name-input').forEach(input => {
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('blur', async () => {
        const oldName = input.dataset.col;
        const newName = input.value.trim();
        if (!newName || newName === oldName) return;
        if (this._expanded[oldName] !== undefined) {
          this._expanded[newName] = this._expanded[oldName];
          delete this._expanded[oldName];
        }
        await renameCollection(oldName, newName);
        this._collections = await getCollections();
        this._render();
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    });

    // Rename item (on blur)
    root.querySelectorAll('.item-label').forEach(input => {
      input.addEventListener('blur', async () => {
        const col = input.dataset.col;
        const id = input.dataset.itemId;
        const label = input.value.trim();
        if (!label) return;
        await updateItem(col, id, { label });
        this._collections = await getCollections();
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    });
  }
}

customElements.define('app-data', AppData);
