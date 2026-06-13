import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const TABS = [
  { id: 'goodnews',  label: 'Good News',  icon: '🎉' },
  { id: 'scorecard', label: 'Scorecard',  icon: '📊' },
  { id: 'rocks',     label: 'Rocks',      icon: '🪨' },
  { id: 'headlines', label: 'Headlines',  icon: '📰' },
  { id: 'todos',     label: 'To-Do',      icon: '✅' },
  { id: 'issues',    label: 'Issues',     icon: '🔥' },
];

const ISSUE_STATUSES = ['open', 'discussed', 'done', 'dropped'];
const ISSUE_STATUS_LABEL = { open: 'Open', discussed: 'Discussed', done: 'Done', dropped: 'Dropped' };

class AppL10 extends AppModuleBase {
  constructor() {
    super();
    this._activeMeetingId = null;
    this._activeTab = 'goodnews';
    this._showAllTodos = false;
    this._settingsOpen = false;
    this._saveTimer = null;
    this._eventsBound = false;
    this.addEventListener('os:toggle-settings', () => {
      this._settingsOpen = !this._settingsOpen;
      this._render();
    });
  }

  _collection() { return 'l10'; }
  _getTitle() { return this._state?.name || 'L10'; }

  async _load() {
    const saved = await getData('l10', this._appId);
    const cfg = this.api?.config || {};
    this._state = saved || {
      name: cfg.name || 'L10',
      icon: '🪨',
      scorecard: [],
      rocks: [],
      issues: [],
      todos: [],
      meetings: [],
    };
    if (this._state.meetings.length > 0 && !this._activeMeetingId) {
      this._activeMeetingId = this._state.meetings[this._state.meetings.length - 1].id;
    }
  }

