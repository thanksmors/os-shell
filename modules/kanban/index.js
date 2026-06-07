import { AppModuleBase } from '/shell/module-base.js';
import { getBoard, saveBoard } from '/shell/api.js';

class AppKanban extends AppModuleBase {
  constructor() {
    super();
    this._addingCardCol = null;
    this._dragCard = null;
    this._settingsOpen = false;
  }

  _collection() { return 'boards'; }

  async _load() {
    this._state = await getBoard(this._appId);
  }

  _getTitle() { return this._state?.name || 'Kanban'; }

  async _save() {
    await saveBoard(this._appId, this._state);
  }

  _render() {
    const { name, columns, cards } = this._state;
    const addingCol = this._addingCardCol;

    this._wrapper.innerHTML = `
      <div class="header">
        <input class="board-title" value="${this._esc(name)}" placeholder="Board name…" />
        <button class="header-btn" data-action="toggle-settings" title="Settings">⚙️</button>
        <button class="header-btn primary" data-action="add-col">＋ Add column</button>
      </div>
      ${this._settingsOpen ? `
        <div class="settings-panel">
          <div class="settings-row">
            <label class="settings-label">Name</label>
            <input class="settings-input" id="settings-name" value="${this._esc(name)}" placeholder="Board name…" />
          </div>
          <div class="settings-row">
            <label class="settings-label">Icon</label>
            <input class="settings-input settings-icon" id="settings-icon" value="${this._esc(this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '🗂️')}" placeholder="Emoji…" maxlength="4" />
          </div>
          <div class="settings-row" style="justify-content:flex-end;gap:8px;">
            <button class="settings-cancel" data-action="toggle-settings">Cancel</button>
            <button class="settings-save" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="board">
        ${columns.map(col => {
          const colCards = cards.filter(c => c.colId === col.id);
          return `
            <div class="column" data-col-id="${col.id}">
              <div class="col-header">
                <input class="col-title" value="${this._esc(col.name)}" data-col-id="${col.id}" />
                <span class="col-count">${colCards.length}</span>
                <button class="col-del" data-action="del-col" data-col-id="${col.id}" title="Delete column">✕</button>
              </div>
              <div class="cards" data-col-id="${col.id}">
                ${colCards.map(card => `
                  <div class="card" draggable="true" data-card-id="${card.id}" data-col-id="${col.id}">
                    <div class="card-title">${this._esc(card.title)}</div>
                    ${card.note ? `<div class="card-note">${this._esc(card.note)}</div>` : ''}
                    <button class="card-del" data-action="del-card" data-card-id="${card.id}" title="Delete">✕</button>
                  </div>
                `).join('')}
              </div>
              ${addingCol === col.id ? `
                <div class="add-card-form" data-col-id="${col.id}">
                  <textarea class="add-card-input" placeholder="Card title…" rows="2" autofocus></textarea>
                  <textarea class="add-card-input" placeholder="Note (optional)" rows="1" data-note></textarea>
                  <div class="add-card-actions">
                    <button class="btn-save-card" data-action="save-card" data-col-id="${col.id}">Add</button>
                    <button class="btn-cancel-card" data-action="cancel-card">Cancel</button>
                  </div>
                </div>
              ` : `
                <button class="add-card-btn" data-action="open-add-card" data-col-id="${col.id}">＋ Add card</button>
              `}
            </div>
          `;
        }).join('')}
        <button class="add-col-btn" data-action="add-col">＋ Add column</button>
      </div>
    `;

    this._bindEvents();

    if (addingCol) {
      const form = this._wrapper.querySelector(`.add-card-form[data-col-id="${addingCol}"]`);
      form?.querySelector('textarea')?.focus();
    }
  }

  _bindEvents() {
    const w = this._wrapper;

    w.querySelector('.board-title').addEventListener('input', e => {
      this._state.name = e.target.value;
      if (this.api) this.api.setTitle(this._state.name || 'Kanban');
      this._save();
    });

    w.querySelectorAll('.col-title').forEach(input => {
      input.addEventListener('input', e => {
        const col = this._state.columns.find(c => c.id === e.target.dataset.colId);
        if (col) { col.name = e.target.value; this._save(); }
      });
    });

    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async e => {
        e.stopPropagation();
        const action = el.dataset.action;

        if (action === 'toggle-settings') {
          this._settingsOpen = !this._settingsOpen;
          this._render();
          return;
        }
        if (action === 'save-settings') {
          const nameEl = this._wrapper.querySelector('#settings-name');
          const iconEl = this._wrapper.querySelector('#settings-icon');
          const newName = nameEl?.value.trim() || this._state.name;
          const newIcon = iconEl?.value.trim() || '🗂️';
          this._state.name = newName;
          await this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
          else if (this.api?.setTitle) this.api.setTitle(newName);
          this._settingsOpen = false;
          this._render();
          return;
        }
        if (action === 'add-col') {
          this._state.columns.push({ id: 'col-' + Date.now(), name: 'New Column' });
          this._save();
          this._addingCardCol = null;
          this._render();
        } else if (action === 'del-col') {
          const colId = el.dataset.colId;
          this._state.columns = this._state.columns.filter(c => c.id !== colId);
          this._state.cards = this._state.cards.filter(c => c.colId !== colId);
          this._save();
          this._render();
        } else if (action === 'open-add-card') {
          this._addingCardCol = el.dataset.colId;
          this._render();
        } else if (action === 'cancel-card') {
          this._addingCardCol = null;
          this._render();
        } else if (action === 'save-card') {
          const form = el.closest('.add-card-form');
          const inputs = form.querySelectorAll('textarea');
          const title = inputs[0].value.trim();
          const note = inputs[1].value.trim();
          if (!title) return;
          this._state.cards.push({ id: 'card-' + Date.now(), colId: el.dataset.colId, title, note });
          this._addingCardCol = null;
          this._save();
          this._render();
        } else if (action === 'del-card') {
          this._state.cards = this._state.cards.filter(c => c.id !== el.dataset.cardId);
          this._save();
          this._render();
        }
      });
    });

    w.querySelectorAll('.card').forEach(card => {
      card.addEventListener('dragstart', e => {
        this._dragCard = { cardId: card.dataset.cardId, fromColId: card.dataset.colId };
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        w.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over'));
      });
    });

    w.querySelectorAll('.column').forEach(col => {
      const colId = col.dataset.colId;
      col.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', e => {
        if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
      });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!this._dragCard) return;
        const { cardId } = this._dragCard;
        const card = this._state.cards.find(c => c.id === cardId);
        if (card) {
          card.colId = colId;
          this._save();
          this._render();
        }
        this._dragCard = null;
      });
    });
  }
}

customElements.define('app-kanban', AppKanban);
