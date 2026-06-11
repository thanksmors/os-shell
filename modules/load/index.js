import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';

const MONTH_W = 64;
const ROW_H = 72;
const NAMES_W = 180;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Local-timezone ISO date — toISOString() shifts a day in UTC+ timezones
function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function autoColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

class AppLoad extends AppModuleBase {
  constructor() {
    super();
    this._modal = null;
    this._settingsOpen = false;
    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._showBars = true;
    this._showLoad = true;
    this._drag = null;
    this._roadmapProjects = [];
    this.addEventListener('os:toggle-settings', () => {
      this._settingsOpen = !this._settingsOpen;
      this._render();
    });
  }

  _collection() { return 'load-plans'; }

  async _load() {
    const saved = await getData('load-plans', this._appId);
    const cfg = this.api?.config || {};
    if (!saved) {
      const today = new Date();
      const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      this._state = {
        name: cfg.name || 'Load Plan',
        viewStart: fmtISO(qStart),
        viewMonths: 9,
        peopleInstanceId: null,
        roadmapInstanceId: null,
        members: [],
        tasks: []
      };
    } else {
      // Repair tasks saved by an earlier version with malformed dates (e.g. 'YYYY-MM-DD-01')
      const tasks = (saved.tasks || []).map(t => {
        const m = String(t.startDate).match(/^(\d{4})-(\d{2})/);
        const e = String(t.endDate).match(/^(\d{4})-(\d{2})/);
        if (!m || !e) return null;
        const startDate = /^\d{4}-\d{2}-\d{2}$/.test(t.startDate) ? t.startDate : `${m[1]}-${m[2]}-01`;
        const endDate = /^\d{4}-\d{2}-\d{2}$/.test(t.endDate) ? t.endDate : fmtISO(new Date(Number(e[1]), Number(e[2]), 0));
        return { ...t, startDate, endDate };
      }).filter(Boolean);
      this._state = { ...saved, roadmapInstanceId: saved.roadmapInstanceId ?? null, tasks };
    }
    await this._loadRoadmapProjects();
  }

  async _save() {
    await setData('load-plans', this._appId, this._state);
  }

  _getTitle() { return this._state?.name || 'Load Plan'; }