  async _save() {
    await setData('l10', this._appId, this._state);
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 800);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    const activeMeeting = this._state.meetings.find(m => m.id === this._activeMeetingId) || null;
    this._wrapper.innerHTML = `
      <div class="l10-layout">
        ${this._settingsOpen ? this._renderSettings() : ''}
        <aside class="l10-sidebar">
          <div class="l10-sidebar-header">
            <span class="l10-team-name">${esc(this._state.name)}</span>
            <button class="l10-new-btn" data-action="new-meeting" title="New L10 Meeting">+</button>
          </div>
          <div class="l10-meetings-list">
            ${this._renderMeetingsList()}
          </div>
        </aside>
        <div class="l10-main">
          ${activeMeeting ? this._renderMeetingMain(activeMeeting) : this._renderEmpty()}
        </div>
      </div>
    `;
    this._bindEvents();
  }

  _renderSettings() {
    return `
      <div class="l10-settings-overlay">
        <div class="l10-settings-panel">
          <div class="l10-settings-title">Board Settings</div>
          <div class="l10-settings-row">
            <label class="l10-settings-label">Team Name</label>
            <input class="l10-settings-input" id="s-name" value="${esc(this._state.name)}" />
          </div>
          <div class="l10-settings-actions">
            <button class="l10-btn-ghost" data-action="close-settings">Cancel</button>
            <button class="l10-btn-primary" data-action="save-settings">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderMeetingsList() {
    const meetings = [...this._state.meetings].reverse();
    if (!meetings.length) {
      return `<div class="l10-meetings-empty">No meetings yet.<br>Hit + to start one.</div>`;
    }
    return meetings.map(m => {
      const isActive = m.id === this._activeMeetingId;
      const ratingHtml = m.rating ? `<span class="l10-meeting-rating">${m.rating}</span>` : '';
      return `
        <div class="l10-meeting-item${isActive ? ' active' : ''}" data-action="select-meeting" data-mid="${esc(m.id)}">
          <span class="l10-meeting-item-date">${fmtDateShort(m.date)}</span>
          ${ratingHtml}
        </div>
      `;
    }).join('');
  }

  _renderEmpty() {
    return `
      <div class="l10-empty">
        <div class="l10-empty-icon">🪨</div>
        <div class="l10-empty-title">No meetings yet</div>
        <div class="l10-empty-sub">Create your first L10 meeting to get started.</div>
        <button class="l10-btn-primary" data-action="new-meeting">+ New L10 Meeting</button>
      </div>
    `;
  }

  _renderMeetingMain(meeting) {
    return `
      <div class="l10-meeting-header">
        <div class="l10-meeting-header-top">
          <div class="l10-meeting-date">${fmtDateLong(meeting.date)}</div>
          <div class="l10-rating-wrap">
            <span class="l10-rating-label">Meeting rating</span>
            <input class="l10-rating-input" id="meeting-rating" type="number" min="1" max="10"
              value="${esc(meeting.rating || '')}" placeholder="–" />
            <span class="l10-rating-suffix">/ 10</span>
          </div>
        </div>
        <div class="l10-attendees">
          ${(meeting.attendees || []).map((a, i) => `
            <span class="l10-attendee-chip">
              ${esc(a)}<button class="l10-chip-del" data-action="del-attendee" data-idx="${i}">×</button>
            </span>
          `).join('')}
          <input class="l10-attendee-input" id="attendee-input" placeholder="+ attendee" />
        </div>
      </div>
      <div class="l10-tab-bar">
        ${TABS.map(t => `
          <button class="l10-tab-btn${this._activeTab === t.id ? ' active' : ''}"
            data-action="switch-tab" data-tab="${t.id}">
            ${t.icon} ${t.label}
          </button>
        `).join('')}
      </div>
      <div class="l10-tab-content">
        ${this._renderTab(meeting)}
      </div>
    `;
  }

  _renderTab(meeting) {
    switch (this._activeTab) {
      case 'goodnews':  return this._renderGoodNews(meeting);
      case 'scorecard': return this._renderScorecard(meeting);
      case 'rocks':     return this._renderRocks(meeting);
      case 'headlines': return this._renderHeadlines(meeting);
      case 'todos':     return this._renderTodos(meeting);
      case 'issues':    return this._renderIssues();
      default:          return '';
    }
  }

  // ─── Good News ─────────────────────────────────────────────────────────────

  _renderGoodNews(meeting) {
    const items = meeting.goodNews || [];
    const renderSection = (label, type) => {
      const list = items.filter(i => i.type === type);
      return `
        <div class="l10-section">
          <div class="l10-section-title">${label}</div>
          <div class="l10-item-list">
            ${list.length ? list.map(item => `
              <div class="l10-list-row">
                <span class="l10-list-text">${esc(item.text)}</span>
                ${item.author ? `<span class="l10-list-meta">${esc(item.author)}</span>` : ''}
                <button class="l10-item-del" data-action="del-goodnews" data-gnid="${esc(item.id)}">✕</button>
              </div>
            `).join('') : `<div class="l10-section-empty">Nothing shared yet</div>`}
          </div>
          <div class="l10-add-row">
            <input class="l10-add-input" placeholder="Share good news…" data-gn-text="${type}" />
            <input class="l10-add-input l10-add-sm" placeholder="Who?" data-gn-author="${type}" />
            <button class="l10-add-btn" data-action="add-goodnews" data-type="${type}">Add</button>
          </div>
        </div>
      `;
    };
    return renderSection('🙋 Personal', 'personal') + renderSection('💼 Professional', 'professional');
  }

  // ─── Scorecard ─────────────────────────────────────────────────────────────

  _renderScorecard(meeting) {
    const metrics = this._state.scorecard;
    const recentMeetings = [...this._state.meetings].slice(-13);
    const noMeetings = recentMeetings.length === 0;

    return `
      <div class="l10-scorecard-wrap">
        <div class="l10-scorecard-scroll">
          <table class="l10-sc-table">
            <thead>
              <tr>
                <th class="l10-sc-th l10-sc-metric-col">Metric</th>
                <th class="l10-sc-th l10-sc-narrow-col">Goal</th>
                <th class="l10-sc-th l10-sc-narrow-col">Owner</th>
                ${recentMeetings.map(m => `
                  <th class="l10-sc-th l10-sc-week-col${m.id === this._activeMeetingId ? ' current' : ''}">
                    ${fmtDateShort(m.date)}
                  </th>
                `).join('')}
                <th class="l10-sc-th l10-sc-del-col"></th>
              </tr>
            </thead>
            <tbody>
              ${metrics.length ? metrics.map(metric => `
                <tr class="l10-sc-row">
                  <td><input class="l10-sc-input" value="${esc(metric.label)}"
                    data-action="edit-metric-label" data-scid="${esc(metric.id)}" /></td>
                  <td><input class="l10-sc-input" value="${esc(metric.goal || '')}"
                    data-action="edit-metric-goal" data-scid="${esc(metric.id)}" placeholder="Goal" /></td>
                  <td><input class="l10-sc-input" value="${esc(metric.owner || '')}"
                    data-action="edit-metric-owner" data-scid="${esc(metric.id)}" placeholder="Owner" /></td>
                  ${recentMeetings.map(m => {
                    const checks = m.scorecardChecks || {};
                    const check = checks[metric.id] || {};
                    const onTrack = check.onTrack;
                    const val = check.value || '';
                    const isCurrent = m.id === this._activeMeetingId;
                    const trackClass = onTrack === true ? ' track-on' : onTrack === false ? ' track-off' : '';
                    return `
                      <td class="l10-sc-cell${isCurrent ? ' current' : ''}">
                        <button class="l10-sc-track${trackClass}"
                          data-action="${isCurrent ? 'toggle-sc-track' : ''}"
                          data-scid="${esc(metric.id)}" data-mid="${esc(m.id)}"
                          ${!isCurrent ? 'disabled' : ''}>
                          ${onTrack === true ? '✓' : onTrack === false ? '✗' : '–'}
                        </button>
                        ${isCurrent
                          ? `<input class="l10-sc-val" value="${esc(val)}" placeholder="value"
                              data-action="edit-sc-val" data-scid="${esc(metric.id)}" />`
                          : val ? `<span class="l10-sc-val-ro">${esc(val)}</span>` : ''}
                      </td>
                    `;
                  }).join('')}
                  <td><button class="l10-item-del" data-action="del-metric" data-scid="${esc(metric.id)}">✕</button></td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="${3 + recentMeetings.length + 1}" class="l10-sc-empty">
                    No metrics yet — add one below
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        <div class="l10-add-row">
          <input class="l10-add-input" id="new-metric-label" placeholder="Metric name…" />
          <input class="l10-add-input l10-add-sm" id="new-metric-goal" placeholder="Goal" />
          <input class="l10-add-input l10-add-sm" id="new-metric-owner" placeholder="Owner" />
          <button class="l10-add-btn" data-action="add-metric">Add Metric</button>
        </div>
      </div>
    `;
  }

  // ─── Rocks ─────────────────────────────────────────────────────────────────

  _renderRocks(meeting) {
    const rocks = this._state.rocks;
    const rockChecks = meeting.rockChecks || {};
    const active = rocks.filter(r => r.status !== 'done');
    const done = rocks.filter(r => r.status === 'done');

    const renderRock = (rock) => {
      const check = rockChecks[rock.id];
      const onTrack = check?.onTrack;
      const trackClass = onTrack === true ? ' track-on' : onTrack === false ? ' track-off' : '';
      return `
        <div class="l10-rock-row${rock.status === 'done' ? ' done' : ''}">
          <button class="l10-track-pill${trackClass}"
            data-action="toggle-rock-track" data-rid="${esc(rock.id)}">
            ${onTrack === true ? '✓ On Track' : onTrack === false ? '✗ Off Track' : '? Check'}
          </button>
          <div class="l10-rock-body">
            <input class="l10-rock-label-input" value="${esc(rock.label)}"
              data-action="edit-rock-label" data-rid="${esc(rock.id)}" />
            <div class="l10-rock-meta">
              <input class="l10-rock-meta-input" value="${esc(rock.owner || '')}" placeholder="Owner"
                data-action="edit-rock-owner" data-rid="${esc(rock.id)}" />
              <input class="l10-rock-meta-input" value="${esc(rock.quarter || '')}" placeholder="Quarter"
                data-action="edit-rock-quarter" data-rid="${esc(rock.id)}" />
            </div>
          </div>
          <div class="l10-rock-actions">
            <button class="l10-done-btn${rock.status === 'done' ? ' active' : ''}"
              data-action="toggle-rock-done" data-rid="${esc(rock.id)}" title="Mark complete">✓</button>
            <button class="l10-item-del" data-action="del-rock" data-rid="${esc(rock.id)}">✕</button>
          </div>
        </div>
      `;
    };

    return `
      <div class="l10-section">
        <div class="l10-item-list">
          ${active.length ? active.map(renderRock).join('') : `<div class="l10-section-empty">No active rocks — add some below</div>`}
        </div>
        <div class="l10-add-row">
          <input class="l10-add-input" id="new-rock-label" placeholder="Rock name…" />
          <input class="l10-add-input l10-add-sm" id="new-rock-owner" placeholder="Owner" />
          <input class="l10-add-input l10-add-sm" id="new-rock-quarter" placeholder="Quarter (e.g. Q3 2026)" />
          <button class="l10-add-btn" data-action="add-rock">Add Rock</button>
        </div>
        ${done.length ? `
          <details class="l10-collapsed-section">
            <summary class="l10-collapsed-summary">Completed (${done.length})</summary>
            <div class="l10-item-list">${done.map(renderRock).join('')}</div>
          </details>
        ` : ''}
      </div>
    `;
  }

  // ─── Headlines ─────────────────────────────────────────────────────────────

  _renderHeadlines(meeting) {
    const items = meeting.headlines || [];
    return `
      <div class="l10-section">
        <div class="l10-section-title">Customer & Employee Headlines</div>
        <div class="l10-item-list">
          ${items.length ? items.map(item => `
            <div class="l10-list-row">
              <span class="l10-hl-badge hl-${esc(item.type)}">${item.type === 'customer' ? 'Customer' : 'Employee'}</span>
              <span class="l10-list-text">${esc(item.text)}</span>
              <button class="l10-item-del" data-action="del-headline" data-hlid="${esc(item.id)}">✕</button>
            </div>
          `).join('') : `<div class="l10-section-empty">No headlines this week</div>`}
        </div>
        <div class="l10-add-row">
          <select class="l10-select" id="new-hl-type">
            <option value="customer">Customer</option>
            <option value="employee">Employee</option>
          </select>
          <input class="l10-add-input" id="new-headline" placeholder="Headline…" />
          <button class="l10-add-btn" data-action="add-headline">Add</button>
        </div>
      </div>
    `;
  }

  // ─── To-Do ─────────────────────────────────────────────────────────────────

  _renderTodos(meeting) {
    const todos = this._state.todos;
    const all = this._showAllTodos;
    const visible = all ? todos : todos.filter(t => !t.done);
    const sorted = [
      ...visible.filter(t => !t.done).sort((a, b) => a.createdAt - b.createdAt),
      ...visible.filter(t => t.done).sort((a, b) => b.createdAt - a.createdAt),
    ];

    return `
      <div class="l10-section">
        <div class="l10-section-header">
          <div class="l10-section-title">Action Items</div>
          <button class="l10-view-toggle${all ? ' active' : ''}" data-action="toggle-all-todos">
            ${all ? '📋 Open only' : '📋 Show all'}
          </button>
        </div>
        <div class="l10-item-list">
          ${sorted.length ? sorted.map(todo => `
            <div class="l10-todo-row${todo.done ? ' done' : ''}">
              <button class="l10-check-box${todo.done ? ' checked' : ''}"
                data-action="toggle-todo" data-tid="${esc(todo.id)}">
                ${todo.done ? '✓' : ''}
              </button>
              <input class="l10-todo-text${todo.done ? ' done' : ''}" value="${esc(todo.label)}"
                data-action="edit-todo" data-tid="${esc(todo.id)}" />
              <input class="l10-todo-owner" value="${esc(todo.owner || '')}" placeholder="Owner"
                data-action="edit-todo-owner" data-tid="${esc(todo.id)}" />
              <input class="l10-todo-date" type="date" value="${esc(todo.dueDate || '')}"
                data-action="edit-todo-date" data-tid="${esc(todo.id)}" />
              <button class="l10-item-del" data-action="del-todo" data-tid="${esc(todo.id)}">✕</button>
            </div>
          `).join('') : `
            <div class="l10-section-empty">
              ${all ? 'No to-dos yet' : 'All items done! 🎉'}
            </div>
          `}
        </div>
        <div class="l10-add-row">
          <input class="l10-add-input" id="new-todo-label" placeholder="To-do item…" />
          <input class="l10-add-input l10-add-sm" id="new-todo-owner" placeholder="Owner" />
          <input class="l10-add-date" type="date" id="new-todo-due" />
          <button class="l10-add-btn" data-action="add-todo">Add</button>
        </div>
      </div>
    `;
  }

  // ─── Issues ────────────────────────────────────────────────────────────────

  _renderIssues() {
    const issues = this._state.issues;
    const open = issues.filter(i => i.status !== 'done' && i.status !== 'dropped');
    const closed = issues.filter(i => i.status === 'done' || i.status === 'dropped');

    const renderIssue = (issue) => {
      const status = issue.status || 'open';
      return `
        <div class="l10-issue-row">
          <button class="l10-issue-status iss-${status}"
            data-action="cycle-issue-status" data-issueid="${esc(issue.id)}">
            ${ISSUE_STATUS_LABEL[status] || status}
          </button>
          <input class="l10-issue-label" value="${esc(issue.label)}"
            data-action="edit-issue" data-issueid="${esc(issue.id)}" />
          <input class="l10-issue-owner" value="${esc(issue.owner || '')}" placeholder="Owner"
            data-action="edit-issue-owner" data-issueid="${esc(issue.id)}" />
          <button class="l10-item-del" data-action="del-issue" data-issueid="${esc(issue.id)}">✕</button>
        </div>
      `;
    };

    return `
      <div class="l10-section">
        <div class="l10-section-title">Issues List (IDS)</div>
        <div class="l10-item-list">
          ${open.length ? open.map(renderIssue).join('') : `<div class="l10-section-empty">No open issues 🎉</div>`}
        </div>
        <div class="l10-add-row">
          <input class="l10-add-input" id="new-issue-label" placeholder="Issue…" />
          <input class="l10-add-input l10-add-sm" id="new-issue-owner" placeholder="Owner" />
          <button class="l10-add-btn" data-action="add-issue">Add Issue</button>
        </div>
        ${closed.length ? `
          <details class="l10-collapsed-section">
            <summary class="l10-collapsed-summary">Resolved / Dropped (${closed.length})</summary>
            <div class="l10-item-list">${closed.map(renderIssue).join('')}</div>
          </details>
        ` : ''}
      </div>
    `;
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    const root = this._wrapper;
    const getMeeting = () => this._state.meetings.find(m => m.id === this._activeMeetingId);

    // Inline input editing (debounced)
    root.addEventListener('input', e => {
      const t = e.target;
      const action = t.dataset.action;
      if (!action) return;
      switch (action) {
        case 'edit-metric-label': {
          const m = this._state.scorecard.find(s => s.id === t.dataset.scid);
          if (m) { m.label = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-metric-goal': {
          const m = this._state.scorecard.find(s => s.id === t.dataset.scid);
          if (m) { m.goal = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-metric-owner': {
          const m = this._state.scorecard.find(s => s.id === t.dataset.scid);
          if (m) { m.owner = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-sc-val': {
          const mtg = getMeeting();
          if (!mtg) break;
          const scid = t.dataset.scid;
          const checks = { ...(mtg.scorecardChecks || {}) };
          checks[scid] = { ...(checks[scid] || {}), value: t.value };
          mtg.scorecardChecks = checks;
          this._scheduleSave();
          break;
        }
        case 'edit-rock-label': {
          const r = this._state.rocks.find(r => r.id === t.dataset.rid);
          if (r) { r.label = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-rock-owner': {
          const r = this._state.rocks.find(r => r.id === t.dataset.rid);
          if (r) { r.owner = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-rock-quarter': {
          const r = this._state.rocks.find(r => r.id === t.dataset.rid);
          if (r) { r.quarter = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-todo': {
          const td = this._state.todos.find(t2 => t2.id === t.dataset.tid);
          if (td) { td.label = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-todo-owner': {
          const td = this._state.todos.find(t2 => t2.id === t.dataset.tid);
          if (td) { td.owner = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-todo-date': {
          const td = this._state.todos.find(t2 => t2.id === t.dataset.tid);
          if (td) { td.dueDate = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-issue': {
          const iss = this._state.issues.find(i => i.id === t.dataset.issueid);
          if (iss) { iss.label = t.value; this._scheduleSave(); }
          break;
        }
        case 'edit-issue-owner': {
          const iss = this._state.issues.find(i => i.id === t.dataset.issueid);
          if (iss) { iss.owner = t.value; this._scheduleSave(); }
          break;
        }
      }
    });

    // Click actions
    root.addEventListener('click', async e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;

      switch (action) {
        case 'new-meeting':       await this._newMeeting(); break;
        case 'select-meeting': {
          this._activeMeetingId = el.dataset.mid;
          this._activeTab = 'goodnews';
          this._render();
          break;
        }
        case 'switch-tab': {
          this._activeTab = el.dataset.tab;
          this._render();
          break;
        }
        case 'close-settings': {
          this._settingsOpen = false;
          this._render();
          break;
        }
        case 'save-settings': {
          const name = root.querySelector('#s-name')?.value.trim();
          if (name) this._state.name = name;
          await this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(this._state.name, this._state.icon);
          this._settingsOpen = false;
          this._render();
          break;
        }
        case 'del-attendee': {
          const m = getMeeting();
          if (!m) break;
          m.attendees = (m.attendees || []).filter((_, i) => i !== parseInt(el.dataset.idx, 10));
          await this._save();
          this._render();
          break;
        }
        case 'add-goodnews': {
          const type = el.dataset.type;
          const m = getMeeting();
          if (!m) break;
          const textEl = root.querySelector(`[data-gn-text="${type}"]`);
          const authorEl = root.querySelector(`[data-gn-author="${type}"]`);
          const text = textEl?.value.trim();
          if (!text) { textEl?.focus(); break; }
          m.goodNews = [...(m.goodNews || []), { id: uid(), text, type, author: authorEl?.value.trim() || '' }];
          if (textEl) textEl.value = '';
          if (authorEl) authorEl.value = '';
          await this._save();
          this._render();
          break;
        }
        case 'del-goodnews': {
          const m = getMeeting();
          if (!m) break;
          m.goodNews = (m.goodNews || []).filter(i => i.id !== el.dataset.gnid);
          await this._save();
          this._render();
          break;
        }
        case 'toggle-sc-track': {
          const m = getMeeting();
          if (!m) break;
          const scid = el.dataset.scid;
          const checks = { ...(m.scorecardChecks || {}) };
          const existing = checks[scid] || {};
          const was = existing.onTrack;
          const next = (was === undefined || was === null) ? true : was === true ? false : undefined;
          checks[scid] = { ...existing, onTrack: next };
          m.scorecardChecks = checks;
          await this._save();
          this._render();
          break;
        }
        case 'add-metric': {
          const label = root.querySelector('#new-metric-label')?.value.trim();
          if (!label) { root.querySelector('#new-metric-label')?.focus(); break; }
          const goal  = root.querySelector('#new-metric-goal')?.value.trim() || '';
          const owner = root.querySelector('#new-metric-owner')?.value.trim() || '';
          this._state.scorecard = [...this._state.scorecard, { id: uid(), label, goal, owner }];
          await this._save();
          this._render();
          break;
        }
        case 'del-metric': {
          this._state.scorecard = this._state.scorecard.filter(m => m.id !== el.dataset.scid);
          await this._save();
          this._render();
          break;
        }
        case 'toggle-rock-track': {
          const m = getMeeting();
          if (!m) break;
          const rid = el.dataset.rid;
          const checks = { ...(m.rockChecks || {}) };
          const existing = checks[rid] || {};
          const was = existing.onTrack;
          const next = (was === undefined || was === null) ? true : was === true ? false : undefined;
          checks[rid] = { ...existing, onTrack: next };
          m.rockChecks = checks;
          await this._save();
          this._render();
          break;
        }
        case 'toggle-rock-done': {
          const r = this._state.rocks.find(r => r.id === el.dataset.rid);
          if (r) r.status = r.status === 'done' ? 'active' : 'done';
          await this._save();
          this._render();
          break;
        }
        case 'add-rock': {
          const label = root.querySelector('#new-rock-label')?.value.trim();
          if (!label) { root.querySelector('#new-rock-label')?.focus(); break; }
          const owner   = root.querySelector('#new-rock-owner')?.value.trim() || '';
          const quarter = root.querySelector('#new-rock-quarter')?.value.trim() || '';
          this._state.rocks = [...this._state.rocks, { id: uid(), label, owner, quarter, status: 'active' }];
          await this._save();
          this._render();
          break;
        }
        case 'del-rock': {
          this._state.rocks = this._state.rocks.filter(r => r.id !== el.dataset.rid);
          await this._save();
          this._render();
          break;
        }
        case 'add-headline': {
          const m = getMeeting();
          if (!m) break;
          const type = root.querySelector('#new-hl-type')?.value || 'customer';
          const text = root.querySelector('#new-headline')?.value.trim();
          if (!text) { root.querySelector('#new-headline')?.focus(); break; }
          m.headlines = [...(m.headlines || []), { id: uid(), text, type }];
          const el2 = root.querySelector('#new-headline');
          if (el2) el2.value = '';
          await this._save();
          this._render();
          break;
        }
        case 'del-headline': {
          const m = getMeeting();
          if (!m) break;
          m.headlines = (m.headlines || []).filter(h => h.id !== el.dataset.hlid);
          await this._save();
          this._render();
          break;
        }
        case 'toggle-todo': {
          const td = this._state.todos.find(t => t.id === el.dataset.tid);
          if (td) td.done = !td.done;
          await this._save();
          this._render();
          break;
        }
        case 'del-todo': {
          this._state.todos = this._state.todos.filter(t => t.id !== el.dataset.tid);
          await this._save();
          this._render();
          break;
        }
        case 'add-todo': {
          const label = root.querySelector('#new-todo-label')?.value.trim();
          if (!label) { root.querySelector('#new-todo-label')?.focus(); break; }
          const owner   = root.querySelector('#new-todo-owner')?.value.trim() || '';
          const dueDate = root.querySelector('#new-todo-due')?.value || '';
          const m = getMeeting();
          this._state.todos = [...this._state.todos, {
            id: uid(), label, owner, dueDate, done: false, meetingId: m?.id || null, createdAt: Date.now(),
          }];
          await this._save();
          this._render();
          break;
        }
        case 'toggle-all-todos': {
          this._showAllTodos = !this._showAllTodos;
          this._render();
          break;
        }
        case 'cycle-issue-status': {
          const iss = this._state.issues.find(i => i.id === el.dataset.issueid);
          if (!iss) break;
          const idx = ISSUE_STATUSES.indexOf(iss.status || 'open');
          iss.status = ISSUE_STATUSES[(idx + 1) % ISSUE_STATUSES.length];
          await this._save();
          this._render();
          break;
        }
        case 'del-issue': {
          this._state.issues = this._state.issues.filter(i => i.id !== el.dataset.issueid);
          await this._save();
          this._render();
          break;
        }
        case 'add-issue': {
          const label = root.querySelector('#new-issue-label')?.value.trim();
          if (!label) { root.querySelector('#new-issue-label')?.focus(); break; }
          const owner = root.querySelector('#new-issue-owner')?.value.trim() || '';
          this._state.issues = [...this._state.issues, { id: uid(), label, owner, status: 'open' }];
          await this._save();
          this._render();
          break;
        }
      }
    });

    // Attendee input: Enter or blur to add
    const attendeeInput = root.querySelector('#attendee-input');
    if (attendeeInput) {
      const addAttendee = async () => {
        const val = attendeeInput.value.trim();
        if (!val) return;
        const m = getMeeting();
        if (!m) return;
        m.attendees = [...(m.attendees || []), val];
        attendeeInput.value = '';
        await this._save();
        this._render();
      };
      attendeeInput.addEventListener('keydown', e => { if (e.key === 'Enter') addAttendee(); });
      attendeeInput.addEventListener('blur', addAttendee);
    }

    // Meeting rating change
    const ratingInput = root.querySelector('#meeting-rating');
    if (ratingInput) {
      ratingInput.addEventListener('change', async () => {
        const m = getMeeting();
        if (!m) return;
        const val = parseInt(ratingInput.value, 10);
        m.rating = (val >= 1 && val <= 10) ? val : null;
        await this._save();
        this._render();
      });
    }

    // Enter key shortcuts for add forms
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const id = e.target.id;
      const ds = e.target.dataset;
      if (id === 'new-metric-label' || id === 'new-metric-goal' || id === 'new-metric-owner') {
        root.querySelector('[data-action="add-metric"]')?.click();
      } else if (id === 'new-rock-label' || id === 'new-rock-owner' || id === 'new-rock-quarter') {
        root.querySelector('[data-action="add-rock"]')?.click();
      } else if (id === 'new-headline') {
        root.querySelector('[data-action="add-headline"]')?.click();
      } else if (id === 'new-todo-label' || id === 'new-todo-owner') {
        root.querySelector('[data-action="add-todo"]')?.click();
      } else if (id === 'new-issue-label' || id === 'new-issue-owner') {
        root.querySelector('[data-action="add-issue"]')?.click();
      } else if (ds.gnText) {
        root.querySelector(`[data-action="add-goodnews"][data-type="${ds.gnText}"]`)?.click();
      } else if (ds.gnAuthor) {
        root.querySelector(`[data-action="add-goodnews"][data-type="${ds.gnAuthor}"]`)?.click();
      }
    });
  }

  // ─── New meeting ───────────────────────────────────────────────────────────

  async _newMeeting() {
    const id = `mtg-${uid()}`;
    this._state.meetings = [...this._state.meetings, {
      id, date: todayISO(), rating: null, attendees: [],
      goodNews: [], scorecardChecks: {}, rockChecks: {}, headlines: [],
    }];
    this._activeMeetingId = id;
    this._activeTab = 'goodnews';
    await this._save();
    this._render();
  }
}

customElements.define('app-l10', AppL10);
