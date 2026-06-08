import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';
import { showEmojiPicker } from '/shell/emoji-picker.js';

const COLORS = ['#007aff','#34c759','#ff9500','#ff3b30','#af52de','#5ac8fa','#ff2d55','#a2845e'];

function defaultGrid(name) {
  const year = new Date().getFullYear();
  return {
    name,
    columns: [
      { id: 'col-1', name: `Q1 ${year}` },
      { id: 'col-2', name: `Q2 ${year}` },
      { id: 'col-3', name: `Q3 ${year}` },
      { id: 'col-4', name: `Q4 ${year}` },
    ],
    rows: [
      { id: 'row-1', name: 'Track 1' },
      { id: 'row-2', name: 'Track 2' },
      { id: 'row-3', name: 'Track 3' },
    ],
    items: [],
  };
}

async function getGrid(appId) {
  const d = await getData('grids', appId);
  return d || defaultGrid('My Grid');
}
async function saveGrid(appId, state) { return setData('grids', appId, state); }

class AppGrid extends AppModuleBase {
  constructor() {
    super();
    this._settingsOpen = false;
    this._addingCell = null;
    this._dragItem = null;
    this._dragCol = null;
    this._dragRow = null;
    this.addEventListener('os:toggle-settings', () => { this._settingsOpen = !this._settingsOpen; this._render(); });
  }

  _collection() { return 'grids'; }

  async _load() {
    this._state = await getGrid(this._appId);
    const cfg = this.api?.config || {};
    if (cfg.name && this._state.items.length === 0 && this._state.name === 'My Grid') {
      this._state.name = cfg.name;
      await saveGrid(this._appId, this._state);
    }
  }

  _getTitle() { return this._state?.name || 'Grid'; }

  async _save() { await saveGrid(this._appId, this._state); }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render() {
    const { name, columns, rows, items } = this._state;
    const curIcon = this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '⊞';

    const headerCells = columns.map((col, ci) => `
      <div class="col-header" data-col-id="${col.id}" data-col-idx="${ci}" draggable="true">
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <input class="col-title-input" value="${this._esc(col.name)}" data-col-id="${col.id}" />
        <button class="col-del" data-action="del-col" data-col-id="${col.id}" title="Delete column">✕</button>
      </div>
    `).join('');

    const bodyRows = rows.map((row, ri) => {
      const cells = columns.map(col => {
        const cellItems = items.filter(it => it.rowId === row.id && it.colId === col.id);
        const adding = this._addingCell?.rowId === row.id && this._addingCell?.colId === col.id;
        return `
          <div class="grid-cell" data-row-id="${row.id}" data-col-id="${col.id}">
            ${cellItems.map(it => `
              <div class="item-card" draggable="true" data-item-id="${it.id}" style="border-left-color:${it.color || COLORS[0]};">
                <span class="item-title">${this._esc(it.title)}</span>
                <button class="item-del" data-action="del-item" data-item-id="${it.id}" title="Delete">✕</button>
              </div>
            `).join('')}
            ${adding ? `
              <div class="add-item-form">
                <input class="add-item-input" placeholder="Item title…" />
                <div class="add-item-actions">
                  <button class="btn-save-item" data-action="save-item" data-row-id="${row.id}" data-col-id="${col.id}">Add</button>
                  <button class="btn-cancel-item" data-action="cancel-item">✕</button>
                </div>
              </div>
            ` : `
              <button class="add-item-btn" data-action="open-add-item" data-row-id="${row.id}" data-col-id="${col.id}" title="Add item">＋</button>
            `}
          </div>
        `;
      }).join('');

      return `
        <div class="grid-row">
          <div class="row-header" data-row-id="${row.id}" data-row-idx="${ri}" draggable="true">
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            <input class="row-title-input" value="${this._esc(row.name)}" data-row-id="${row.id}" />
            <button class="row-del" data-action="del-row" data-row-id="${row.id}" title="Delete row">✕</button>
          </div>
          ${cells}
        </div>
      `;
    }).join('');

    this._wrapper.innerHTML = `
      ${this._settingsOpen ? `
        <div class="settings-panel">
          <div class="settings-row">
            <label class="settings-label">Name</label>
            <input class="settings-input" id="settings-name" value="${this._esc(name)}" placeholder="Grid name…" />
          </div>
          <div class="settings-row">
            <label class="settings-label">Icon</label>
            <button class="icon-pick-btn" data-action="pick-icon" title="Pick icon">
              <span id="settings-icon-preview">${this._esc(curIcon)}</span> <span style="font-size:10px;opacity:.5;">▾</span>
            </button>
            <input type="hidden" id="settings-icon" value="${this._esc(curIcon)}" />
          </div>
          <div class="settings-row" style="justify-content:flex-end;gap:8px;">
            <button class="settings-cancel" data-action="toggle-settings">Cancel</button>
            <button class="settings-save" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="grid-scroll">
        <div class="grid-table" style="--col-count:${columns.length};">
          <div class="grid-header-row">
            <div class="corner-cell"></div>
            ${headerCells}
            <div class="add-col-cell">
              <button class="add-col-btn" data-action="add-col" title="Add column">＋</button>
            </div>
          </div>
          <div class="grid-body">
            ${bodyRows}
            <div class="add-row-row">
              <button class="add-row-btn" data-action="add-row">＋ Add row</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();

    if (this._addingCell) {
      const input = this._wrapper.querySelector('.add-item-input');
      input?.focus();
    }
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  _bindEvents() {
    const w = this._wrapper;

    // Column title rename
    w.querySelectorAll('.col-title-input').forEach(inp => {
      inp.addEventListener('input', e => {
        const col = this._state.columns.find(c => c.id === e.target.dataset.colId);
        if (col) { col.name = e.target.value; this._save(); }
      });
    });

    // Row title rename
    w.querySelectorAll('.row-title-input').forEach(inp => {
      inp.addEventListener('input', e => {
        const row = this._state.rows.find(r => r.id === e.target.dataset.rowId);
        if (row) { row.name = e.target.value; this._save(); }
      });
    });

    // Add-item form: save on Enter
    w.querySelector('.add-item-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') w.querySelector('[data-action="save-item"]')?.click();
      if (e.key === 'Escape') w.querySelector('[data-action="cancel-item"]')?.click();
    });

