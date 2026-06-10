import { AppModuleBase } from '/shell/module-base.js';
import { getData, setData } from '/shell/api.js';
import { showEmojiPicker } from '/shell/emoji-picker.js';

const CARD_W = 160, CARD_H = 84, H_GAP = 28, V_GAP = 56;

class AppPeople extends AppModuleBase {
  constructor() {
    super();
    this._settingsOpen = false;
    this._modal = null;        // null | { member, isNew, parentId }
    this._modalPhoto = undefined; // undefined = unchanged, null = removed, string = new photo
    this._ctxMenu = null;      // null | { memberId, x, y }
    this._tx = 0; this._ty = 0; this._scale = 1;
    this._panStart = null;
    this._canvas = null;
    this._firstRender = true;
    this.addEventListener('os:toggle-settings', () => {
      this._settingsOpen = !this._settingsOpen;
      this._render();
    });
  }

  _collection() { return 'people-charts'; }

  async _load() {
    const saved = await getData('people-charts', this._appId);
    const cfg = this.api?.config || {};
    this._state = saved || { name: cfg.name || 'People', members: [] };
    if (!Array.isArray(this._state.members)) this._state.members = [];
  }

  _getTitle() { return this._state?.name || 'People'; }

  _save() {
    setData('people-charts', this._appId, this._state);
  }

  _initials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  _layout(members) {
    if (!members.length) return {};
    const kids = {};
    const memberIds = new Set(members.map(m => m.id));
    members.forEach(m => {
      // Treat broken parentId references as roots
      const pk = (m.parentId && memberIds.has(m.parentId)) ? m.parentId : '__root__';
      if (!kids[pk]) kids[pk] = [];
      kids[pk].push(m);
    });

    const subtreeW = id => {
      const ch = kids[id] || [];
      if (!ch.length) return CARD_W;
      return Math.max(CARD_W, ch.reduce((s, k) => s + subtreeW(k.id) + H_GAP, -H_GAP));
    };

    const pos = {};
    const place = (id, x, y) => {
      pos[id] = { x, y };
      const ch = kids[id] || [];
      const totalW = ch.reduce((s, k) => s + subtreeW(k.id) + H_GAP, -H_GAP);
      let cx = x - totalW / 2;
      ch.forEach(k => {
        const w = subtreeW(k.id);
        place(k.id, cx + w / 2, y + CARD_H + V_GAP);
        cx += w + H_GAP;
      });
    };

    const roots = kids['__root__'] || [];
    let rx = H_GAP * 2;
    roots.forEach(r => {
      const w = subtreeW(r.id);
      place(r.id, rx + w / 2, H_GAP * 2);
      rx += w + H_GAP * 3;
    });

    return pos;
  }

