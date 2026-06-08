import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';

async function getRocksBoard(appId) {
  const d = await getData('rocks', appId);
  return d || {
    name: 'My Rocks',
    functions: [
      { id: 'fn-1', name: 'Marketing' },
      { id: 'fn-2', name: 'Engineering' },
      { id: 'fn-3', name: 'Operations' },
    ],
    rocks: [],
  };
}
async function saveRocksBoard(appId, board) { return setData('rocks', appId, board); }

class AppRocks extends AppModuleBase {
  constructor() {
    super();
    this._openRock = null;
    this._dragRock = null;
  }

  _collection() { return 'rocks'; }

  async _load() {
    this._state = await getRocksBoard(this._appId);
    const cfg = this.api?.config || {};
    if (cfg.name && this._state.rocks.length === 0 && this._state.name === 'My Rocks') {
      this._state.name = cfg.name;
      await saveRocksBoard(this._appId, this._state);
    }
  }

  _getTitle() { return this._state?.name || 'Rocks'; }

  async _save() { await saveRocksBoard(this._appId, this._state); }

  _milestoneProgress(rock) {
    const ms = rock.milestones || [];
    if (!ms.length) return { done: 0, total: 0, pct: 0 };
    const done = ms.filter(m => m.done).length;
    return { done, total: ms.length, pct: Math.round((done / ms.length) * 100) };
  }

  _dateBadgeClass(dateStr) {
    if (!dateStr) return '';
    const diff = (new Date(dateStr) - new Date()) / 86400000;
    if (diff < 0) return 'overdue';
    if (diff <= 3) return 'soon';
    return 'ok';
  }

  _formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  _render() {
    const { name, functions, rocks } = this._state;

    this._wrapper.innerHTML = `
      <div class="board">
        ${functions.map(fn => {
          const fnRocks = rocks.filter(r => r.functionId === fn.id);
          return `
            <div class="fn-col" data-fn-id="${fn.id}">
              <div class="fn-header">
                <input class="fn-title" value="${this._esc(fn.name)}" data-fn-id="${fn.id}" />
                <span class="fn-count">${fnRocks.length}</span>
                <button class="fn-del" data-action="del-fn" data-fn-id="${fn.id}">✕</button>
              </div>
              <div class="rocks-list" data-fn-id="${fn.id}">
                ${fnRocks.map(rock => {
                  const { done, total, pct } = this._milestoneProgress(rock);
                  return `
                    <div class="rock-card" draggable="true" data-rock-id="${rock.id}" data-fn-id="${fn.id}">
                      <div class="rock-title">${this._esc(rock.title)}</div>
                      <div class="rock-progress-row">
                        <div class="rock-progress-track">
                          <div class="rock-progress-fill ${pct === 0 ? 'zero' : ''}" style="width:${pct}%"></div>
                        </div>
                        <span class="rock-progress-label">${done}/${total}</span>
                      </div>
                      <button class="rock-del" data-action="del-rock" data-rock-id="${rock.id}">✕</button>
                    </div>
                  `;
                }).join('')}
              </div>
              <button class="add-rock-btn" data-action="add-rock" data-fn-id="${fn.id}">＋ Add rock</button>
            </div>
          `;
        }).join('')}
        <button class="add-fn-btn" data-action="add-fn">＋ Add function</button>
      </div>
      ${this._openRock ? this._renderModal(this._openRock) : ''}
    `;

    this._bindEvents();
  }

