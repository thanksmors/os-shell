import { AppModuleBase } from '/shell/module-base.js';
import { showEmojiPicker } from '/shell/emoji-picker.js';

// Normalize a user-typed URL: prepend https:// for a bare host, block non-http
// schemes (javascript:, data:, …). Mirrors modules/pm/index.js:safeUrl.
function safeUrl(u) {
  let s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '#';
    s = 'https://' + s;
  }
  return s;
}

class AppLink extends AppModuleBase {
  // State lives on the desktop instance (name/icon/url), not in a data
  // collection — so the shell can open the URL synchronously on icon click.
  _instance() {
    return this.api?.store?.instances?.find(i => i.instanceId === this._appId);
  }

  async _load() {
    const inst = this._instance();
    this._state = {
      name: inst?.name || 'New link',
      icon: inst?.icon || '🔗',
      url: inst?.url || '',
    };
  }

  _getTitle() { return this._state?.name || 'Link'; }

  _render() {
    const { name, icon, url } = this._state;
    this._wrapper.innerHTML = `
      <div class="link-form">
        <div class="link-row">
          <button class="icon-pick-btn" data-action="pick-icon" title="Pick icon">
            <span id="icon-preview">${this._esc(icon)}</span> <span class="caret">▾</span>
          </button>
          <input class="link-input" id="name-input" value="${this._esc(name)}" placeholder="Name…" />
        </div>
        <label class="link-label">URL</label>
        <input class="link-input" id="url-input" value="${this._esc(url)}" placeholder="example.com" />
        <div class="link-actions">
          <button class="link-open" data-action="open">Open ↗</button>
          <button class="link-save" data-action="save">Save</button>
        </div>
      </div>
    `;
    this._bindEvents();
  }

  _bindEvents() {
    const shadow = this.shadowRoot;
    shadow.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action;
        if (action === 'pick-icon') {
          const cur = this._state.icon;
          showEmojiPicker(el, cur, emoji => {
            this._state.icon = emoji;
            const preview = shadow.querySelector('#icon-preview');
            if (preview) preview.textContent = emoji;
          });
        } else if (action === 'open') {
          const raw = shadow.querySelector('#url-input')?.value.trim();
          if (raw) window.open(safeUrl(raw), '_blank');
        } else if (action === 'save') {
          const name = shadow.querySelector('#name-input')?.value.trim() || 'New link';
          const rawUrl = shadow.querySelector('#url-input')?.value.trim();
          const url = rawUrl ? safeUrl(rawUrl) : '';
          if (this.api?.updateInstance) await this.api.updateInstance(name, this._state.icon, { url });
          this.api?.requestClose?.();
        }
      });
    });
  }
}

customElements.define('app-link', AppLink);