  _render() {
    const { name, members } = this._state;
    const pos = this._layout(members);
    const vals = Object.values(pos);
    const canvasW = vals.length ? Math.max(...vals.map(p => p.x + CARD_W)) + H_GAP * 3 : 480;
    const canvasH = vals.length ? Math.max(...vals.map(p => p.y + CARD_H)) + V_GAP * 2 : 300;
    const icon = this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '👥';
    const transform = `translate(${this._tx}px,${this._ty}px) scale(${this._scale})`;

    let lines = '';
    members.forEach(m => {
      if (!m.parentId || !pos[m.parentId] || !pos[m.id]) return;
      const p = pos[m.parentId], c = pos[m.id];
      const px = p.x + CARD_W / 2, py = p.y + CARD_H;
      const cx = c.x + CARD_W / 2, cy = c.y;
      const my = (py + cy) / 2;
      lines += `<path d="M${px},${py} V${my} H${cx} V${cy}" fill="none" stroke="var(--conn)" stroke-width="1.5" stroke-linecap="round"/>`;
    });

    let cards = '';
    members.forEach(m => {
      if (!pos[m.id]) return;
      const { x, y } = pos[m.id];
      const isRoot = !m.parentId || !Object.prototype.hasOwnProperty.call(
        Object.fromEntries(members.filter(o => o.id !== m.id).map(o => [o.id, 1])),
        m.parentId
      );
      cards += `
        <div class="person-card${!m.parentId ? ' root-card' : ''}" style="left:${x}px;top:${y}px" data-member="${this._esc(m.id)}">
          <div class="pc-avatar">${m.photo ? `<img data-photo="${this._esc(m.id)}" alt="" />` : `<span class="pc-initials">${this._esc(this._initials(m.name))}</span>`}</div>
          <div class="pc-name">${this._esc(m.name || 'Unnamed')}</div>
          ${m.role ? `<div class="pc-role">${this._esc(m.role)}</div>` : ''}
        </div>`;
    });

    this._wrapper.innerHTML = `
      ${this._settingsOpen ? `
        <div class="settings-panel">
          <div class="settings-row">
            <label class="settings-label">Name</label>
            <input class="settings-input" id="settings-name" value="${this._esc(name)}" placeholder="Chart name…" />
          </div>
          <div class="settings-row">
            <label class="settings-label">Icon</label>
            <button class="icon-pick-btn" data-action="pick-icon">
              <span id="settings-icon-preview">${this._esc(icon)}</span><span class="icon-pick-caret">▾</span>
            </button>
            <input type="hidden" id="settings-icon" value="${this._esc(icon)}" />
          </div>
          <div class="settings-row settings-row-end">
            <button class="tb-btn" data-action="toggle-settings">Cancel</button>
            <button class="tb-btn primary" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="toolbar">
        <span class="chart-name">${this._esc(name)}</span>
        <div class="toolbar-right">
          <button class="tb-btn" data-action="fit">⊡ Fit</button>
          <button class="tb-btn primary" data-action="add-person">＋ Add Person</button>
        </div>
      </div>
      <div class="chart-outer">
        ${!members.length ? `
          <div class="empty-state">
            <div class="empty-icon">👥</div>
            <div class="empty-title">No people yet</div>
            <div class="empty-sub">Add your first person to build the org chart</div>
            <button class="tb-btn primary" data-action="add-person" style="margin-top:14px">＋ Add Person</button>
          </div>
        ` : `
          <div class="chart-canvas" style="width:${canvasW}px;height:${canvasH}px;transform:${transform}">
            <svg style="position:absolute;inset:0;width:${canvasW}px;height:${canvasH}px;pointer-events:none;overflow:visible">${lines}</svg>
            ${cards}
          </div>
        `}
      </div>
      ${this._ctxMenu ? `
        <div class="ctx-menu" style="left:${this._ctxMenu.x}px;top:${this._ctxMenu.y}px">
          <button class="ctx-item" data-action="ctx-edit" data-member="${this._esc(this._ctxMenu.memberId)}">✏️ Edit</button>
          <button class="ctx-item" data-action="ctx-add-report" data-member="${this._esc(this._ctxMenu.memberId)}">➕ Add Report</button>
          <div class="ctx-sep"></div>
          <button class="ctx-item ctx-danger" data-action="ctx-delete" data-member="${this._esc(this._ctxMenu.memberId)}">🗑 Delete</button>
        </div>
      ` : ''}
      ${this._modal ? this._modalHtml() : ''}
    `;

    // Set card photo sources (avoid large base64 in HTML attributes)
    members.forEach(m => {
      if (!m.photo) return;
      const img = this._wrapper.querySelector(`img[data-photo="${m.id}"]`);
      if (img) img.src = m.photo;
    });

    this._canvas = this._wrapper.querySelector('.chart-canvas');
    this._bindEvents();

    if (this._firstRender && members.length) {
      this._firstRender = false;
      setTimeout(() => this._fit(), 60);
    }
  }

  _modalHtml() {
    const { member, isNew, parentId: preParent } = this._modal;
    const activeParentId = preParent || member?.parentId || null;
    const photo = this._modalPhoto !== undefined ? this._modalPhoto : (member?.photo || null);
    const memberIds = new Set(this._state.members.map(m => m.id));

    const parentOptions = this._state.members
      .filter(m => isNew || m.id !== member?.id)
      .map(m => `<option value="${this._esc(m.id)}"${activeParentId === m.id ? ' selected' : ''}>${this._esc(m.name || 'Unnamed')}</option>`)
      .join('');

    return `
      <div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">
            <span class="modal-title">${isNew ? 'Add Person' : 'Edit Person'}</span>
            <button class="modal-close-btn" data-action="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="avatar-row">
              <div class="pc-avatar pc-avatar-lg" id="modal-avatar">
                ${photo
                  ? `<img id="modal-photo-img" alt="" />`
                  : `<span class="pc-initials">${this._esc(this._initials(member?.name || ''))}</span>`
                }
              </div>
              <div class="avatar-btns">
                <button class="tb-btn" data-action="upload-photo">Upload photo</button>
                ${photo ? `<button class="tb-btn danger-btn" data-action="remove-photo">Remove</button>` : ''}
              </div>
              <input type="file" id="photo-input" accept="image/*" style="display:none" />
            </div>
            <div class="field-row">
              <label class="field-label">Name *</label>
              <input class="field-input" id="modal-name" value="${this._esc(member?.name || '')}" placeholder="Full name" />
            </div>
            <div class="field-row">
              <label class="field-label">Role</label>
              <input class="field-input" id="modal-role" value="${this._esc(member?.role || '')}" placeholder="Job title" />
            </div>
            <div class="field-row">
              <label class="field-label">Dept</label>
              <input class="field-input" id="modal-dept" value="${this._esc(member?.department || '')}" placeholder="Team or department" />
            </div>
            <div class="field-row">
              <label class="field-label">Email</label>
              <input class="field-input" type="email" id="modal-email" value="${this._esc(member?.email || '')}" placeholder="email@example.com" />
            </div>
            <div class="field-row">
              <label class="field-label">Phone</label>
              <input class="field-input" type="tel" id="modal-phone" value="${this._esc(member?.phone || '')}" placeholder="+1 555 000 0000" />
            </div>
            <div class="field-row">
              <label class="field-label">Reports to</label>
              <select class="field-input" id="modal-parent">
                <option value="">— No parent —</option>
                ${parentOptions}
              </select>
            </div>
            <div class="field-row">
              <label class="field-label">Bio</label>
              <textarea class="field-input" id="modal-bio" rows="3" placeholder="Short bio…">${this._esc(member?.bio || '')}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            ${!isNew ? `<button class="modal-delete-btn" data-action="modal-delete">Delete</button>` : '<div></div>'}
            <div class="modal-footer-right">
              <button class="tb-btn" data-action="modal-close">Cancel</button>
              <button class="tb-btn primary" data-action="modal-save">Save</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  _openModal(member, parentId = null) {
    this._modal = { member: member || null, isNew: !member, parentId };
    this._modalPhoto = undefined;
    this._ctxMenu = null;
    this._render();
    setTimeout(() => this._wrapper.querySelector('#modal-name')?.focus(), 0);
  }

  _closeModal() {
    this._modal = null;
    this._modalPhoto = undefined;
    this._render();
  }

  _fit() {
    const outer = this._wrapper.querySelector('.chart-outer');
    if (!outer || !this._canvas) return;
    const pos = this._layout(this._state.members);
    const ids = Object.keys(pos);
    if (!ids.length) return;
    const pad = H_GAP;
    const minX = Math.min(...ids.map(id => pos[id].x)) - pad;
    const minY = Math.min(...ids.map(id => pos[id].y)) - pad;
    const maxX = Math.max(...ids.map(id => pos[id].x + CARD_W)) + pad;
    const maxY = Math.max(...ids.map(id => pos[id].y + CARD_H)) + pad;
    const ow = outer.clientWidth || 600, oh = outer.clientHeight || 400;
    const scaleX = ow / (maxX - minX), scaleY = oh / (maxY - minY);
    this._scale = Math.min(scaleX, scaleY, 1.5);
    this._tx = (ow - (maxX - minX) * this._scale) / 2 - minX * this._scale;
    this._ty = (oh - (maxY - minY) * this._scale) / 2 - minY * this._scale;
    this._updateTransform();
  }

  _updateTransform() {
    if (this._canvas) {
      this._canvas.style.transform = `translate(${this._tx}px,${this._ty}px) scale(${this._scale})`;
    }
  }

  _bindEvents() {
    const w = this._wrapper;

    // Dismiss ctx menu on outside click
    w.addEventListener('click', e => {
      if (this._ctxMenu && !e.target.closest('.ctx-menu')) {
        this._ctxMenu = null;
        this._render();
      }
    }, { capture: true });

    // Wheel zoom
    const outer = w.querySelector('.chart-outer');
    if (outer && this._canvas) {
      outer.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = outer.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const newScale = Math.max(0.3, Math.min(2.5, this._scale * factor));
        const sf = newScale / this._scale;
        this._tx = mx - (mx - this._tx) * sf;
        this._ty = my - (my - this._ty) * sf;
        this._scale = newScale;
        this._updateTransform();
      }, { passive: false });

      // Pan
      outer.addEventListener('pointerdown', e => {
        if (e.target.closest('.person-card') || e.button !== 0) return;
        this._panStart = { x: e.clientX - this._tx, y: e.clientY - this._ty };
        outer.setPointerCapture(e.pointerId);
        outer.classList.add('panning');
      });
      outer.addEventListener('pointermove', e => {
        if (!this._panStart) return;
        this._tx = e.clientX - this._panStart.x;
        this._ty = e.clientY - this._panStart.y;
        this._updateTransform();
      });
      const endPan = () => { this._panStart = null; outer.classList.remove('panning'); };
      outer.addEventListener('pointerup', endPan);
      outer.addEventListener('pointercancel', endPan);
    }