    // All data-action clicks
    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async e => {
        e.stopPropagation();
        const action = el.dataset.action;

        if (action === 'pick-icon') {
          const cur = w.querySelector('#settings-icon')?.value || '⊞';
          showEmojiPicker(el, cur, emoji => {
            const hidden = w.querySelector('#settings-icon');
            const preview = w.querySelector('#settings-icon-preview');
            if (hidden) hidden.value = emoji;
            if (preview) preview.textContent = emoji;
          });
          return;
        }
        if (action === 'toggle-settings') {
          this._settingsOpen = !this._settingsOpen;
          this._render(); return;
        }
        if (action === 'save-settings') {
          const newName = w.querySelector('#settings-name')?.value.trim() || this._state.name;
          const newIcon = w.querySelector('#settings-icon')?.value.trim() || '⊞';
          this._state.name = newName;
          await this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
          else if (this.api?.setTitle) this.api.setTitle(newName);
          this._settingsOpen = false;
          this._render(); return;
        }
        if (action === 'add-col') {
          this._state.columns.push({ id: 'col-' + Date.now(), name: 'New Column' });
          this._save(); this._render(); return;
        }
        if (action === 'del-col') {
          const id = el.dataset.colId;
          this._state.columns = this._state.columns.filter(c => c.id !== id);
          this._state.items = this._state.items.filter(it => it.colId !== id);
          this._save(); this._render(); return;
        }
        if (action === 'add-row') {
          this._state.rows.push({ id: 'row-' + Date.now(), name: 'New Row' });
          this._save(); this._render(); return;
        }
        if (action === 'del-row') {
          const id = el.dataset.rowId;
          this._state.rows = this._state.rows.filter(r => r.id !== id);
          this._state.items = this._state.items.filter(it => it.rowId !== id);
          this._save(); this._render(); return;
        }
        if (action === 'open-add-item') {
          this._addingCell = { rowId: el.dataset.rowId, colId: el.dataset.colId };
          this._render(); return;
        }
        if (action === 'cancel-item') {
          this._addingCell = null;
          this._render(); return;
        }
        if (action === 'save-item') {
          const input = w.querySelector('.add-item-input');
          const title = input?.value.trim();
          if (!title) return;
          const color = COLORS[this._state.items.length % COLORS.length];
          this._state.items.push({ id: 'item-' + Date.now(), rowId: el.dataset.rowId, colId: el.dataset.colId, title, color });
          this._addingCell = null;
          this._save(); this._render(); return;
        }
        if (action === 'del-item') {
          this._state.items = this._state.items.filter(it => it.id !== el.dataset.itemId);
          this._save(); this._render(); return;
        }
      });
    });

    this._bindItemDrag(w);
    this._bindColDrag(w);
    this._bindRowDrag(w);
  }

  // ─── Drag: items between cells ────────────────────────────────────────────

  _bindItemDrag(w) {
    w.querySelectorAll('.item-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        this._dragItem = card.dataset.itemId;
        this._dragCol = null;
        this._dragRow = null;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        w.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('drag-over'));
      });
    });

    w.querySelectorAll('.grid-cell').forEach(cell => {
      cell.addEventListener('dragover', e => {
        if (!this._dragItem) return;
        e.preventDefault();
        cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', e => {
        if (!cell.contains(e.relatedTarget)) cell.classList.remove('drag-over');
      });
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        if (!this._dragItem) return;
        const item = this._state.items.find(it => it.id === this._dragItem);
        if (item) {
          item.rowId = cell.dataset.rowId;
          item.colId = cell.dataset.colId;
          this._save(); this._render();
        }
        this._dragItem = null;
      });
    });
  }

  // ─── Drag: reorder columns ────────────────────────────────────────────────

  _bindColDrag(w) {
    const headers = w.querySelectorAll('.col-header');
    let fromIdx = null;

    headers.forEach(header => {
      header.addEventListener('dragstart', e => {
        if (this._dragItem) return; // item drag takes priority
        fromIdx = parseInt(header.dataset.colIdx, 10);
        this._dragCol = fromIdx;
        this._dragItem = null;
        this._dragRow = null;
        e.dataTransfer.effectAllowed = 'move';
        header.classList.add('dragging');
      });
      header.addEventListener('dragend', () => {
        header.classList.remove('dragging');
        w.querySelectorAll('.col-header').forEach(h => h.classList.remove('drag-over'));
        fromIdx = null;
        this._dragCol = null;
      });
      header.addEventListener('dragover', e => {
        if (this._dragCol === null) return;
        e.preventDefault();
        w.querySelectorAll('.col-header').forEach(h => h.classList.remove('drag-over'));
        header.classList.add('drag-over');
      });
      header.addEventListener('drop', e => {
        e.preventDefault();
        const toIdx = parseInt(header.dataset.colIdx, 10);
        if (fromIdx === null || fromIdx === toIdx) return;
        const cols = this._state.columns;
        const [moved] = cols.splice(fromIdx, 1);
        cols.splice(toIdx, 0, moved);
        this._save(); this._render();
        this._dragCol = null;
      });
    });
  }

  // ─── Drag: reorder rows ───────────────────────────────────────────────────

  _bindRowDrag(w) {
    const headers = w.querySelectorAll('.row-header');
    let fromIdx = null;

    headers.forEach(header => {
      header.addEventListener('dragstart', e => {
        if (this._dragItem || this._dragCol !== null) return;
        fromIdx = parseInt(header.dataset.rowIdx, 10);
        this._dragRow = fromIdx;
        e.dataTransfer.effectAllowed = 'move';
        header.classList.add('dragging');
      });
      header.addEventListener('dragend', () => {
        header.classList.remove('dragging');
        w.querySelectorAll('.row-header').forEach(h => h.classList.remove('drag-over'));
        fromIdx = null;
        this._dragRow = null;
      });
      header.addEventListener('dragover', e => {
        if (this._dragRow === null) return;
        e.preventDefault();
        w.querySelectorAll('.row-header').forEach(h => h.classList.remove('drag-over'));
        header.classList.add('drag-over');
      });
      header.addEventListener('drop', e => {
        e.preventDefault();
        const toIdx = parseInt(header.dataset.rowIdx, 10);
        if (fromIdx === null || fromIdx === toIdx) return;
        const rows = this._state.rows;
        const [moved] = rows.splice(fromIdx, 1);
        rows.splice(toIdx, 0, moved);
        this._save(); this._render();
        this._dragRow = null;
      });
    });
  }
}

customElements.define('app-grid', AppGrid);
