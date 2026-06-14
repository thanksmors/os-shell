import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';
import { toggleMinimalSettings } from '/shell/app-onboarding.js';

const STATUSES = ['open', 'in-progress', 'closed'];
const PRIORITIES = ['low', 'med', 'high'];
const STATUS_LABEL = { 'open': 'Open', 'in-progress': 'In Progress', 'closed': 'Closed' };
const PRIORITY_RANK = { high: 0, med: 1, low: 2 };

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Only http/https pass through; bare domains get https://; other schemes
// (javascript:, data:, ...) are rejected to '#'.
function safeUrl(u) {
  let s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '#';
    s = 'https://' + s;
  }
  return s;
}

class AppPm extends AppModuleBase {
  constructor() {
    super();
    this._selectedFolderId = null;   // null = All Projects
    this._selectedProjectId = null;
    this._activeTab = 'brief';
    this._addingItem = false;
    this._saveTimer = null;
    // Settings panel: minimal (Replay intro). PM has no other settings today.
    this.addEventListener('os:toggle-settings', () => toggleMinimalSettings(this));
  }

  _collection() { return 'pm-data'; }

  async _load() {
    const saved = await getData('pm-data', this._appId);
    const cfg = this.api?.config || {};
    this._state = saved || { name: cfg.name || 'Projects', folders: [], projects: [], projectData: {} };
  }

