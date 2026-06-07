import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { getTierList, saveTierList, subscribe } from '/shell/api.js';

class AppTier extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this._appId = null;
    this._dragCardId = null;
    this._editingCardId = null;
    this._settingsOpen = false;
    this._renameTimer = null;
  }

  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    const css = await fetch('/modules/tier/styles.css').then(r => r.text());
    styleEl.textContent = css;

    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);

    await new Promise(r => setTimeout(r, 0));

    this._appId = this.api?.instanceId || this.api?.windowId || ('tier-' + Date.now());
    this._state = await getTierList(this._appId);
    this._applyTheme();
    this._render();

    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    if (this.api) this.api.setTitle(this._state.name);

    this._unsub = subscribe('tierlists', this._appId, async () => {
      this._state = await getTierList(this._appId);
      this._render();
      if (this.api) this.api.setTitle(this._state.name);
    });
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
    this._unsub?.();
    clearTimeout(this._renameTimer);
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  async _save() {
    await saveTierList(this._appId, this._state);
  }

  _renderCard(card) {
    const isEditing = this._editingCardId === card.id;
    return `
      <div class="tier-card${isEditing ? ' editing' : ''}" draggable="${isEditing ? 'false' : 'true'}" data-card-id="${this._esc(card.id)}">
        ${card.image ? `<img class="card-img" data-card-id="${this._esc(card.id)}" data-has-img="1" alt="" />` : ''}
        ${isEditing
          ? `<textarea class="card-edit" data-card-id="${this._esc(card.id)}" rows="2">${this._esc(card.text)}</textarea>`
          : `<span class="card-text" data-card-id="${this._esc(card.id)}">${this._esc(card.text)}</span>`
        }
        <div class="card-actions">
          <button class="card-img-btn" data-action="upload-img" data-card-id="${this._esc(card.id)}" title="Upload image">🖼</button>
          <button class="card-del" data-action="del-card" data-card-id="${this._esc(card.id)}" title="Delete">✕</button>
        </div>
      </div>
    `;
  }

  _render() {
    const { name, tiers, cards } = this._state;

    const tiersHtml = tiers.map(tier => {
      const tierCards = cards.filter(c => c.tierId === tier.id);
      return `
        <div class="tier-row">
          <div class="tier-label" style="background:${this._esc(tier.color)}">
            <span>${this._esc(tier.label)}</span>
          </div>
          <div class="cards-area" data-tier-id="${this._esc(tier.id)}">
            ${tierCards.map(c => this._renderCard(c)).join('')}
          </div>
        </div>
      `;
    }).join('');

    const unrankedCards = cards.filter(c => !c.tierId);
    const instanceIcon = this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '🏆';

    this._wrapper.innerHTML = `
      <div class="header">
        <input class="tier-title" value="${this._esc(name)}" placeholder="Tier List name…" />
        <button class="header-btn primary" data-action="add-card">＋ Add Card</button>
        <button class="header-btn" data-action="toggle-settings" title="Settings">⚙️</button>
      </div>
      ${this._settingsOpen ? `
        <div class="settings-panel">
          <div class="settings-row">
            <label class="settings-label">Name</label>
            <input class="settings-input" id="settings-name" value="${this._esc(name)}" placeholder="Tier List name…" />
          </div>
          <div class="settings-row">
            <label class="settings-label">Icon</label>
            <input class="settings-input settings-icon" id="settings-icon" value="${this._esc(instanceIcon)}" placeholder="Emoji…" maxlength="4" />
          </div>
          <div class="settings-row" style="justify-content:flex-end;gap:8px;">
            <button class="settings-cancel" data-action="toggle-settings">Cancel</button>
            <button class="settings-save" data-action="save-settings">Save</button>
          </div>
        </div>
      ` : ''}
      <div class="tiers-container">
        ${tiersHtml}
        <div class="unranked-section">
          <div class="unranked-label">Unranked</div>
          <div class="unranked-pool" data-tier-id="">
            ${unrankedCards.map(c => this._renderCard(c)).join('')}
          </div>
        </div>
      </div>
    `;

    // Set image srcs via DOM to avoid injecting large base64 strings into HTML
    this._wrapper.querySelectorAll('[data-has-img]').forEach(img => {
      const card = this._state.cards.find(c => c.id === img.dataset.cardId);
      if (card?.image) img.src = card.image;
    });

    this._bindEvents();

    if (this._editingCardId) {
      const ta = this._wrapper.querySelector(`.card-edit[data-card-id="${this._editingCardId}"]`);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
  }

  _bindEvents() {
    const w = this._wrapper;

    // Title rename with debounce
    w.querySelector('.tier-title').addEventListener('input', e => {
      this._state.name = e.target.value;
      if (this.api) this.api.setTitle(this._state.name || 'Tier List');
      clearTimeout(this._renameTimer);
      this._renameTimer = setTimeout(async () => {
        await this._save();
        if (this.api?.updateInstance) {
          const icon = this.api?.store?.instances?.find(i => i.instanceId === this._appId)?.icon || '🏆';
          this.api.updateInstance(this._state.name, icon);
        }
      }, 600);
    });

    // Inline card text editing
    w.querySelectorAll('.card-text').forEach(span => {
      span.addEventListener('click', e => {
        e.stopPropagation();
        this._editingCardId = span.dataset.cardId;
        this._render();
      });
    });

    w.querySelectorAll('.card-edit').forEach(ta => {
      ta.addEventListener('blur', () => {
        const card = this._state.cards.find(c => c.id === ta.dataset.cardId);
        if (card) {
          const val = ta.value.trim();
          if (val) card.text = val;
          this._save();
        }
        this._editingCardId = null;
        this._render();
      });
      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          ta.blur();
        } else if (e.key === 'Escape') {
          this._editingCardId = null;
          this._render();
        }
      });
    });

    // Action buttons via event delegation
    w.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async e => {
        e.stopPropagation();
        const action = el.dataset.action;

        if (action === 'add-card') {
          const id = 'card-' + Date.now();
          this._state.cards.push({ id, tierId: null, text: 'New Item', image: null });
          this._editingCardId = id;
          await this._save();
          this._render();

        } else if (action === 'del-card') {
          if (this._editingCardId === el.dataset.cardId) this._editingCardId = null;
          this._state.cards = this._state.cards.filter(c => c.id !== el.dataset.cardId);
          await this._save();
          this._render();

        } else if (action === 'upload-img') {
          const cardId = el.dataset.cardId;
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.addEventListener('load', async ev => {
              const card = this._state.cards.find(c => c.id === cardId);
              if (card) {
                card.image = ev.target.result;
                await this._save();
                this._render();
              }
            });
            reader.readAsDataURL(file);
          });
          input.click();

        } else if (action === 'toggle-settings') {
          this._settingsOpen = !this._settingsOpen;
          this._render();

        } else if (action === 'save-settings') {
          const nameEl = w.querySelector('#settings-name');
          const iconEl = w.querySelector('#settings-icon');
          const newName = nameEl?.value.trim() || this._state.name;
          const newIcon = iconEl?.value.trim() || '🏆';
          this._state.name = newName;
          await this._save();
          if (this.api?.updateInstance) await this.api.updateInstance(newName, newIcon);
          else if (this.api?.setTitle) this.api.setTitle(newName);
          this._settingsOpen = false;
          this._render();
        }
      });
    });

    // Drag-and-drop (native HTML5)
    w.querySelectorAll('.tier-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        this._dragCardId = card.dataset.cardId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        w.querySelectorAll('.cards-area, .unranked-pool').forEach(z => z.classList.remove('drag-over'));
      });
    });

    w.querySelectorAll('.cards-area, .unranked-pool').forEach(zone => {
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (!this._dragCardId) return;
        const tierId = zone.dataset.tierId || null;
        const card = this._state.cards.find(c => c.id === this._dragCardId);
        if (card) {
          card.tierId = tierId;
          this._save();
          this._render();
        }
        this._dragCardId = null;
      });
    });
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

customElements.define('app-tier', AppTier);
