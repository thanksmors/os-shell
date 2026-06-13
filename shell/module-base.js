import { setupShell } from '/shell/shell-setup.js';
import { subscribe, getData, setData } from '/shell/api.js';
import { getCollections, createCollection } from '/modules/data/api.js';
import { motion, spring } from '/shell/motion.js';

export class AppModuleBase extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this._appId = null;
    this._wrapper = null;
    this._themeCleanup = null;
    this._unsub = null;
    this._slots = {}; // resolved slot → collection name
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async connectedCallback() {
    // 1. Shadow DOM setup (+ wait one tick for el.api). Generated modules pass
    // cssUrl on the manifest; read from the Alpine store directly because
    // this.api isn't set until the tick wait inside setupShell.
    const moduleId = this._moduleId();
    const cssUrl = window.Alpine?.store('os')?.apps?.[moduleId]?.cssUrl
      || `/modules/${moduleId}/styles.css`;
    const { wrapper } = await setupShell(this, { cssUrl, extraCssUrls: ['/shell/setup-dialog.css'] });
    this._wrapper = wrapper;

    // 2. Resolve stable appId
    this._appId = this._resolveAppId();

    // 3. Resolve required collections (shows setup dialog if needed)
    await this._setupCollections();

    // 4. Load data (subclass)
    await this._load();

    // 5. Render (subclass)
    this._applyTheme();
    this._wrapper.style.opacity = '0';
    this._render();
    if (this.api) this.api.setTitle(this._getTitle());
    this.api?.setReady?.();
    motion(this._wrapper, { opacity: [0, 1] }, { ...spring.smooth() });

    // 6. Theme sync — use Alpine's reactive store so no DOM polling needed
    this._themeCleanup = Alpine.effect(() => {
      Alpine.store('os').theme; // subscribe to reactive value
      this._applyTheme();
    });

    // 7. Cross-client sync — only if manifest declares sync:true
    const manifest = this.api?.store?.apps?.[this._manifestId()];
    if (manifest?.sync) {
      const collection = this._collection();
      this._unsub = subscribe(collection, this._appId, async () => {
        await this._load();
        this._render();
        if (this.api) this.api.setTitle(this._getTitle());
      });
    }
  }

  disconnectedCallback() {
    this._themeCleanup?.();
    this._unsub?.();
  }

  // ─── Required collections setup ───────────────────────────────────────────

  async _setupCollections() {
    const manifest = this.api?.store?.apps?.[this._manifestId()];
    const required = manifest?.requiredCollections;
    if (!required?.length) return;

    // Load previously saved slot resolutions for this instance
    const saved = await getData('module-settings', this._appId) || {};
    this._slots = { ...saved };

    // Find slots not yet resolved
    const unresolved = required.filter(r => !this._slots[r.slot]);
    if (!unresolved.length) return;

    // Check which defaults already exist as collections
    const existing = await getCollections();
    const toCreate = [];
    for (const r of unresolved) {
      if (existing[r.default] !== undefined) {
        // Default collection already exists — auto-resolve, no dialog
        this._slots[r.slot] = r.default;
      } else {
        toCreate.push(r);
      }
    }

    // Save auto-resolved slots
    if (toCreate.length === 0) {
      await setData('module-settings', this._appId, this._slots);
      return;
    }

    // Show setup dialog for remaining unresolved slots
    await this._showSetupDialog(toCreate, existing);
    await setData('module-settings', this._appId, this._slots);
  }

  _showSetupDialog(items, existing) {
    return new Promise(resolve => {
      this.api?.setReady?.(); // dialog replaces content — hide the shell skeleton
      this._applyTheme();
      const existingNames = Object.keys(existing);

      const rows = items.map((r, i) => `
        <div class="setup-row" data-idx="${i}">
          <div class="setup-slot-label">${this._esc(r.hint || r.default)}</div>
          <div class="setup-choices">
            <button class="setup-btn setup-create active" data-idx="${i}" data-action="use-default">
              Create "${this._esc(r.default)}"
            </button>
            ${existingNames.length ? `
              <span class="setup-or">or</span>
              <select class="setup-select" data-idx="${i}" data-action="use-existing">
                <option value="">Use existing…</option>
                ${existingNames.map(n => `<option value="${this._esc(n)}">${this._esc(n)}</option>`).join('')}
              </select>
            ` : ''}
          </div>
          <div class="setup-resolved" data-resolved="${i}" style="display:none">
            <span class="setup-check">✓</span>
            <span class="setup-resolved-name"></span>
          </div>
        </div>
      `).join('');

      this._wrapper.innerHTML = `
        <div class="setup-panel">
          <div class="setup-icon">🗄️</div>
          <div class="setup-title">Set up collections</div>
          <div class="setup-desc">This module needs a few data collections to get started.</div>
          <div class="setup-rows">${rows}</div>
          <button class="setup-continue" id="setup-continue" disabled>Continue →</button>
        </div>
      `;

      // Track choices: idx → { slot, name }
      const choices = {};
      // Pre-select "create default" for all
      items.forEach((r, i) => { choices[i] = { slot: r.slot, name: r.default }; });
      this._updateContinueBtn(choices, items.length);

      const shadow = this.shadowRoot;

      shadow.querySelectorAll('.setup-btn[data-action="use-default"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.dataset.idx);
          choices[i] = { slot: items[i].slot, name: items[i].default };
          shadow.querySelector(`.setup-select[data-idx="${i}"]`).value = '';
          btn.classList.add('active');
          this._updateContinueBtn(choices, items.length);
        });
      });

      shadow.querySelectorAll('.setup-select[data-action="use-existing"]').forEach(sel => {
        sel.addEventListener('change', () => {
          const i = parseInt(sel.dataset.idx);
          if (sel.value) {
            choices[i] = { slot: items[i].slot, name: sel.value };
            shadow.querySelector(`.setup-btn[data-idx="${i}"]`)?.classList.remove('active');
          } else {
            choices[i] = { slot: items[i].slot, name: items[i].default };
            shadow.querySelector(`.setup-btn[data-idx="${i}"]`)?.classList.add('active');
          }
          this._updateContinueBtn(choices, items.length);
        });
      });

      shadow.querySelector('#setup-continue').addEventListener('click', async () => {
        const owner = { instanceId: this._appId, appId: this._moduleId() };
        const created = [];
        // Snapshot existing names before creating so we know which are new.
        const existingNames = new Set(Object.keys(existing));
        for (const { slot, name } of Object.values(choices)) {
          await createCollection(name, owner); // no-op + no owner stamp if collection already existed
          this._slots[slot] = name;
          if (!existingNames.has(name)) created.push(name);
        }
        // Record newly created collections so removeInstance can clean them up.
        if (created.length) {
          const prev = this._slots._createdCollections || [];
          this._slots._createdCollections = [...new Set([...prev, ...created])];
        }
        resolve();
      });
    });
  }

  _updateContinueBtn(choices, total) {
    const btn = this.shadowRoot?.querySelector('#setup-continue');
    if (!btn) return;
    const ready = Object.keys(choices).length >= total;
    btn.disabled = !ready;
  }

  /** Returns the resolved collection name for a declared slot. */
  _collectionFor(slot) {
    return this._slots[slot] || slot;
  }

  // ─── Subclass hooks ───────────────────────────────────────────────────────

  /** Called once after shadow DOM is ready and el.api is available. Load persisted state into this._state here. */
  async _load() {}
  /** Called after _load() and on every state change. Write to this._wrapper.innerHTML here. */
  _render() {}
  /** Return the string to display in the OS titlebar. Called after _render(). */
  _getTitle() { return this._state?.name || ''; }
  /** Return the localStorage collection name used for cross-client sync polling. Defaults to appId. */
  _collection() { return this._manifestId(); }

  // ─── Shared utilities ─────────────────────────────────────────────────────

  _esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  _resolveAppId() {
    const id = this._manifestId();
    return this.api?.instanceId || this.api?.windowId || (`${id}-${Date.now()}`);
  }

  _moduleId() {
    const tag = this.tagName.toLowerCase();
    // Generated modules get a unique runtime tag per (re)install — app-{id}--v{n}.
    // Strip the suffix to recover the stable appId for manifest/cssUrl/appId lookup.
    return tag.replace(/^app-/, '').replace(/--v\d+$/, '');
  }

  _manifestId() {
    return this._moduleId();
  }
}