  async _save() {
    await setData('pm-data', this._appId, this._state);
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 800);
  }

  _getTitle() { return this._state?.name || 'Projects'; }

  _pd(pid) {
    const d = this._state.projectData[pid] || {};
    return {
      milestones: [], issues: [], actions: [], decisions: [], links: [],
      ...d,
      brief: { problem: '', inScope: '', outOfScope: '', metrics: '', ...(d.brief || {}) },
      roles: { driver: '', approver: '', team: '', ...(d.roles || {}) },
    };
  }

  _setPd(pid, patch) {
    this._state = {
      ...this._state,
      projectData: { ...this._state.projectData, [pid]: { ...this._pd(pid), ...patch } }
    };
  }

  _visibleProjects() {
    const { projects } = this._state;
    if (this._selectedFolderId === null) return projects;
    return projects.filter(p => p.folderId === this._selectedFolderId);
  }

  // --- Render ---
  _render() {
    const { folders, projects } = this._state;
    const visible = this._visibleProjects();
    const selected = projects.find(p => p.id === this._selectedProjectId) || null;

    // Sidebar: folders
    const allActive = this._selectedFolderId === null;
    let folderItems = `<div class="folder-item${allActive ? ' active' : ''}" data-folder="__all__">
      <span class="folder-icon">🗂️</span>
      <span class="folder-name">All Projects</span>
      <span class="folder-count">${projects.length}</span>
    </div>`;
    folders.forEach(f => {
      const count = projects.filter(p => p.folderId === f.id).length;
      folderItems += `<div class="folder-item${this._selectedFolderId === f.id ? ' active' : ''}" data-folder="${esc(f.id)}">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${esc(f.name)}</span>
        <span class="folder-count">${count}</span>
        <button class="folder-del-btn" data-del-folder="${esc(f.id)}" title="Delete folder">✕</button>
      </div>`;
    });

    // Sidebar: project list
    let projItems = '';
    visible.forEach(p => {
      const pd = this._pd(p.id);
      const openIssues = pd.issues.filter(i => i.status !== 'closed').length;
      projItems += `<div class="proj-item${this._selectedProjectId === p.id ? ' active' : ''}" data-project="${esc(p.id)}">
        <span class="proj-item-name">${esc(p.name)}</span>
        ${openIssues ? `<span class="proj-badge">${openIssues}</span>` : ''}
        <button class="proj-del-btn" data-del-project="${esc(p.id)}" title="Delete project">✕</button>
      </div>`;
    });
    if (!visible.length) {
      projItems = `<div class="proj-empty">No projects${this._selectedFolderId ? ' in this folder' : ''} yet</div>`;
    }

    // Right pane
    let mainHtml;
    if (!selected) {
      mainHtml = `<div class="main-empty">
        <span>Select a project, or create one</span>
        <button class="btn-primary" data-action="add-project">+ New Project</button>
      </div>`;
    } else {
      const tabs = [
        ['brief', '📋 Brief'],
        ['roles', '👥 Roles'],
        ['milestones', '🏁 Milestones'],
        ['issues', '🐛 Issues'],
        ['actions', '✅ Action Items'],
        ['decisions', '⚖️ Decisions'],
        ['links', '🔗 Links']
      ].map(([id, label]) =>
        `<button class="tab-btn${this._activeTab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`
      ).join('');

      mainHtml = `
      <div class="main-header">
        <input class="proj-title-input" id="proj-title" value="${esc(selected.name)}">
        <select class="proj-folder-select" id="proj-folder">
          <option value="">No folder</option>
          ${this._state.folders.map(f => `<option value="${esc(f.id)}"${selected.folderId === f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}
        </select>
      </div>
      <div class="tab-bar">${tabs}</div>
      <div class="tab-content">${this._renderTab(selected.id)}</div>`;
    }

    this._wrapper.innerHTML = `
    <div class="pm-root">
      <div class="sidebar">
        <div class="sidebar-toolbar">
          <button class="sb-btn" data-action="add-project" title="New project">+ Project</button>
          <button class="sb-btn" data-action="add-folder" title="New folder">📁+</button>
        </div>
        <div class="folder-list">${folderItems}</div>
        <div class="proj-list">${projItems}</div>
      </div>
      <div class="main-pane">${mainHtml}</div>
    </div>`;

    this._bindEvents();
  }

  _renderTab(pid) {
    const pd = this._pd(pid);
    const today = fmtISO(new Date());

    if (this._activeTab === 'brief') {
      const b = pd.brief;
      const field = (key, label, ph) => `
        <label class="field-label">${label}</label>
        <textarea class="field-textarea" data-brief-field="${key}" placeholder="${ph}">${esc(b[key])}</textarea>`;
      return `<div class="field-stack">
        ${field('problem', 'Problem statement', 'What pain point are we solving, and why now?')}
        ${field('inScope', 'In scope', 'What this project will deliver')}
        ${field('outOfScope', 'Out of scope', 'What we are explicitly NOT doing')}
        ${field('metrics', 'Success metrics', 'How we know we won')}
      </div>`;
    }

    if (this._activeTab === 'roles') {
      const r = pd.roles;
      const field = (key, label, ph) => `
        <label class="field-label">${label}</label>
        <input class="add-input field-input" data-role-field="${key}" placeholder="${ph}" value="${esc(r[key])}">`;
      return `<div class="field-stack">
        ${field('driver', 'Driver (owner)', 'Who pushes this forward day-to-day?')}
        ${field('approver', 'Approver', 'Who signs off on major changes?')}
        ${field('team', 'Core team', 'Who is doing the hands-on building?')}
      </div>`;
    }

    if (this._activeTab === 'milestones') {
      const sorted = [...pd.milestones].sort((a, b) =>
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
      const rows = sorted.map(m => {
        const overdue = m.dueDate && m.dueDate < today && !m.done;
        return `<div class="item-row${m.done ? ' done' : ''}">
          <input type="checkbox" data-toggle="milestone" data-id="${esc(m.id)}" ${m.done ? 'checked' : ''}>
          <span class="item-title">${esc(m.title)}</span>
          ${m.dueDate ? `<span class="item-date${overdue ? ' overdue' : ''}">${esc(m.dueDate)}</span>` : ''}
          <button class="item-del" data-del-item="milestone" data-id="${esc(m.id)}">✕</button>
        </div>`;
      }).join('');
      return `${rows || '<div class="tab-empty">No milestones yet</div>'}
        ${this._addingItem ? `
        <div class="add-form">
          <input class="add-input" id="add-title" placeholder="Milestone title" autofocus>
          <input class="add-input add-date" id="add-date" type="date">
          <button class="btn-primary" data-action="confirm-add">Add</button>
          <button class="btn-plain" data-action="cancel-add">Cancel</button>
        </div>` : `<button class="add-item-btn" data-action="start-add">+ Add milestone</button>`}`;
    }

    if (this._activeTab === 'issues') {
      const sorted = [...pd.issues].sort((a, b) =>
        STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      const rows = sorted.map(i => `
        <div class="item-row${i.status === 'closed' ? ' done' : ''}">
          <button class="pill status-${esc(i.status)}" data-cycle-status="${esc(i.id)}">${STATUS_LABEL[i.status] || i.status}</button>
          <span class="item-title">${esc(i.title)}</span>
          ${i.notes ? `<span class="item-notes" title="${esc(i.notes)}">📝</span>` : ''}
          <button class="pill prio-${esc(i.priority)}" data-cycle-prio="${esc(i.id)}">${esc(i.priority)}</button>
          <button class="item-del" data-del-item="issue" data-id="${esc(i.id)}">✕</button>
        </div>`).join('');
      return `${rows || '<div class="tab-empty">No issues — nice!</div>'}
        ${this._addingItem ? `
        <div class="add-form">
          <input class="add-input" id="add-title" placeholder="Issue title" autofocus>
          <input class="add-input" id="add-notes" placeholder="Notes (optional)">
          <button class="btn-primary" data-action="confirm-add">Add</button>
          <button class="btn-plain" data-action="cancel-add">Cancel</button>
        </div>` : `<button class="add-item-btn" data-action="start-add">+ Add issue</button>`}`;
    }

    if (this._activeTab === 'decisions') {
      const sorted = [...pd.decisions].sort((a, b) =>
        (b.date || '').localeCompare(a.date || ''));
      const rows = sorted.map(d => `<div class="item-row">
        ${d.date ? `<span class="item-date">${esc(d.date)}</span>` : ''}
        <span class="item-title">${esc(d.decision)}${d.rationale ? `<span class="item-rationale"> — ${esc(d.rationale)}</span>` : ''}</span>
        ${d.owner ? `<span class="item-owner">${esc(d.owner)}</span>` : ''}
        <button class="item-del" data-del-item="decision" data-id="${esc(d.id)}">✕</button>
      </div>`).join('');
      return `${rows || '<div class="tab-empty">No decisions logged yet</div>'}
        ${this._addingItem ? `
        <div class="add-form">
          <input class="add-input" id="add-title" placeholder="Decision made" autofocus>
          <input class="add-input" id="add-rationale" placeholder="Rationale (why)">
          <input class="add-input add-owner" id="add-owner" placeholder="Owner">
          <input class="add-input add-date" id="add-date" type="date" value="${today}">
          <button class="btn-primary" data-action="confirm-add">Add</button>
          <button class="btn-plain" data-action="cancel-add">Cancel</button>
        </div>` : `<button class="add-item-btn" data-action="start-add">+ Log decision</button>`}`;
    }

    if (this._activeTab === 'links') {
      const rows = pd.links.map(l => `<div class="item-row">
        <a class="item-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a>
        <span class="item-url">${esc(l.url)}</span>
        <button class="item-del" data-del-item="link" data-id="${esc(l.id)}">✕</button>
      </div>`).join('');
      return `${rows || '<div class="tab-empty">No links yet — add design files, repos, docs…</div>'}
        ${this._addingItem ? `
        <div class="add-form">
          <input class="add-input" id="add-title" placeholder="Label (e.g. Figma)" autofocus>
          <input class="add-input" id="add-url" placeholder="https://...">
          <button class="btn-primary" data-action="confirm-add">Add</button>
          <button class="btn-plain" data-action="cancel-add">Cancel</button>
        </div>` : `<button class="add-item-btn" data-action="start-add">+ Add link</button>`}`;
    }

    // actions
    const sorted = [...pd.actions].sort((a, b) =>
      (a.done - b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const rows = sorted.map(a => {
      const overdue = a.dueDate && a.dueDate < today && !a.done;
      return `<div class="item-row${a.done ? ' done' : ''}">
        <input type="checkbox" data-toggle="action" data-id="${esc(a.id)}" ${a.done ? 'checked' : ''}>
        <span class="item-title">${esc(a.title)}</span>
        ${a.owner ? `<span class="item-owner">${esc(a.owner)}</span>` : ''}
        ${a.dueDate ? `<span class="item-date${overdue ? ' overdue' : ''}">${esc(a.dueDate)}</span>` : ''}
        <button class="item-del" data-del-item="action" data-id="${esc(a.id)}">✕</button>
      </div>`;
    }).join('');
    return `${rows || '<div class="tab-empty">No action items yet</div>'}
      ${this._addingItem ? `
      <div class="add-form">
        <input class="add-input" id="add-title" placeholder="Action item" autofocus>
        <input class="add-input add-owner" id="add-owner" placeholder="Owner">
        <input class="add-input add-date" id="add-date" type="date">
        <button class="btn-primary" data-action="confirm-add">Add</button>
        <button class="btn-plain" data-action="cancel-add">Cancel</button>
      </div>` : `<button class="add-item-btn" data-action="start-add">+ Add action item</button>`}`;
  }

  _bindEvents() {
    const w = this._wrapper;

    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        this._handleAction(el.dataset.action);
      });
    });

    // Folder selection
    w.querySelectorAll('.folder-item[data-folder]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.folder-del-btn')) return;
        this._selectedFolderId = el.dataset.folder === '__all__' ? null : el.dataset.folder;
        this._render();
      });
    });
    w.querySelectorAll('[data-del-folder]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const f = this._state.folders.find(x => x.id === btn.dataset.delFolder);
        if (!f || !confirm(`Delete folder "${f.name}"? Projects inside are kept.`)) return;
        this._state = {
          ...this._state,
          folders: this._state.folders.filter(x => x.id !== f.id),
          projects: this._state.projects.map(p => p.folderId === f.id ? { ...p, folderId: null } : p)
        };
        if (this._selectedFolderId === f.id) this._selectedFolderId = null;
        this._save();
        this._render();
      });
    });

    // Project selection / delete
    w.querySelectorAll('.proj-item[data-project]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.proj-del-btn')) return;
        this._selectedProjectId = el.dataset.project;
        this._addingItem = false;
        this._render();
      });
    });
    w.querySelectorAll('[data-del-project]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const p = this._state.projects.find(x => x.id === btn.dataset.delProject);
        if (!p || !confirm(`Delete project "${p.name}" and all its data?`)) return;
        const projectData = { ...this._state.projectData };
        delete projectData[p.id];
        this._state = {
          ...this._state,
          projects: this._state.projects.filter(x => x.id !== p.id),
          projectData
        };
        if (this._selectedProjectId === p.id) this._selectedProjectId = null;
        this._save();
        this._render();
      });
    });

    // Tabs
    w.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        this._addingItem = false;
        this._render();
      });
    });

    // Project title inline edit (debounced)
    const titleInput = w.querySelector('#proj-title');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        const pid = this._selectedProjectId;
        this._state = {
          ...this._state,
          projects: this._state.projects.map(p => p.id === pid ? { ...p, name: titleInput.value } : p)
        };
        this._scheduleSave();
        const item = w.querySelector(`.proj-item[data-project="${pid}"] .proj-item-name`);
        if (item) item.textContent = titleInput.value;
      });
    }

    // Move project to folder
    const folderSelect = w.querySelector('#proj-folder');
    if (folderSelect) {
      folderSelect.addEventListener('change', () => {
        const pid = this._selectedProjectId;
        this._state = {
          ...this._state,
          projects: this._state.projects.map(p => p.id === pid ? { ...p, folderId: folderSelect.value || null } : p)
        };
        this._save();
        this._render();
      });
    }

    // Brief / Roles free-text autosave (debounced, no re-render — preserves focus)
    w.querySelectorAll('[data-brief-field]').forEach(ta => {
      ta.addEventListener('input', () => {
        const pid = this._selectedProjectId;
        this._setPd(pid, { brief: { ...this._pd(pid).brief, [ta.dataset.briefField]: ta.value } });
        this._scheduleSave();
      });
    });
    w.querySelectorAll('[data-role-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const pid = this._selectedProjectId;
        this._setPd(pid, { roles: { ...this._pd(pid).roles, [inp.dataset.roleField]: inp.value } });
        this._scheduleSave();
      });
    });

    // Checkboxes (milestones / actions)
    w.querySelectorAll('input[data-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        const pid = this._selectedProjectId;
        const key = cb.dataset.toggle === 'milestone' ? 'milestones' : 'actions';
        this._setPd(pid, {
          [key]: this._pd(pid)[key].map(x => x.id === cb.dataset.id ? { ...x, done: cb.checked } : x)
        });
        this._save();
        this._render();
      });
    });

    // Issue status / priority cycling
    w.querySelectorAll('[data-cycle-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = this._selectedProjectId;
        this._setPd(pid, {
          issues: this._pd(pid).issues.map(i => i.id === btn.dataset.cycleStatus
            ? { ...i, status: STATUSES[(STATUSES.indexOf(i.status) + 1) % STATUSES.length] } : i)
        });
        this._save();
        this._render();
      });
    });
    w.querySelectorAll('[data-cycle-prio]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = this._selectedProjectId;
        this._setPd(pid, {
          issues: this._pd(pid).issues.map(i => i.id === btn.dataset.cyclePrio
            ? { ...i, priority: PRIORITIES[(PRIORITIES.indexOf(i.priority) + 1) % PRIORITIES.length] } : i)
        });
        this._save();
        this._render();
      });
    });

    // Item delete
    w.querySelectorAll('[data-del-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = this._selectedProjectId;
        const key = { milestone: 'milestones', issue: 'issues', action: 'actions', decision: 'decisions', link: 'links' }[btn.dataset.delItem];
        this._setPd(pid, { [key]: this._pd(pid)[key].filter(x => x.id !== btn.dataset.id) });
        this._save();
        this._render();
      });
    });

    // Enter submits the add form
    const addTitle = w.querySelector('#add-title');
    if (addTitle) {
      addTitle.focus();
      addTitle.addEventListener('keydown', e => {
        if (e.key === 'Enter') this._confirmAdd();
        if (e.key === 'Escape') { this._addingItem = false; this._render(); }
      });
    }
  }

  _handleAction(action) {
    if (action === 'add-project') {
      const name = prompt('Project name:');
      if (!name?.trim()) return;
      const newProject = {
        id: 'prj-' + Date.now(),
        name: name.trim(),
        folderId: this._selectedFolderId,
        icon: '🎯'
      };
      this._state = { ...this._state, projects: [...this._state.projects, newProject] };
      this._selectedProjectId = newProject.id;
      this._save();
      this._render();
    } else if (action === 'add-folder') {
      const name = prompt('Folder name:');
      if (!name?.trim()) return;
      this._state = {
        ...this._state,
        folders: [...this._state.folders, { id: 'f-' + Date.now(), name: name.trim() }]
      };
      this._save();
      this._render();
    } else if (action === 'start-add') {
      this._addingItem = true;
      this._render();
    } else if (action === 'cancel-add') {
      this._addingItem = false;
      this._render();
    } else if (action === 'confirm-add') {
      this._confirmAdd();
    }
  }

  _confirmAdd() {
    const w = this._wrapper;
    const title = w.querySelector('#add-title')?.value?.trim();
    if (!title) { w.querySelector('#add-title')?.focus(); return; }
    const pid = this._selectedProjectId;
    const id = 'itm-' + Date.now();

    if (this._activeTab === 'milestones') {
      const dueDate = w.querySelector('#add-date')?.value || '';
      this._setPd(pid, { milestones: [...this._pd(pid).milestones, { id, title, dueDate, done: false }] });
    } else if (this._activeTab === 'issues') {
      const notes = w.querySelector('#add-notes')?.value?.trim() || '';
      this._setPd(pid, { issues: [...this._pd(pid).issues, { id, title, status: 'open', priority: 'med', notes }] });
    } else if (this._activeTab === 'decisions') {
      const rationale = w.querySelector('#add-rationale')?.value?.trim() || '';
      const owner = w.querySelector('#add-owner')?.value?.trim() || '';
      const date = w.querySelector('#add-date')?.value || fmtISO(new Date());
      this._setPd(pid, { decisions: [...this._pd(pid).decisions, { id, date, decision: title, rationale, owner }] });
    } else if (this._activeTab === 'links') {
      const rawUrl = w.querySelector('#add-url')?.value?.trim() || '';
      const url = safeUrl(rawUrl);
      if (!rawUrl || url === '#') { w.querySelector('#add-url')?.focus(); return; }
      this._setPd(pid, { links: [...this._pd(pid).links, { id, label: title, url }] });
    } else if (this._activeTab === 'actions') {
      const owner = w.querySelector('#add-owner')?.value?.trim() || '';
      const dueDate = w.querySelector('#add-date')?.value || '';
      this._setPd(pid, { actions: [...this._pd(pid).actions, { id, title, owner, dueDate, done: false }] });
    }
    this._addingItem = false;
    this._save();
    this._render();
  }
}

customElements.define('app-pm', AppPm);