  _renderModal(rock) {
    const milestones = rock.milestones || [];
    return `
      <div class="modal-overlay" data-action="close-modal-overlay">
        <div class="modal" data-stop-close>
          <div class="modal-header">
            <input class="modal-title-input" value="${this._esc(rock.title)}" data-action="rename-rock" data-rock-id="${rock.id}" placeholder="Rock title…" />
            <button class="modal-close" data-action="close-modal">✕</button>
          </div>
          <div class="modal-body">
            ${milestones.length === 0 ? '<div style="opacity:.4;font-size:13px;text-align:center;padding:16px 0;">No milestones yet — add one below</div>' : ''}
            ${milestones.map(ms => {
              const cls = this._dateBadgeClass(ms.targetDate);
              return `
                <div class="milestone-item" data-ms-id="${ms.id}">
                  <div class="ms-check ${ms.done ? 'done' : ''}" data-action="toggle-ms" data-ms-id="${ms.id}"></div>
                  <div class="ms-text ${ms.done ? 'done-text' : ''}">${this._esc(ms.text)}</div>
                  ${ms.targetDate ? `<span class="ms-date ${cls}">${this._formatDate(ms.targetDate)}</span>` : ''}
                  <button class="ms-del" data-action="del-ms" data-ms-id="${ms.id}">✕</button>
                </div>
              `;
            }).join('')}
            <div class="add-ms-row">
              <input class="ms-input" placeholder="Milestone…" id="ms-text-input" />
              <input class="ms-date-input" type="date" id="ms-date-input" />
              <button class="ms-add-btn" data-action="add-ms" data-rock-id="${rock.id}">Add</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const w = this._wrapper;

    w.querySelectorAll('.fn-title').forEach(inp => {
      inp.addEventListener('input', e => {
        const fn = this._state.functions.find(f => f.id === e.target.dataset.fnId);
        if (fn) { fn.name = e.target.value; this._save(); }
      });
    });

    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => {
        const action = el.dataset.action;
        e.stopPropagation();

        if (action === 'add-fn') {
          this._state.functions.push({ id: 'fn-' + Date.now(), name: 'New Function' });
          this._save(); this._render();
        } else if (action === 'del-fn') {
          const id = el.dataset.fnId;
          this._state.functions = this._state.functions.filter(f => f.id !== id);
          this._state.rocks = this._state.rocks.filter(r => r.functionId !== id);
          this._save(); this._render();
        } else if (action === 'add-rock') {
          const title = prompt('Rock title:');
          if (!title) return;
          this._state.rocks.push({ id: 'rock-' + Date.now(), functionId: el.dataset.fnId, title: title.trim(), milestones: [] });
          this._save(); this._render();
        } else if (action === 'del-rock') {
          this._state.rocks = this._state.rocks.filter(r => r.id !== el.dataset.rockId);
          if (this._openRock?.id === el.dataset.rockId) this._openRock = null;
          this._save(); this._render();
        } else if (action === 'close-modal' || action === 'close-modal-overlay') {
          this._openRock = null; this._render();
        } else if (action === 'toggle-ms') {
          const ms = (this._openRock?.milestones || []).find(m => m.id === el.dataset.msId);
          if (ms) { ms.done = !ms.done; this._save(); this._render(); }
        } else if (action === 'del-ms') {
          if (this._openRock) {
            this._openRock.milestones = this._openRock.milestones.filter(m => m.id !== el.dataset.msId);
            this._save(); this._render();
          }
        } else if (action === 'add-ms') {
          const textEl = w.querySelector('#ms-text-input');
          const dateEl = w.querySelector('#ms-date-input');
          const text = textEl?.value.trim();
          if (!text || !this._openRock) return;
          this._openRock.milestones = this._openRock.milestones || [];
          this._openRock.milestones.push({ id: 'ms-' + Date.now(), text, done: false, targetDate: dateEl?.value || '' });
          this._save(); this._render();
        }
      });
    });

    w.querySelector('[data-stop-close]')?.addEventListener('click', e => e.stopPropagation());

    w.querySelectorAll('.rock-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-action]')) return;
        const rock = this._state.rocks.find(r => r.id === card.dataset.rockId);
        if (rock) { this._openRock = rock; this._render(); }
      });
    });

    const modalTitleInput = w.querySelector('.modal-title-input');
    if (modalTitleInput) {
      modalTitleInput.addEventListener('input', e => {
        const rock = this._state.rocks.find(r => r.id === e.target.dataset.rockId);
        if (rock) { rock.title = e.target.value; this._save(); }
      });
    }

    const msTextInput = w.querySelector('#ms-text-input');
    if (msTextInput) {
      msTextInput.focus();
      msTextInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') w.querySelector('[data-action="add-ms"]')?.click();
      });
    }

    w.querySelectorAll('.rock-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        this._dragRock = card.dataset.rockId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        w.querySelectorAll('.fn-col').forEach(c => c.classList.remove('drag-over'));
      });
    });

    w.querySelectorAll('.fn-col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!this._dragRock) return;
        const rock = this._state.rocks.find(r => r.id === this._dragRock);
        if (rock) { rock.functionId = col.dataset.fnId; this._save(); this._render(); }
        this._dragRock = null;
      });
    });
  }
}

customElements.define('app-rocks', AppRocks);