  // --- Date utilities ---
  _quarterStart(iso) {
    const d = new Date(iso + 'T00:00:00');
    return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  }
  _addMonthISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setMonth(d.getMonth() + n);
    return fmtISO(d);
  }
  _monthsBetween(a, b) {
    const from = new Date(a + 'T00:00:00'), to = new Date(b + 'T00:00:00');
    let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    m += (to.getDate() - from.getDate()) / new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
    return m;
  }
  _monthsArray() {
    const arr = [];
    for (let i = 0; i < this._state.viewMonths; i++) {
      const d = new Date(this._state.viewStart + 'T00:00:00');
      d.setMonth(d.getMonth() + i);
      arr.push({ year: d.getFullYear(), month: d.getMonth(),
        label: MONTH_NAMES[d.getMonth()], isQS: d.getMonth() % 3 === 0,
        iso: fmtISO(d).slice(0, 7) });
    }
    return arr;
  }
  _todayISO() { return fmtISO(new Date()); }
  _addYM(ym, n) { return this._addMonthISO(ym + '-01', n).slice(0, 7); }

  // Pixel geometry of a month-granularity bar, clipped to the view; null if fully outside
  _barGeom(startYM, endYM) {
    const totalW = this._state.viewMonths * MONTH_W;
    const left = this._monthsBetween(this._state.viewStart, startYM + '-01') * MONTH_W;
    const right = this._monthsBetween(this._state.viewStart, this._addMonthISO(endYM + '-01', 1)) * MONTH_W;
    if (left >= totalW || right <= 0 || right <= left) return null;
    const clampedLeft = Math.max(0, left);
    return { left: clampedLeft, width: Math.max(Math.min(right, totalW) - clampedLeft, 4) };
  }

  // --- Capacity ---
  _monthLoad(memberId, monthIndex) {
    const vs = this._state.viewStart + 'T00:00:00';
    const base = new Date(vs);
    const mStart = new Date(base.getFullYear(), base.getMonth() + monthIndex, 1);
    const mEnd   = new Date(base.getFullYear(), base.getMonth() + monthIndex + 1, 0);
    const daysInMonth = mEnd.getDate();
    return this._state.tasks
      .filter(t => t.memberId === memberId)
      .reduce((sum, t) => {
        const s = new Date(Math.max(new Date(t.startDate + 'T00:00:00'), mStart));
        const e = new Date(Math.min(new Date(t.endDate + 'T23:59:59'), mEnd));
        if (s > e) return sum;
        const overlap = Math.round((e - s) / 86400000) + 1;
        return sum + t.pct * (overlap / daysInMonth);
      }, 0);
  }

  // --- People sync ---
  async _syncPeople() {
    const instId = this._state.peopleInstanceId;
    if (!instId) return;
    const chart = await getData('people-charts', instId);
    if (!chart?.members) return;
    const existingIds = new Set(this._state.members.map(m => m.id));
    const imported = chart.members
      .filter(m => !existingIds.has(m.id))
      .map(m => ({ id: m.id, name: m.name, role: m.role || '', color: autoColor(m.id) }));
    this._state = { ...this._state, members: [...this._state.members, ...imported] };
    await this._save();
    this._render();
    if (this.api) this.api.setTitle(this._getTitle());
  }

  _peopleInstances() {
    try { return (window.Alpine?.store('os')?.instances || []).filter(i => i.appId === 'people'); }
    catch { return []; }
  }

  _roadmapInstances() {
    try { return (window.Alpine?.store('os')?.instances || []).filter(i => i.appId === 'roadmap'); }
    catch { return []; }
  }

  async _loadRoadmapProjects() {
    if (!this._state?.roadmapInstanceId) { this._roadmapProjects = []; return; }
    const rm = await getData('roadmaps', this._state.roadmapInstanceId);
    this._roadmapProjects = rm?.projects || [];
  }

  // Open the task modal, refreshing linked roadmap projects first
  async _openTaskModal(task, memberId) {
    await this._loadRoadmapProjects();
    this._modal = { type: 'task', data: task ? { ...task } : null, memberId: memberId || task?.memberId };
    this._render();
  }

  // --- Render ---
  _render() {
    const { members, tasks, viewStart, viewMonths, peopleInstanceId, name } = this._state;
    const showBars = this._showBars;
    const showLoad = this._showLoad;
    const months = this._monthsArray();
    const totalW = months.length * MONTH_W;
    const totalH = Math.max(members.length * ROW_H, ROW_H);
    const peopleInsts = this._peopleInstances();
    const roadmapInsts = this._roadmapInstances();

    // Layer layout: hidden layers cede their space to the visible one
    const loadH = showLoad ? (showBars ? 36 : ROW_H - 4) : 0;
    const barsAreaH = ROW_H - loadH - 8;
    const loadBarMax = Math.max(8, loadH - 14);

    // Build quarter header spans
    let qHeaders = '';
    let qi = 0;
    while (qi < months.length) {
      const span = Math.min(3 - (months[qi].month % 3), months.length - qi);
      const q = Math.floor(months[qi].month / 3) + 1;
      qHeaders += `<div class="q-header" style="width:${span * MONTH_W}px">Q${q} ${months[qi].year}</div>`;
      qi += span;
    }

    // Build month header cells
    const mHeaders = months.map((m, i) =>
      `<div class="m-header${m.isQS ? ' qs' : ''}" style="width:${MONTH_W}px">${m.label}</div>`
    ).join('');

    // Build person rows
    let nameRows = '';
    let timelineRows = '';

    if (members.length === 0) {
      nameRows = `<div class="empty-names"></div>`;
      timelineRows = `<div class="empty-timeline" style="height:${ROW_H * 3}px">
        <div class="empty-msg">
          ${peopleInstanceId
            ? `<button class="btn-sync-empty" data-action="sync">Sync from People</button>`
            : `<span>Link a People chart in settings, or</span><button class="btn-add-member" data-action="add-member">Add a member</button>`
          }
        </div>
      </div>`;
    } else {
      members.forEach((member, mi) => {
        const initials = member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const memberTasks = tasks.filter(t => t.memberId === member.id);

        // Load cells (always computed for overload detection, only rendered if showLoad)
        let loadCells = '';
        let rowOverloaded = false;
        months.forEach((m, idx) => {
          const load = this._monthLoad(member.id, idx);
          if (load >= 100) rowOverloaded = true;
          if (!showLoad) return;
          const pct = Math.min(Math.round(load), 120);
          const cls = load >= 100 ? 'overload' : load >= 70 ? 'mid' : 'low';
          loadCells += `<div class="load-cell${m.isQS ? ' qs' : ''}" style="width:${MONTH_W}px" title="${Math.round(load)}%">
            <div class="load-bar ${cls}" style="height:${Math.round(Math.min(pct, 100) / 100 * loadBarMax)}px"></div>
            <div class="load-label">${Math.round(load)}%</div>
          </div>`;
        });

        // Task bars — greedy lane assignment so overlapping tasks stack
        const sorted = [...memberTasks].sort((a, b) =>
          a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
        const laneEnds = [];
        const laneOf = {};
        sorted.forEach(t => {
          let lane = laneEnds.findIndex(end => t.startDate > end);
          if (lane === -1) { lane = laneEnds.length; laneEnds.push(t.endDate); }
          else laneEnds[lane] = t.endDate;
          laneOf[t.id] = lane;
        });
        const laneCount = Math.max(1, laneEnds.length);
        const barGap = 2;
        const barH = Math.max(8, Math.floor((barsAreaH - (laneCount - 1) * barGap) / laneCount));

        let bars = '';
        if (!showBars) { /* bars suppressed */ }
        else sorted.forEach(t => {
          const g = this._barGeom(t.startDate.slice(0, 7), t.endDate.slice(0, 7));
          if (!g) return;
          const top = 4 + laneOf[t.id] * (barH + barGap);
          bars += `<div class="task-bar${barH < 16 ? ' slim' : ''}" data-task="${esc(t.id)}"
            style="left:${g.left}px;width:${g.width}px;top:${top}px;height:${barH}px;background:${esc(t.color)}"
            title="${esc(t.name)} (${t.pct}%)">
            <div class="bar-handle left" data-handle="left"></div>
            <span>${esc(t.name)} ${t.pct}%</span>
            <div class="bar-handle right" data-handle="right"></div>
          </div>`;
        }); // end showBars

        nameRows += `<div class="name-row${rowOverloaded ? ' overloaded' : ''}" data-member="${esc(member.id)}" style="height:${ROW_H}px">
          <div class="member-avatar" style="background:${esc(member.color)}">${esc(initials)}</div>
          <div class="member-info">
            <div class="member-name">${esc(member.name)}</div>
            <div class="member-role">${esc(member.role)}</div>
          </div>
          <button class="add-task-btn" data-action="add-task" data-member="${esc(member.id)}" title="Add task">+</button>
        </div>`;

        timelineRows += `<div class="person-row${rowOverloaded ? ' overloaded' : ''}" data-member="${esc(member.id)}" style="height:${ROW_H}px;width:${totalW}px">
          <div class="load-cells" style="height:${loadH}px">${loadCells}</div>
          ${bars}
        </div>`;
      });
    }

    // Settings panel
    const settingsHtml = this._settingsOpen ? `
    <div class="settings-panel">
      <div class="settings-row">
        <label>Name</label>
        <input class="settings-name" value="${esc(name)}" placeholder="Plan name">
      </div>
      <div class="settings-row">
        <label>Link People chart</label>
        <select class="settings-people">
          <option value="">— None —</option>
          ${peopleInsts.map(i => `<option value="${esc(i.instanceId)}"${i.instanceId === peopleInstanceId ? ' selected' : ''}>${esc(i.name || 'People')}</option>`).join('')}
        </select>
      </div>
      <div class="settings-row">
        <label>Link Roadmap</label>
        <select class="settings-roadmap">
          <option value="">— None —</option>
          ${roadmapInsts.map(i => `<option value="${esc(i.instanceId)}"${i.instanceId === this._state.roadmapInstanceId ? ' selected' : ''}>${esc(i.name || 'Roadmap')}</option>`).join('')}
        </select>
      </div>
      <div class="settings-row">
        <label>View span</label>
        <div class="span-btns">
          ${[3,6,12,24,36,60].map(n => `<button class="span-btn${viewMonths === n ? ' active' : ''}" data-months="${n}">${n >= 24 ? (n/12)+'y' : n+'mo'}</button>`).join('')}
        </div>
      </div>
      <div class="settings-actions">
        <button class="btn-sync-people" data-action="sync"${!peopleInstanceId ? ' disabled' : ''}>Sync People →</button>
      </div>
    </div>` : '';

    // Modal
    const modalHtml = this._modal ? this._renderModal(months) : '';

    this._wrapper.innerHTML = `
    <div class="lm-root">
      <div class="toolbar">
        <span class="plan-title">${esc(name)}</span>
        <div class="toolbar-actions">
          <button class="tb-btn" data-action="prev-q" title="Previous quarter">◀</button>
          <button class="tb-btn today-btn" data-action="today">Today</button>
          <button class="tb-btn" data-action="next-q" title="Next quarter">▶</button>
          <div class="tb-sep"></div>
          <button class="tb-btn toggle-btn${this._showBars ? ' on' : ''}" data-action="toggle-bars" title="Toggle task bars">Bars</button>
          <button class="tb-btn toggle-btn${this._showLoad ? ' on' : ''}" data-action="toggle-load" title="Toggle load indicators">Load</button>
          ${members.length > 0 ? `<div class="tb-sep"></div><button class="tb-btn add-member-btn" data-action="add-member">+ Member</button>` : ''}
        </div>
      </div>
      ${settingsHtml}
      <div class="grid-outer">
        <div class="names-col" style="width:${NAMES_W}px">
          <div class="names-header"></div>
          <div class="names-scroll" id="names-scroll">
            ${nameRows}
          </div>
        </div>
        <div class="timeline-col">
          <div class="t-headers">
            <div class="q-headers">${qHeaders}</div>
            <div class="m-headers">${mHeaders}</div>
          </div>
          <div class="t-body" id="t-body" style="width:${totalW}px">
            ${timelineRows}
          </div>
        </div>
      </div>
      ${modalHtml}
    </div>`;

    this._bindEvents();
    requestAnimationFrame(() => {
      const tCol = this._wrapper.querySelector('.timeline-col');
      if (tCol) { tCol.scrollTop = this._scrollTop; tCol.scrollLeft = this._scrollLeft; }
    });
  }

  _renderModal(months) {
    const { type, data, memberId } = this._modal;
    const isEdit = !!data?.id;

    if (type === 'task') {
      const t = data || {};
      const member = this._state.members.find(m => m.id === (memberId || t.memberId));
      const colorSwatches = PALETTE.map(c =>
        `<div class="swatch${(t.color || PALETTE[0]) === c ? ' selected' : ''}" data-color="${c}" style="background:${c}"></div>`
      ).join('');

      // Build month+year options for start/end
      const monthOpts = (sel) => {
        let opts = '';
        for (let i = -3; i < this._state.viewMonths + 6; i++) {
          const iso = this._addMonthISO(this._state.viewStart, i);
          const ym = iso.slice(0, 7);
          const d = new Date(iso + 'T00:00:00');
          const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
          opts += `<option value="${ym}" ${sel === ym ? 'selected' : ''}>${label}</option>`;
        }
        return opts;
      };

      const defaultStart = this._state.viewStart;
      const defaultEnd = this._addMonthISO(this._state.viewStart, 2);
      const curStart = t.startDate ? t.startDate.slice(0, 7) : defaultStart.slice(0, 7);
      const curEnd = t.endDate ? t.endDate.slice(0, 7) : defaultEnd.slice(0, 7);

      return `<div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? 'Edit Task' : `Add Task${member ? ' for ' + esc(member.name) : ''}`}</div>
          <div class="modal-body">
            ${this._roadmapProjects.length ? `
            <label>Roadmap project</label>
            <select class="modal-input" id="m-roadmap-project">
              <option value="">— None —</option>
              ${this._roadmapProjects.map(p => `<option value="${esc(p.id)}"${t.roadmapProjectId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>` : ''}
            <label>Task name</label>
            <input class="modal-input" id="m-name" value="${esc(t.name || '')}" placeholder="e.g. Project Alpha">
            <label>Color</label>
            <div class="swatches">${colorSwatches}</div>
            <input type="hidden" id="m-color" value="${esc(t.color || PALETTE[0])}">
            <div class="modal-row">
              <div>
                <label>Start</label>
                <select class="modal-input" id="m-start">${monthOpts(curStart)}</select>
              </div>
              <div>
                <label>End</label>
                <select class="modal-input" id="m-end">${monthOpts(curEnd)}</select>
              </div>
            </div>
            <label>Allocation — <span id="pct-label">${t.pct || 50}%</span></label>
            <input type="range" class="pct-slider" id="m-pct" min="10" max="100" step="10" value="${t.pct || 50}">
          </div>
          <div class="modal-footer">
            ${isEdit ? `<button class="btn-delete" data-action="delete-task" data-id="${esc(t.id)}">Delete</button>` : '<span></span>'}
            <div class="modal-btns">
              <button class="btn-cancel" data-action="close-modal">Cancel</button>
              <button class="btn-save" data-action="save-task">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    if (type === 'member') {
      const m = data || {};
      const colorSwatches = PALETTE.map(c =>
        `<div class="swatch${(m.color || PALETTE[0]) === c ? ' selected' : ''}" data-color="${c}" style="background:${c}"></div>`
      ).join('');
      return `<div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? 'Edit Member' : 'Add Member'}</div>
          <div class="modal-body">
            <label>Name</label>
            <input class="modal-input" id="m-name" value="${esc(m.name || '')}" placeholder="Full name">
            <label>Role</label>
            <input class="modal-input" id="m-role" value="${esc(m.role || '')}" placeholder="Job title">
            <label>Color</label>
            <div class="swatches">${colorSwatches}</div>
            <input type="hidden" id="m-color" value="${esc(m.color || PALETTE[0])}">
          </div>
          <div class="modal-footer">
            ${isEdit ? `<button class="btn-delete" data-action="delete-member" data-id="${esc(m.id)}">Delete</button>` : '<span></span>'}
            <div class="modal-btns">
              <button class="btn-cancel" data-action="close-modal">Cancel</button>
              <button class="btn-save" data-action="save-member">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    return '';
  }

  _bindEvents() {
    const w = this._wrapper;

    // Sync scroll between names and timeline
    const tCol = w.querySelector('.timeline-col');
    const nScroll = w.querySelector('#names-scroll');
    if (tCol && nScroll) {
      tCol.addEventListener('scroll', () => {
        nScroll.scrollTop = tCol.scrollTop;
        this._scrollTop = tCol.scrollTop;
        this._scrollLeft = tCol.scrollLeft;
      });
    }

    // Toolbar actions
    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        this._handleAction(el.dataset.action, el.dataset);
      });
    });

    // Task bars: pointer state machine — click opens modal, drag moves/reassigns, handles resize
    this._bindBarDrag(w);

    // Name row click (edit member)
    w.querySelectorAll('.name-row').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-action]')) return;
        const member = this._state.members.find(m => m.id === el.dataset.member);
        if (member) { this._modal = { type: 'member', data: { ...member } }; this._render(); }
      });
    });

    // Color swatches in modal
    w.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        w.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        const colorInput = w.querySelector('#m-color');
        if (colorInput) colorInput.value = sw.dataset.color;
      });
    });

    // Roadmap project picker — fills name + color from the chosen project
    const rmSelect = w.querySelector('#m-roadmap-project');
    if (rmSelect) {
      rmSelect.addEventListener('change', () => {
        const proj = this._roadmapProjects.find(p => p.id === rmSelect.value);
        if (!proj) return;
        const nameInput = w.querySelector('#m-name');
        const colorInput = w.querySelector('#m-color');
        if (nameInput) nameInput.value = proj.name;
        if (colorInput && proj.color) {
          colorInput.value = proj.color;
          w.querySelectorAll('.swatch').forEach(s =>
            s.classList.toggle('selected', s.dataset.color === proj.color));
        }
      });
    }

    // % slider label
    const slider = w.querySelector('#m-pct');
    const pctLabel = w.querySelector('#pct-label');
    if (slider && pctLabel) {
      slider.addEventListener('input', () => { pctLabel.textContent = slider.value + '%'; });
    }

    // Settings inputs
    const nameInput = w.querySelector('.settings-name');
    if (nameInput) {
      nameInput.addEventListener('change', () => {
        this._state = { ...this._state, name: nameInput.value };
        this._save();
        if (this.api) this.api.setTitle(nameInput.value);
        this._wrapper.querySelector('.plan-title').textContent = nameInput.value;
      });
    }
    const peopleSelect = w.querySelector('.settings-people');
    if (peopleSelect) {
      peopleSelect.addEventListener('change', () => {
        this._state = { ...this._state, peopleInstanceId: peopleSelect.value || null };
        this._save();
        this._render();
      });
    }
    const roadmapSelect = w.querySelector('.settings-roadmap');
    if (roadmapSelect) {
      roadmapSelect.addEventListener('change', async () => {
        this._state = { ...this._state, roadmapInstanceId: roadmapSelect.value || null };
        await this._save();
        await this._loadRoadmapProjects();
        this._render();
      });
    }
    w.querySelectorAll('.span-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._state = { ...this._state, viewMonths: Number(btn.dataset.months) };
        this._save();
        this._render();
      });
    });

    // Modal overlay click to close
    const overlay = w.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { this._modal = null; this._render(); }
      });
    }
  }

  // --- Bar drag/move/resize ---
  _bindBarDrag(w) {
    w.querySelectorAll('.task-bar').forEach(bar => {
      bar.addEventListener('pointerdown', e => {
        if (e.button !== 0 || this._drag) return;
        const task = this._state.tasks.find(t => t.id === bar.dataset.task);
        if (!task) return;
        e.preventDefault();
        e.stopPropagation();
        const handle = e.target.dataset?.handle;
        const startYM = task.startDate.slice(0, 7);
        const endYM = task.endDate.slice(0, 7);
        this._drag = {
          task, bar, pointerId: e.pointerId,
          mode: handle === 'left' ? 'resize-l' : handle === 'right' ? 'resize-r' : 'move',
          startX: e.clientX, startY: e.clientY,
          origStartYM: startYM, origEndYM: endYM,
          newStartYM: startYM, newEndYM: endYM, newMemberId: task.memberId,
          active: false, ghost: null
        };
        bar.setPointerCapture(e.pointerId);
        const onMove = ev => this._barDragMove(ev);
        const onUp = ev => {
          bar.removeEventListener('pointermove', onMove);
          bar.removeEventListener('pointerup', onUp);
          bar.removeEventListener('pointercancel', onUp);
          this._barDragEnd(ev);
        };
        bar.addEventListener('pointermove', onMove);
        bar.addEventListener('pointerup', onUp);
        bar.addEventListener('pointercancel', onUp);
      });
    });
  }

  _barDragMove(ev) {
    const d = this._drag;
    if (!d) return;
    const dx = ev.clientX - d.startX;
    const dy = ev.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      d.active = true;
      d.bar.classList.add('dragging');
      const tBody = this._wrapper.querySelector('#t-body');
      d.ghost = document.createElement('div');
      d.ghost.className = 'task-bar ghost';
      d.ghost.style.background = d.task.color;
      tBody?.appendChild(d.ghost);
    }
    const dMonths = Math.round(dx / MONTH_W);
    let sYM = d.origStartYM, eYM = d.origEndYM, memberId = d.task.memberId;
    if (d.mode === 'move') {
      sYM = this._addYM(d.origStartYM, dMonths);
      eYM = this._addYM(d.origEndYM, dMonths);
      const tBody = this._wrapper.querySelector('#t-body');
      if (tBody) {
        const rect = tBody.getBoundingClientRect();
        const idx = Math.floor((ev.clientY - rect.top) / ROW_H);
        const clamped = Math.min(Math.max(idx, 0), this._state.members.length - 1);
        memberId = this._state.members[clamped]?.id || memberId;
      }
    } else if (d.mode === 'resize-l') {
      sYM = this._addYM(d.origStartYM, dMonths);
      if (sYM > eYM) sYM = eYM;
    } else {
      eYM = this._addYM(d.origEndYM, dMonths);
      if (eYM < sYM) eYM = sYM;
    }
    d.newStartYM = sYM; d.newEndYM = eYM; d.newMemberId = memberId;
    const g = this._barGeom(sYM, eYM);
    const rowIdx = Math.max(0, this._state.members.findIndex(m => m.id === memberId));
    if (g && d.ghost) {
      d.ghost.style.display = '';
      d.ghost.style.left = g.left + 'px';
      d.ghost.style.width = g.width + 'px';
      d.ghost.style.top = (rowIdx * ROW_H + 4) + 'px';
      d.ghost.style.height = Math.max(d.bar.offsetHeight, 18) + 'px';
      const [sy, sm] = sYM.split('-').map(Number);
      const [ey2, em2] = eYM.split('-').map(Number);
      d.ghost.textContent = `${MONTH_NAMES[sm - 1]} ${sy} – ${MONTH_NAMES[em2 - 1]} ${ey2}`;
    } else if (d.ghost) {
      d.ghost.style.display = 'none';
    }
  }

  async _barDragEnd() {
    const d = this._drag;
    this._drag = null;
    if (!d) return;
    d.ghost?.remove();
    d.bar.classList.remove('dragging');
    try { d.bar.releasePointerCapture(d.pointerId); } catch {}
    if (!d.active) {
      await this._openTaskModal(d.task);
      return;
    }
    const startDate = d.newStartYM + '-01';
    const [ey, em] = d.newEndYM.split('-').map(Number);
    const endDate = fmtISO(new Date(ey, em, 0));
    const t = d.task;
    if (startDate === t.startDate && endDate === t.endDate && d.newMemberId === t.memberId) {
      this._render();
      return;
    }
    this._state = {
      ...this._state,
      tasks: this._state.tasks.map(x => x.id === t.id
        ? { ...x, startDate, endDate, memberId: d.newMemberId } : x)
    };
    await this._save();
    this._render();
  }

  async _handleAction(action, dataset) {
    if (action === 'toggle-bars') {
      this._showBars = !this._showBars; this._render(); return;
    } else if (action === 'toggle-load') {
      this._showLoad = !this._showLoad; this._render(); return;
    } else if (action === 'prev-q') {
      this._state = { ...this._state, viewStart: this._addMonthISO(this._state.viewStart, -3) };
      await this._save(); this._render();
    } else if (action === 'next-q') {
      this._state = { ...this._state, viewStart: this._addMonthISO(this._state.viewStart, 3) };
      await this._save(); this._render();
    } else if (action === 'today') {
      const qs = this._quarterStart(this._todayISO());
      this._state = { ...this._state, viewStart: fmtISO(qs) };
      await this._save(); this._render();
    } else if (action === 'add-task') {
      await this._openTaskModal(null, dataset.member);
    } else if (action === 'add-member') {
      this._modal = { type: 'member', data: null };
      this._render();
    } else if (action === 'close-modal') {
      this._modal = null; this._render();
    } else if (action === 'save-task') {
      this._saveTaskModal();
    } else if (action === 'save-member') {
      this._saveMemberModal();
    } else if (action === 'delete-task') {
      this._state = { ...this._state, tasks: this._state.tasks.filter(t => t.id !== dataset.id) };
      this._modal = null;
      await this._save(); this._render();
    } else if (action === 'delete-member') {
      this._state = {
        ...this._state,
        members: this._state.members.filter(m => m.id !== dataset.id),
        tasks: this._state.tasks.filter(t => t.memberId !== dataset.id)
      };
      this._modal = null;
      await this._save(); this._render();
    } else if (action === 'sync') {
      await this._syncPeople();
    }
  }

  async _saveTaskModal() {
    const w = this._wrapper;
    const name = w.querySelector('#m-name')?.value?.trim();
    if (!name) { w.querySelector('#m-name')?.focus(); return; }
    const color = w.querySelector('#m-color')?.value || PALETTE[0];
    const startMonth = w.querySelector('#m-start')?.value; // YYYY-MM
    const endMonth = w.querySelector('#m-end')?.value;
    const pct = Number(w.querySelector('#m-pct')?.value || 50);
    const startYM = startMonth || this._state.viewStart.slice(0, 7);
    const endYM = (endMonth && endMonth >= startYM) ? endMonth : startYM;
    const startDate = startYM + '-01';
    // end = last day of end month
    const [ey, em] = endYM.split('-').map(Number);
    const endDate = fmtISO(new Date(ey, em, 0));
    const memberId = this._modal.memberId || this._modal.data?.memberId;
    const roadmapProjectId = w.querySelector('#m-roadmap-project')?.value || null;

    const existing = this._modal.data?.id;
    if (existing) {
      this._state = {
        ...this._state,
        tasks: this._state.tasks.map(t => t.id === existing ? { ...t, name, color, startDate, endDate, pct, roadmapProjectId } : t)
      };
    } else {
      const newTask = { id: 'tsk-' + Date.now(), name, color, memberId, startDate, endDate, pct, roadmapProjectId };
      this._state = { ...this._state, tasks: [...this._state.tasks, newTask] };
    }
    this._modal = null;
    await this._save(); this._render();
  }

  async _saveMemberModal() {
    const w = this._wrapper;
    const name = w.querySelector('#m-name')?.value?.trim();
    if (!name) { w.querySelector('#m-name')?.focus(); return; }
    const role = w.querySelector('#m-role')?.value?.trim() || '';
    const color = w.querySelector('#m-color')?.value || PALETTE[0];

    const existing = this._modal.data?.id;
    if (existing) {
      this._state = {
        ...this._state,
        members: this._state.members.map(m => m.id === existing ? { ...m, name, role, color } : m)
      };
    } else {
      const newMember = { id: 'mbr-' + Date.now(), name, role, color };
      this._state = { ...this._state, members: [...this._state.members, newMember] };
    }
    this._modal = null;
    await this._save(); this._render();
  }
}

customElements.define('app-load', AppLoad);
