import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';
import { getCollection, addItem, subscribeCollections } from '/modules/data/api.js';
import { showEmojiPicker } from '/shell/emoji-picker.js';

const STATUSES = ['active', 'on-hold', 'done'];
const STATUS_LABELS = { active: 'Active', 'on-hold': 'On Hold', done: 'Done' };

class AppProjects extends AppModuleBase {
  constructor() {
    super();
    this._settingsOpen = false;
    this._expanded = {};      // projectItemId → bool
    this._assigneeOpen = null; // projectItemId of open assignee dropdown
    this._unsubData = null;
  }

  _collection() { return 'projects'; }
  _getTitle() { return this._state?.name || 'Projects'; }

  async _load() {
    const cfg = this.api?.config || {};
    const saved = await getData('projects', this._appId);
    if (!saved) {
      this._state = {
        name: cfg.name || 'Projects',
        projectMeta: {},   // projectItemId → { status, dueDate, notes, assignees: [] }
        memberMeta: {},    // memberItemId → { } (reserved for future extensions)
      };
      await this._save();
    } else {
      this._state = saved;
      if (!this._state.projectMeta) this._state.projectMeta = {};
      if (!this._state.memberMeta)  this._state.memberMeta  = {};
    }
  }

  async _save() {
    await setData('projects', this._appId, this._state);
  }

  async connectedCallback() {
    await super.connectedCallback();
    // Re-render when Data collections change (team members added/removed elsewhere)
    this._unsubData = subscribeCollections(() => this._render());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubData?.();
  }

  _render() {
    const teamCol  = this._collectionFor('teamCollection');
    const projCol  = this._collectionFor('projectsCollection');

    // Read live from Data collections
    getCollection(projCol).then(pc => {
      getCollection(teamCol).then(tc => {
        this._renderWith(pc?.items || [], tc?.items || []);
      });
    });
  }

