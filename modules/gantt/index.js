import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { getGantt, saveGantt } from '/shell/api.js';

const MONTH_W = 64;       // px per month column
const ROW_H = 40;         // px per project row
const HEADER_H = 56;      // px for the two header rows combined
const COLORS = ['#007aff','#34c759','#ff9500','#ff3b30','#af52de','#5ac8fa','#ff2d55','#a2845e'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

class AppGantt extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this._appId = null;
    this._settingsOpen = false;
    this._editProject = null;   // project object being edited (modal open)
    this._viewStart = null;     // Date — first visible month
  }

  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const styleEl = document.createElement('style');
    styleEl.textContent = await fetch('/modules/gantt/styles.css').then(r => r.text());
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);

    await new Promise(r => setTimeout(r, 0));
    this._appId = this.api?.instanceId || this.api?.windowId || ('gantt-' + Date.now());
    this._state = await getGantt(this._appId);

    const cfg = this.api?.config || {};
    if (cfg.name && this._state.projects.length === 0 && this._state.name === 'My Projects') {
      this._state.name = cfg.name;
      await saveGantt(this._appId, this._state);
    }

    this._viewStart = this._quarterStart(new Date());

    this._applyTheme();
    this._render();
    if (this.api) this.api.setTitle(this._state.name);

    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  disconnectedCallback() { this._themeObserver?.disconnect(); }
  _applyTheme() { this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark')); }
  async _save() { await saveGantt(this._appId, this._state); }

  _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Date helpers ─────────────────────────────────────────────────────────
  _quarterStart(date) {
    const d = new Date(date);
    const q = Math.floor(d.getMonth() / 3);
    return new Date(d.getFullYear(), q * 3, 1);
  }

  _todayISO() { return new Date().toISOString().slice(0, 10); }

  _addMonthISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  // fractional months between two dates, approximating each month as its real day count
  _monthsBetween(fromDate, toDate) {
    const from = new Date(fromDate), to = new Date(toDate);
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    const daysInToMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
    months += (to.getDate() - from.getDate()) / daysInToMonth;
    return months;
  }

  _monthsArray() {
    const count = this._state.viewMonths || 12;
    const arr = [];
    const base = this._viewStart;
    for (let i = 0; i < count; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const m = d.getMonth();
      arr.push({
        year: d.getFullYear(),
        month: m,
        label: m === 0 ? `${MONTH_NAMES[m]} '${String(d.getFullYear()).slice(2)}` : MONTH_NAMES[m],
        isQuarterStart: m % 3 === 0,
      });
    }
    return arr;
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  _render() {
    const { name, viewMonths, projects } = this._state;
    const months = this._monthsArray();
    const tlWidth = months.length * MONTH_W;
    const curIcon = this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '📊';

    // Quarter cells (span up to 3 months)
    let quarterCells = '';
    for (let i = 0; i < months.length; i += 3) {
      const chunk = months.slice(i, i + 3);
      const q = Math.floor(chunk[0].month / 3) + 1;
      const w = chunk.length * MONTH_W;
      quarterCells += `<div class="quarter-cell" style="width:${w}px;">Q${q} ${chunk[0].year}</div>`;
    }

    const monthCells = months.map(m =>
      `<div class="month-cell ${m.isQuarterStart ? 'quarter-start' : ''}" style="width:${MONTH_W}px;">${this._esc(m.label)}</div>`
    ).join('');

    // grid lines
    let gridLines = '';
    for (let i = 0; i < months.length; i++) {
      gridLines += `<div class="grid-line ${months[i].isQuarterStart ? 'quarter' : ''}" style="left:${i * MONTH_W}px;"></div>`;
    }

    const gridHeight = projects.length * ROW_H;

    const bars = projects.map(p => {
      const left = this._monthsBetween(this._viewStart, p.startDate) * MONTH_W;
      let durMonths = this._monthsBetween(p.startDate, p.endDate);
      if (!(durMonths > 0)) durMonths = 0.25;
      const width = Math.max(durMonths * MONTH_W, MONTH_W * 0.25);
      return `
        <div class="bar-row">
          <div class="project-bar" data-action="edit-project" data-id="${p.id}"
               style="left:${left}px;width:${width}px;background:${p.color};" title="${this._esc(p.name)}">
            ${this._esc(p.name)}
          </div>
        </div>`;
    }).join('');

    const leftRows = projects.map(p => `
      <div class="project-row" data-action="edit-project" data-id="${p.id}">
        <span class="project-row-dot" style="background:${p.color};"></span>
        <span class="project-row-name">${this._esc(p.name)}</span>
        <button class="project-row-del" data-action="del-project" data-id="${p.id}" title="Delete">✕</button>
      </div>`).join('');

    this._wrapper.innerHTML = `
      <div class="header">
        <input class="board-title" value="${this._esc(name)}" placeholder="Board name…" />
        <div class="header-spacer"></div>
        <div class="view-toggle">
          ${[12,24,36].map(v => `<button class="view-btn ${viewMonths === v ? 'active' : ''}" data-action="set-view" data-v="${v}">${v}m</button>`).join('')}
        </div>
        <button class="nav-btn" data-action="prev-q" title="Previous quarter">‹</button>
        <button class="nav-btn" data-action="next-q" title="Next quarter">›</button>
        <button class="icon-btn" data-action="toggle-settings" title="Settings">⚙️</button>
      </div>
      ${this._settingsOpen ? `
        <div class="settings-panel">
          <div class="settings-row">
            <label class="settings-label">Name</label>
            <input class="settings-input" id="settings-name" value="${this._esc(name)}" placeholder="Board name…" />
          </div>
          <div class="settings-row">
            <label class="settings-label">Icon</label>
            <input class="settings-input settings-icon" id="settings-icon" value="${this._esc(curIcon)}" placeholder="Emoji…" maxlength="4" />
          </div>
          <div class="settings-row" style="justify-content:flex-end;gap:8px;">
            <button class="settings-cancel" data-action="toggle-settings">Cancel</button>
            <button class="settings-save" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="gantt-body">
        <div class="gantt-left">
          <div class="gantt-left-header">Projects</div>
          <div class="gantt-left-rows">${leftRows}</div>
          <button class="add-project-btn" data-action="add-project">＋ Add project</button>
        </div>
        <div class="gantt-right">
          <div class="timeline" style="width:${tlWidth}px;">
            <div class="quarter-header-row" style="width:${tlWidth}px;">${quarterCells}</div>
            <div class="month-header-row" style="width:${tlWidth}px;">${monthCells}</div>
            <div class="gantt-grid" style="width:${tlWidth}px;height:${Math.max(gridHeight, 1)}px;">
              ${gridLines}
              ${bars}
              ${projects.length === 0 ? `
                <div class="empty">
                  <div class="empty-icon">📊</div>
                  <div>No projects yet — add one to start</div>
                </div>` : ''}
            </div>
          </div>
        </div>
      </div>
      ${this._editProject ? this._renderEdit(this._editProject) : ''}
    `;

    this._bindEvents();
  }

  _renderEdit(p) {
    const swatches = COLORS.map(c =>
      `<span class="color-swatch ${c === p.color ? 'selected' : ''}" style="background:${c};color:${c};" data-action="pick-color" data-color="${c}"></span>`
    ).join('');
    return `
      <div class="edit-overlay" data-action="edit-overlay">
        <div class="edit-panel" data-stop-close>
          <div class="edit-title">Edit project</div>
          <div class="edit-field">
            <label>Name</label>
            <input class="edit-input" id="edit-name" value="${this._esc(p.name)}" placeholder="Project name…" />
          </div>
          <div class="edit-dates">
            <div class="edit-field">
              <label>Start</label>
              <input class="edit-input" type="date" id="edit-start" value="${this._esc(p.startDate)}" />
            </div>
            <div class="edit-field">
              <label>End</label>
              <input class="edit-input" type="date" id="edit-end" value="${this._esc(p.endDate)}" />
            </div>
          </div>
          <div class="edit-field">
            <label>Color</label>
            <div class="color-swatches">${swatches}</div>
          </div>
          <div class="edit-actions">
            <button class="edit-delete" data-action="del-from-edit">Delete</button>
            <div class="spacer"></div>
            <button class="edit-cancel" data-action="close-edit">Cancel</button>
            <button class="edit-save" data-action="save-edit">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const w = this._wrapper;

    w.querySelector('.board-title')?.addEventListener('input', e => {
      this._state.name = e.target.value;
      if (this.api) this.api.setTitle(this._state.name || 'Gantt');
      this._save();
    });

    w.querySelector('[data-stop-close]')?.addEventListener('click', e => e.stopPropagation());

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
          const nameEl = w.querySelector('#settings-name');
          const iconEl = w.querySelector('#settings-icon');
          const newName = nameEl?.value.trim() || this._state.name;
          const newIcon = iconEl?.value.trim() || '📊';
          this._state.name = newName;
          await this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
          else if (this.api?.setTitle) this.api.setTitle(newName);
          this._settingsOpen = false;
          this._render();
          return;
        }
        if (action === 'set-view') {
          this._state.viewMonths = parseInt(el.dataset.v, 10);
          this._save();
          this._render();
          return;
        }
        if (action === 'prev-q') {
          this._viewStart = new Date(this._viewStart.getFullYear(), this._viewStart.getMonth() - 3, 1);
          this._render();
          return;
        }
        if (action === 'next-q') {
          this._viewStart = new Date(this._viewStart.getFullYear(), this._viewStart.getMonth() + 3, 1);
          this._render();
          return;
        }
        if (action === 'add-project') {
          const today = this._todayISO();
          const proj = {
            id: 'proj-' + Date.now(),
            name: 'New Project',
            startDate: today,
            endDate: this._addMonthISO(today, 1),
            color: COLORS[this._state.projects.length % COLORS.length],
          };
          this._state.projects.push(proj);
          await this._save();
          this._editProject = proj;
          this._render();
          return;
        }
        if (action === 'edit-project') {
          const p = this._state.projects.find(x => x.id === el.dataset.id);
          if (p) { this._editProject = p; this._render(); }
          return;
        }
        if (action === 'del-project') {
          this._state.projects = this._state.projects.filter(x => x.id !== el.dataset.id);
          if (this._editProject?.id === el.dataset.id) this._editProject = null;
          await this._save();
          this._render();
          return;
        }
        if (action === 'pick-color') {
          if (this._editProject) {
            this._editProject.color = el.dataset.color;
            this._render();
          }
          return;
        }
        if (action === 'save-edit') {
          if (this._editProject) {
            const nameEl = w.querySelector('#edit-name');
            const startEl = w.querySelector('#edit-start');
            const endEl = w.querySelector('#edit-end');
            this._editProject.name = (nameEl?.value.trim()) || 'Untitled';
            if (startEl?.value) this._editProject.startDate = startEl.value;
            if (endEl?.value) this._editProject.endDate = endEl.value;
            await this._save();
          }
          this._editProject = null;
          this._render();
          return;
        }
        if (action === 'del-from-edit') {
          if (this._editProject) {
            this._state.projects = this._state.projects.filter(x => x.id !== this._editProject.id);
            this._editProject = null;
            await this._save();
            this._render();
          }
          return;
        }
        if (action === 'close-edit' || action === 'edit-overlay') {
          this._editProject = null;
          this._render();
          return;
        }
      });
    });

    // focus name in edit modal
    w.querySelector('#edit-name')?.focus();
  }
}

customElements.define('app-gantt', AppGantt);