    // Person card interactions
    w.querySelectorAll('.person-card').forEach(card => {
      card.addEventListener('click', e => {
        e.stopPropagation();
        const member = this._state.members.find(m => m.id === card.dataset.member);
        if (member) this._openModal(member);
      });
      card.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const rect = w.getBoundingClientRect();
        this._ctxMenu = { memberId: card.dataset.member, x: e.clientX - rect.left, y: e.clientY - rect.top };
        this._render();
      });
    });

    // Set modal photo post-render (avoid large base64 in HTML attributes)
    if (this._modal) {
      const photo = this._modalPhoto !== undefined ? this._modalPhoto : (this._modal.member?.photo || null);
      if (photo) {
        const img = w.querySelector('#modal-photo-img');
        if (img) img.src = photo;
      }
    }

    // All data-action buttons
    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async e => {
        e.stopPropagation();
        const action = el.dataset.action;

        if (action === 'pick-icon') {
          const cur = w.querySelector('#settings-icon')?.value || '👥';
          showEmojiPicker(el, cur, emoji => {
            const hidden = w.querySelector('#settings-icon');
            const preview = w.querySelector('#settings-icon-preview');
            if (hidden) hidden.value = emoji;
            if (preview) preview.textContent = emoji;
          });
        } else if (action === 'toggle-settings') {
          this._settingsOpen = !this._settingsOpen;
          this._render();
        } else if (action === 'save-settings') {
          const newName = w.querySelector('#settings-name')?.value.trim() || this._state.name;
          const newIcon = w.querySelector('#settings-icon')?.value || '👥';
          this._state.name = newName;
          this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
          else if (this.api?.setTitle) this.api.setTitle(newName);
          this._settingsOpen = false;
          this._render();
        } else if (action === 'fit') {
          this._fit();
        } else if (action === 'add-person') {
          this._openModal(null);
        } else if (action === 'modal-close') {
          this._closeModal();
        } else if (action === 'modal-save') {
          const nameEl = w.querySelector('#modal-name');
          const name = nameEl?.value.trim();
          if (!name) { nameEl?.classList.add('input-error'); nameEl?.focus(); return; }
          const photo = this._modalPhoto !== undefined ? this._modalPhoto : (this._modal.member?.photo || null);
          const parentVal = w.querySelector('#modal-parent')?.value || null;
          const updated = {
            id: this._modal.isNew ? `mbr-${Date.now()}` : this._modal.member.id,
            name,
            role: w.querySelector('#modal-role')?.value.trim() || '',
            department: w.querySelector('#modal-dept')?.value.trim() || '',
            email: w.querySelector('#modal-email')?.value.trim() || '',
            phone: w.querySelector('#modal-phone')?.value.trim() || '',
            bio: w.querySelector('#modal-bio')?.value.trim() || '',
            photo,
            parentId: parentVal || null,
          };
          if (this._modal.isNew) {
            this._state.members = [...this._state.members, updated];
          } else {
            this._state.members = this._state.members.map(m => m.id === updated.id ? updated : m);
          }
          this._save();
          this._modal = null;
          this._modalPhoto = undefined;
          this._render();
        } else if (action === 'modal-delete') {
          const mid = this._modal.member.id;
          this._state.members = this._state.members
            .map(m => m.parentId === mid ? { ...m, parentId: null } : m)
            .filter(m => m.id !== mid);
          this._save();
          this._modal = null;
          this._render();
        } else if (action === 'upload-photo') {
          w.querySelector('#photo-input')?.click();
        } else if (action === 'remove-photo') {
          this._modalPhoto = null;
          this._render();
          setTimeout(() => w.querySelector('#modal-name')?.focus(), 0);
        } else if (action === 'ctx-edit') {
          const member = this._state.members.find(m => m.id === el.dataset.member);
          if (member) this._openModal(member);
        } else if (action === 'ctx-add-report') {
          this._openModal(null, el.dataset.member);
        } else if (action === 'ctx-delete') {
          const mid = el.dataset.member;
          this._ctxMenu = null;
          this._state.members = this._state.members
            .map(m => m.parentId === mid ? { ...m, parentId: null } : m)
            .filter(m => m.id !== mid);
          this._save();
          this._render();
        }
      });
    });

    // Photo file input
    const photoInput = w.querySelector('#photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          this._modalPhoto = ev.target.result;
          this._render();
        };
        reader.readAsDataURL(file);
      });
    }
  }
}

customElements.define('app-people', AppPeople);
