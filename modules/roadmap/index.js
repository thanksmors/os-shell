import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';
import { replayButtonHTML, wireReplay } from '/shell/app-onboarding.js';

const MONTH_W = 64;
const ROW_H = 48;
const NAMES_W = 200;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Local-timezone ISO date — toISOString() shifts a day in UTC+ timezones
function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class AppRoadmap extends AppModuleBase {
  constructor() {
    super();
    this._modal = null;
    this._settingsOpen = false;
    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._drag = null;
    this.addEventListener('os:toggle-settings', () => {
      this._settingsOpen = !this._settingsOpen;
      this._render();
    });
  }

  _collection() { return 'roadmaps'; }

  async _load() {
    const saved = await getData('roadmaps', this._appId);
    const cfg = this.api?.config || {};
    if (!saved) {
      const today = new Date();
      const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      this._state = {
        name: cfg.name || 'Roadmap',
        viewStart: fmtISO(qStart),
        viewMonths: 12,
        projects: [],
        phases: []
      };
    } else {
      this._state = saved;
    }
  }

  async _save() {
    await setData('roadmaps', this._appId, this._state);
  }

  _getTitle() { return this._state?.name || 'Roadmap'; }

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
        label: MONTH_NAMES[d.getMonth()], isQS: d.getMonth() % 3 === 0 });
    }
    return arr;
  }
  _todayISO() { return fmtISO(new Date()); }
  _addYM(ym, n) { return this._addMonthISO(ym + '-01', n).slice(0, 7); }

  _barGeom(startYM, endYM) {
    const totalW = this._state.viewMonths * MONTH_W;
    const left = this._monthsBetween(this._state.viewStart, startYM + '-01') * MONTH_W;
    const right = this._monthsBetween(this._state.viewStart, this._addMonthISO(endYM + '-01', 1)) * MONTH_W;
    if (left >= totalW || right <= 0 || right <= left) return null;
    const clampedLeft = Math.max(0, left);
    return { left: clampedLeft, width: Math.max(Math.min(right, totalW) - clampedLeft, 4) };
  }

  _sortedProjects() {
    return [...this._state.projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // --- Render ---
  _render() {
    const { viewMonths, name } = this._state;
    const months = this._monthsArray();
    const totalW = months.length * MONTH_W;
    const projects = this._sortedProjects();

    let qHeaders = '';
    let qi = 0;
    while (qi < months.length) {
      const span = Math.min(3 - (months[qi].month % 3), months.length - qi);
      const q = Math.floor(months[qi].month / 3) + 1;
      qHeaders += `<div class="q-header" style="width:${span * MONTH_W}px">Q${q} ${months[qi].year}</div>`;
      qi += span;
    }
    const mHeaders = months.map(m =>
      `<div class="m-header${m.isQS ? ' qs' : ''}" style="width:${MONTH_W}px">${m.label}</div>`
    ).join('');

    let nameRows = '';
    let timelineRows = '';

    if (projects.length === 0) {
      timelineRows = `<div class="empty-timeline" style="height:${ROW_H * 3}px">
        <div class="empty-msg">
          <span>Plan your projects on a quarterly timeline</span>
          <button class="btn-add-project" data-action="add-project">+ Add a project</button>
        </div>
      </div>`;
    } else {
      projects.forEach((project, pi) => {
        const phases = this._state.phases.filter(p => p.projectId === project.id);

        // Lane assignment for overlapping phases
        const sorted = [...phases].sort((a, b) =>
          a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
        const laneEnds = [];
        const laneOf = {};
        sorted.forEach(p => {
          let lane = laneEnds.findIndex(end => p.startDate > end);
          if (lane === -1) { lane = laneEnds.length; laneEnds.push(p.endDate); }
          else laneEnds[lane] = p.endDate;
          laneOf[p.id] = lane;
        });
        const laneCount = Math.max(1, laneEnds.length);
        const barGap = 2;
        const barH = Math.max(8, Math.floor((ROW_H - 8 - (laneCount - 1) * barGap) / laneCount));

        let bars = '';
        sorted.forEach(p => {
          const g = this._barGeom(p.startDate.slice(0, 7), p.endDate.slice(0, 7));
          if (!g) return;
          const top = 4 + laneOf[p.id] * (barH + barGap);
          bars += `<div class="phase-bar${barH < 16 ? ' slim' : ''}" data-phase="${esc(p.id)}"
            style="left:${g.left}px;width:${g.width}px;top:${top}px;height:${barH}px;background:${esc(p.color)}"
            title="${esc(p.name)}">
            <div class="bar-handle left" data-handle="left"></div>
            <span>${esc(p.name)}</span>
            <div class="bar-handle right" data-handle="right"></div>
          </div>`;
        });

        nameRows += `<div class="proj-row" draggable="true" data-idx="${pi}" data-project="${esc(project.id)}" style="height:${ROW_H}px">
          <span class="drag-grip" title="Drag to reorder">⠿</span>
          <span class="proj-dot" style="background:${esc(project.color)}"></span>
          <span class="proj-name">${esc(project.name)}</span>
          <button class="row-btn" data-action="add-phase" data-project="${esc(project.id)}" title="Add phase">+</button>
        </div>`;

        timelineRows += `<div class="timeline-row" data-project="${esc(project.id)}" style="height:${ROW_H}px;width:${totalW}px">
          ${bars}
        </div>`;
      });
    }

    const settingsHtml = this._settingsOpen ? `
    <div class="settings-panel">
      <div class="settings-row">
        <label>Name</label>
        <input class="settings-name" value="${esc(name)}" placeholder="Roadmap name">
      </div>
      <div class="settings-row">
        <label>View span</label>
        <div class="span-btns">
          ${[3,6,12,24,36,60].map(n => `<button class="span-btn${viewMonths === n ? ' active' : ''}" data-months="${n}">${n >= 24 ? (n/12)+'y' : n+'mo'}</button>`).join('')}
        </div>
      </div>
      <div class="settings-row">
        <label>Help</label>
        ${replayButtonHTML()}
      </div>
    </div>` : '';

    const modalHtml = this._modal ? this._renderModal() : '';

    this._wrapper.innerHTML = `
    <div class="rm-root">
      <div class="toolbar">
        <span class="plan-title">${esc(name)}</span>
        <div class="toolbar-actions">
          <button class="tb-btn" data-action="prev-q" title="Previous quarter">◀</button>
          <button class="tb-btn today-btn" data-action="today">Today</button>
          <button class="tb-btn" data-action="next-q" title="Next quarter">▶</button>
          <div class="tb-sep"></div>
          <button class="tb-btn add-project-btn" data-action="add-project">+ Project</button>
        </div>
      </div>
      ${settingsHtml}
      <div class="grid-outer">
        <div class="names-col" style="width:${NAMES_W}px">
          <div class="names-header"></div>
          <div class="names-scroll" id="names-scroll">${nameRows}</div>
        </div>
        <div class="timeline-col">
          <div class="t-headers">
            <div class="q-headers">${qHeaders}</div>
            <div class="m-headers">${mHeaders}</div>
          </div>
          <div class="t-body" id="t-body" style="width:${totalW}px">${timelineRows}</div>
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

  _renderModal() {
    const { type, data, projectId } = this._modal;
    const isEdit = !!data?.id;

    const monthOpts = (sel) => {
      let opts = '';
      for (let i = -3; i < this._state.viewMonths + 6; i++) {
        const iso = this._addMonthISO(this._state.viewStart, i);
        const ym = iso.slice(0, 7);
        const d = new Date(iso + 'T00:00:00');
        opts += `<option value="${ym}" ${sel === ym ? 'selected' : ''}>${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}</option>`;
      }
      return opts;
    };
    const swatches = (cur) => PALETTE.map(c =>
      `<div class="swatch${(cur || PALETTE[0]) === c ? ' selected' : ''}" data-color="${c}" style="background:${c}"></div>`
    ).join('');

    if (type === 'phase') {
      const p = data || {};
      const project = this._state.projects.find(x => x.id === (projectId || p.projectId));
      const curStart = p.startDate ? p.startDate.slice(0, 7) : this._state.viewStart.slice(0, 7);
      const curEnd = p.endDate ? p.endDate.slice(0, 7) : this._addMonthISO(this._state.viewStart, 2).slice(0, 7);
      return `<div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? 'Edit Phase' : `Add Phase${project ? ' — ' + esc(project.name) : ''}`}</div>
          <div class="modal-body">
            <label>Phase name</label>
            <input class="modal-input" id="m-name" value="${esc(p.name || '')}" placeholder="e.g. Design, Build, Launch">
            <label>Color</label>
            <div class="swatches">${swatches(p.color)}</div>
            <input type="hidden" id="m-color" value="${esc(p.color || PALETTE[0])}">
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
          </div>
          <div class="modal-footer">
            ${isEdit ? `<button class="btn-delete" data-action="delete-phase" data-id="${esc(p.id)}">Delete</button>` : '<span></span>'}
            <div class="modal-btns">
              <button class="btn-cancel" data-action="close-modal">Cancel</button>
              <button class="btn-save" data-action="save-phase">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    if (type === 'project') {
      const p = data || {};
      return `<div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? 'Edit Project' : 'Add Project'}</div>
          <div class="modal-body">
            <label>Project name</label>
            <input class="modal-input" id="m-name" value="${esc(p.name || '')}" placeholder="e.g. Mobile App v2">
            <label>Color</label>
            <div class="swatches">${swatches(p.color)}</div>
            <input type="hidden" id="m-color" value="${esc(p.color || PALETTE[0])}">
          </div>
          <div class="modal-footer">
            ${isEdit ? `<button class="btn-delete" data-action="delete-project" data-id="${esc(p.id)}">Delete</button>` : '<span></span>'}
            <div class="modal-btns">
              <button class="btn-cancel" data-action="close-modal">Cancel</button>
              <button class="btn-save" data-action="save-project">Save</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    return '';
  }

  _bindEvents() {
    const w = this._wrapper;
    wireReplay(this, w);

    const tCol = w.querySelector('.timeline-col');
    const nScroll = w.querySelector('#names-scroll');
    if (tCol && nScroll) {
      tCol.addEventListener('scroll', () => {
        nScroll.scrollTop = tCol.scrollTop;
        this._scrollTop = tCol.scrollTop;
        this._scrollLeft = tCol.scrollLeft;
      });
    }

    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        this._handleAction(el.dataset.action, el.dataset);
      });
    });

    // Project name click → edit modal (skip when clicking action buttons or mid-drag)
    w.querySelectorAll('.proj-row').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-action]')) return;
        const project = this._state.projects.find(p => p.id === el.dataset.project);
        if (project) { this._modal = { type: 'project', data: { ...project } }; this._render(); }
      });
    });

    this._bindRowDrag(w);
    this._bindBarDrag(w);

    w.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        w.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        const colorInput = w.querySelector('#m-color');
        if (colorInput) colorInput.value = sw.dataset.color;
      });
    });

    const nameInput = w.querySelector('.settings-name');
    if (nameInput) {
      nameInput.addEventListener('change', () => {
        this._state = { ...this._state, name: nameInput.value };
        this._save();
        if (this.api) this.api.setTitle(nameInput.value);
        this._wrapper.querySelector('.plan-title').textContent = nameInput.value;
      });
    }
    w.querySelectorAll('.span-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._state = { ...this._state, viewMonths: Number(btn.dataset.months) };
        this._save();
        this._render();
      });
    });

    const overlay = w.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { this._modal = null; this._render(); }
      });
    }
  }

  // --- Project row reorder (HTML5 drag, gantt pattern) ---
  _bindRowDrag(w) {
    const rows = w.querySelectorAll('.proj-row[draggable]');
    let dragIdx = null;
    rows.forEach(row => {
      row.addEventListener('dragstart', e => {
        dragIdx = parseInt(row.dataset.idx, 10);
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        w.querySelectorAll('.proj-row').forEach(r => r.classList.remove('drag-over'));
        dragIdx = null;
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        w.querySelectorAll('.proj-row').forEach(r => r.classList.remove('drag-over'));
        row.classList.add('drag-over');
      });
      row.addEventListener('drop', async e => {
        e.preventDefault();
        const dropIdx = parseInt(row.dataset.idx, 10);
        if (dragIdx === null || dragIdx === dropIdx) return;
        const sorted = this._sortedProjects();
        const [moved] = sorted.splice(dragIdx, 1);
        sorted.splice(dropIdx, 0, moved);
        this._state = { ...this._state, projects: sorted.map((p, i) => ({ ...p, order: i })) };
        await this._save();
        this._render();
      });
    });
  }

  // --- Phase bar drag/move/resize (pointer state machine) ---
  _bindBarDrag(w) {
    w.querySelectorAll('.phase-bar').forEach(bar => {
      bar.addEventListener('pointerdown', e => {
        if (e.button !== 0 || this._drag) return;
        const phase = this._state.phases.find(p => p.id === bar.dataset.phase);
        if (!phase) return;
        e.preventDefault();
        e.stopPropagation();
        const handle = e.target.dataset?.handle;
        const startYM = phase.startDate.slice(0, 7);
        const endYM = phase.endDate.slice(0, 7);
        this._drag = {
          phase, bar, pointerId: e.pointerId,
          mode: handle === 'left' ? 'resize-l' : handle === 'right' ? 'resize-r' : 'move',
          startX: e.clientX, startY: e.clientY,
          origStartYM: startYM, origEndYM: endYM,
          newStartYM: startYM, newEndYM: endYM, newProjectId: phase.projectId,
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
      d.ghost.className = 'phase-bar ghost';
      d.ghost.style.background = d.phase.color;
      tBody?.appendChild(d.ghost);
    }
    const dMonths = Math.round(dx / MONTH_W);
    const projects = this._sortedProjects();
    let sYM = d.origStartYM, eYM = d.origEndYM, projectId = d.phase.projectId;
    if (d.mode === 'move') {
      sYM = this._addYM(d.origStartYM, dMonths);
      eYM = this._addYM(d.origEndYM, dMonths);
      const tBody = this._wrapper.querySelector('#t-body');
      if (tBody) {
        const rect = tBody.getBoundingClientRect();
        const idx = Math.floor((ev.clientY - rect.top) / ROW_H);
        const clamped = Math.min(Math.max(idx, 0), projects.length - 1);
        projectId = projects[clamped]?.id || projectId;
      }
    } else if (d.mode === 'resize-l') {
      sYM = this._addYM(d.origStartYM, dMonths);
      if (sYM > eYM) sYM = eYM;
    } else {
      eYM = this._addYM(d.origEndYM, dMonths);
      if (eYM < sYM) eYM = sYM;
    }
    d.newStartYM = sYM; d.newEndYM = eYM; d.newProjectId = projectId;
    const g = this._barGeom(sYM, eYM);
    const rowIdx = Math.max(0, projects.findIndex(p => p.id === projectId));
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
      this._modal = { type: 'phase', data: { ...d.phase }, projectId: d.phase.projectId };
      this._render();
      return;
    }
    const startDate = d.newStartYM + '-01';
    const [ey, em] = d.newEndYM.split('-').map(Number);
    const endDate = fmtISO(new Date(ey, em, 0));
    const p = d.phase;
    if (startDate === p.startDate && endDate === p.endDate && d.newProjectId === p.projectId) {
      this._render();
      return;
    }
    this._state = {
      ...this._state,
      phases: this._state.phases.map(x => x.id === p.id
        ? { ...x, startDate, endDate, projectId: d.newProjectId } : x)
    };
    await this._save();
    this._render();
  }

  async _handleAction(action, dataset) {
    if (action === 'prev-q') {
      this._state = { ...this._state, viewStart: this._addMonthISO(this._state.viewStart, -3) };
      await this._save(); this._render();
    } else if (action === 'next-q') {
      this._state = { ...this._state, viewStart: this._addMonthISO(this._state.viewStart, 3) };
      await this._save(); this._render();
    } else if (action === 'today') {
      const qs = this._quarterStart(this._todayISO());
      this._state = { ...this._state, viewStart: fmtISO(qs) };
      await this._save(); this._render();
    } else if (action === 'add-project') {
      this._modal = { type: 'project', data: null };
      this._render();
    } else if (action === 'add-phase') {
      this._modal = { type: 'phase', data: null, projectId: dataset.project };
      this._render();
    } else if (action === 'close-modal') {
      this._modal = null; this._render();
    } else if (action === 'save-project') {
      this._saveProjectModal();
    } else if (action === 'save-phase') {
      this._savePhaseModal();
    } else if (action === 'delete-project') {
      this._state = {
        ...this._state,
        projects: this._state.projects.filter(p => p.id !== dataset.id),
        phases: this._state.phases.filter(p => p.projectId !== dataset.id)
      };
      this._modal = null;
      await this._save(); this._render();
    } else if (action === 'delete-phase') {
      this._state = { ...this._state, phases: this._state.phases.filter(p => p.id !== dataset.id) };
      this._modal = null;
      await this._save(); this._render();
    }
  }

  async _saveProjectModal() {
    const w = this._wrapper;
    const name = w.querySelector('#m-name')?.value?.trim();
    if (!name) { w.querySelector('#m-name')?.focus(); return; }
    const color = w.querySelector('#m-color')?.value || PALETTE[0];
    const existing = this._modal.data?.id;
    if (existing) {
      this._state = {
        ...this._state,
        projects: this._state.projects.map(p => p.id === existing ? { ...p, name, color } : p)
      };
    } else {
      const order = this._state.projects.length;
      const newProject = { id: 'prj-' + Date.now(), name, color, order };
      this._state = { ...this._state, projects: [...this._state.projects, newProject] };
    }
    this._modal = null;
    await this._save(); this._render();
  }

  async _savePhaseModal() {
    const w = this._wrapper;
    const name = w.querySelector('#m-name')?.value?.trim();
    if (!name) { w.querySelector('#m-name')?.focus(); return; }
    const color = w.querySelector('#m-color')?.value || PALETTE[0];
    const startYM = w.querySelector('#m-start')?.value || this._state.viewStart.slice(0, 7);
    const endRaw = w.querySelector('#m-end')?.value;
    const endYM = (endRaw && endRaw >= startYM) ? endRaw : startYM;
    const startDate = startYM + '-01';
    const [ey, em] = endYM.split('-').map(Number);
    const endDate = fmtISO(new Date(ey, em, 0));
    const projectId = this._modal.projectId || this._modal.data?.projectId;

    const existing = this._modal.data?.id;
    if (existing) {
      this._state = {
        ...this._state,
        phases: this._state.phases.map(p => p.id === existing ? { ...p, name, color, startDate, endDate } : p)
      };
    } else {
      const newPhase = { id: 'ph-' + Date.now(), projectId, name, color, startDate, endDate };
      this._state = { ...this._state, phases: [...this._state.phases, newPhase] };
    }
    this._modal = null;
    await this._save(); this._render();
  }
}

customElements.define('app-roadmap', AppRoadmap);