  _renderWith(projects, team) {
    const name = this._state.name;
    const curIcon = this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '📋';

    const projectCards = projects.map(p => {
      const meta = this._state.projectMeta[p.id] || {};
      const status = meta.status || 'active';
      const open = this._expanded[p.id] !== false;
      const assignees = (meta.assignees || [])
        .map(aid => team.find(m => m.id === aid))
        .filter(Boolean);

      const assigneeChips = assignees.map(m => `
        <span class="assignee-chip">
          <span>${m.icon || '👤'}</span>
          <span>${this._esc(m.label)}</span>
          <button class="assignee-chip-del" data-action="remove-assignee" data-pid="${p.id}" data-mid="${m.id}">✕</button>
        </span>
      `).join('');

      const unassigned = team.filter(m => !(meta.assignees || []).includes(m.id));
      const assigneeMenuItems = unassigned.map(m => `
        <div class="assignee-option" data-action="add-assignee" data-pid="${p.id}" data-mid="${m.id}">
          <span class="assignee-option-icon">${m.icon || '👤'}</span>
          <span>${this._esc(m.label)}</span>
        </div>
      `).join('');

      return `
        <div class="project-card" data-pid="${p.id}">
          <div class="project-row" data-action="toggle-project" data-pid="${p.id}">
            <span class="project-chevron ${open ? 'open' : ''}">▶</span>
            <input class="project-name" data-action="rename-project" data-pid="${p.id}"
              value="${this._esc(p.label)}" placeholder="Project name…" />
            <span class="project-status ${status}" data-action="cycle-status" data-pid="${p.id}">
              ${STATUS_LABELS[status]}
            </span>
            <button class="project-del" data-action="del-project" data-pid="${p.id}" title="Delete">✕</button>
          </div>
          ${open ? `
            <div class="project-detail">
              <div class="detail-row">
                <span class="detail-label">Due</span>
                <span class="detail-value">
                  <input class="due-input" type="date" data-action="set-due" data-pid="${p.id}"
                    value="${this._esc(meta.dueDate || '')}" />
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Assignees</span>
                <span class="detail-value">
                  <div class="assignees">
                    ${assigneeChips}
                    ${unassigned.length ? `
                      <div class="assignee-dropdown" data-pid="${p.id}">
                        <button class="assignee-add" data-action="toggle-assignee-menu" data-pid="${p.id}">＋ Add</button>
                        ${this._assigneeOpen === p.id ? `
                          <div class="assignee-menu">${assigneeMenuItems || '<div class="assignee-option" style="opacity:.5;cursor:default">No more members</div>'}</div>
                        ` : ''}
                      </div>
                    ` : ''}
                  </div>
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Notes</span>
                <span class="detail-value">
                  <textarea class="notes-input" data-action="set-notes" data-pid="${p.id}"
                    placeholder="Notes…">${this._esc(meta.notes || '')}</textarea>
                </span>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    this._wrapper.innerHTML = `
      <div class="header">
        <input class="board-title" value="${this._esc(name)}" placeholder="Board name…" />
        <button class="header-btn" data-action="toggle-settings" title="Settings">⚙️</button>
      </div>
      ${this._settingsOpen ? `
        <div class="settings-panel">
          <div class="settings-row">
            <label class="settings-label">Name</label>
            <input class="settings-input" id="settings-name" value="${this._esc(name)}" />
          </div>
          <div class="settings-row">
            <label class="settings-label">Icon</label>
            <button class="icon-pick-btn" data-action="pick-icon" title="Pick icon">
              <span id="settings-icon-preview">${this._esc(curIcon)}</span>
              <span style="font-size:10px;opacity:.5">▾</span>
            </button>
            <input type="hidden" id="settings-icon" value="${this._esc(curIcon)}" />
          </div>
          <div class="settings-row" style="justify-content:flex-end;gap:8px;">
            <button class="settings-cancel" data-action="toggle-settings">Cancel</button>
            <button class="settings-save" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="body" id="body">
        ${projects.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <div>No projects yet — add one below</div>
          </div>
        ` : projectCards}
      </div>
      <div style="padding:0 16px 14px;">
        <div class="add-form">
          <input class="add-input" id="add-input" placeholder="New project name…" />
          <button class="add-btn" id="add-btn">Add</button>
        </div>
      </div>
    `;

    this._bindEvents(projects, team);
  }

  _bindEvents(projects, team) {
    const root = this.shadowRoot;
    const projCol = this._collectionFor('projectsCollection');

    // Board title rename
    root.querySelector('.board-title')?.addEventListener('input', async e => {
      this._state.name = e.target.value || 'Projects';
      if (this.api) this.api.setTitle(this._state.name);
      await this._save();
    });

    // Add project
    const addInput = root.querySelector('#add-input');
    const doAdd = async () => {
      const label = addInput?.value.trim();
      if (!label) return;
      const item = await addItem(projCol, { label });
      this._state.projectMeta[item.id] = { status: 'active', assignees: [] };
      await this._save();
      addInput.value = '';
      this._render();
      root.querySelector('#add-input')?.focus();
    };
    root.querySelector('#add-btn')?.addEventListener('click', doAdd);
    addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    // Delegated events on body
    root.querySelector('#body')?.addEventListener('click', async e => {
      const el = e.target.closest('[data-action]');
      if (!el) { this._assigneeOpen = null; this._render(); return; }
      const action = el.dataset.action;
      const pid = el.dataset.pid;

      if (action === 'toggle-project') {
        if (e.target.closest('.project-name') || e.target.closest('.project-del') ||
            e.target.closest('.project-status')) return;
        this._expanded[pid] = !(this._expanded[pid] !== false);
        this._assigneeOpen = null;
        this._render();

      } else if (action === 'del-project') {
        e.stopPropagation();
        // Remove from Data collection
        const { deleteItem } = await import('/modules/data/api.js');
        await deleteItem(projCol, pid);
        delete this._state.projectMeta[pid];
        await this._save();
        this._render();

      } else if (action === 'cycle-status') {
        e.stopPropagation();
        const meta = this._state.projectMeta[pid] || {};
        const idx = STATUSES.indexOf(meta.status || 'active');
        meta.status = STATUSES[(idx + 1) % STATUSES.length];
        this._state.projectMeta[pid] = meta;
        await this._save();
        this._render();

      } else if (action === 'toggle-assignee-menu') {
        e.stopPropagation();
        this._assigneeOpen = this._assigneeOpen === pid ? null : pid;
        this._render();

      } else if (action === 'add-assignee') {
        e.stopPropagation();
        const mid = el.dataset.mid;
        const meta = this._state.projectMeta[pid] || {};
        meta.assignees = [...(meta.assignees || []), mid];
        this._state.projectMeta[pid] = meta;
        this._assigneeOpen = null;
        await this._save();
        this._render();

      } else if (action === 'remove-assignee') {
        e.stopPropagation();
        const mid = el.dataset.mid;
        const meta = this._state.projectMeta[pid] || {};
        meta.assignees = (meta.assignees || []).filter(id => id !== mid);
        this._state.projectMeta[pid] = meta;
        await this._save();
        this._render();

      } else if (action === 'toggle-settings') {
        this._settingsOpen = !this._settingsOpen;
        this._render();

      } else if (action === 'save-settings') {
        const newName = root.querySelector('#settings-name')?.value.trim() || this._state.name;
        const newIcon = root.querySelector('#settings-icon')?.value.trim() || '📋';
        this._state.name = newName;
        await this._save();
        if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
        else if (this.api?.setTitle) this.api.setTitle(newName);
        this._settingsOpen = false;
        this._render();

      } else if (action === 'pick-icon') {
        const cur = root.querySelector('#settings-icon')?.value || '📋';
        showEmojiPicker(el, cur, emoji => {
          const hidden = root.querySelector('#settings-icon');
          const preview = root.querySelector('#settings-icon-preview');
          if (hidden) hidden.value = emoji;
          if (preview) preview.textContent = emoji;
        });
      }
    });

    // Rename project (blur on name input)
    root.querySelectorAll('.project-name').forEach(input => {
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('blur', async () => {
        const pid = input.dataset.pid;
        const label = input.value.trim();
        if (!label) return;
        const { updateItem } = await import('/modules/data/api.js');
        await updateItem(projCol, pid, { label });
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    });

    // Due date
    root.querySelectorAll('.due-input').forEach(input => {
      input.addEventListener('change', async () => {
        const pid = input.dataset.pid;
        const meta = this._state.projectMeta[pid] || {};
        meta.dueDate = input.value;
        this._state.projectMeta[pid] = meta;
        await this._save();
      });
    });

    // Notes
    root.querySelectorAll('.notes-input').forEach(textarea => {
      textarea.addEventListener('input', async () => {
        const pid = textarea.dataset.pid;
        const meta = this._state.projectMeta[pid] || {};
        meta.notes = textarea.value;
        this._state.projectMeta[pid] = meta;
        await this._save();
      });
    });

    // Close assignee menu on outside click
    root.querySelector('#body')?.addEventListener('click', e => {
      if (!e.target.closest('[data-action="toggle-assignee-menu"]') &&
          !e.target.closest('.assignee-menu')) {
        if (this._assigneeOpen) { this._assigneeOpen = null; this._render(); }
      }
    });
  }
}

customElements.define('app-projects', AppProjects);
