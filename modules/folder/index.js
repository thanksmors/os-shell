import { adoptTailwind } from '/shell/shadow-tailwind.js';

class AppFolder extends HTMLElement {
  constructor() {
    super();
    this._renameTimer = null;
    this._onInstancesChanged = () => this._render();
  }

  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    const css = await fetch('/modules/folder/styles.css').then(r => r.text());
    styleEl.textContent = css;

    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);

    await new Promise(r => setTimeout(r, 0));

    this._instanceId = this.api?.instanceId;
    this._applyTheme();
    this._render();

    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('os:instances-changed', this._onInstancesChanged);
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
    window.removeEventListener('os:instances-changed', this._onInstancesChanged);
    clearTimeout(this._renameTimer);
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  _children() {
    return (this.api?.store?.instances || []).filter(i => i.parentId === this._instanceId);
  }

  _render() {
    const inst = this.api?.store?.instances?.find(i => i.instanceId === this._instanceId);
    const name = inst?.name || 'Folder';
    const children = this._children();

    this._wrapper.innerHTML = `
      <div class="header">
        <input class="folder-title" value="${this._esc(name)}" placeholder="Folder name…" />
      </div>
      <div class="icon-grid">
        ${children.length === 0 ? `
          <div class="empty-state">
            <div class="empty-hint">Right-click a desktop icon<br>to move it into this folder</div>
          </div>
        ` : children.map(child => `
          <button class="folder-icon" data-instance-id="${this._esc(child.instanceId)}">
            <span class="folder-icon-emoji">${this._esc(child.icon)}</span>
            <span class="folder-icon-label">${this._esc(child.name)}</span>
          </button>
        `).join('')}
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const w = this._wrapper;

    w.querySelector('.folder-title').addEventListener('input', e => {
      const name = e.target.value;
      if (this.api) this.api.setTitle(name || 'Folder');
      clearTimeout(this._renameTimer);
      this._renameTimer = setTimeout(async () => {
        if (this.api?.updateInstance) {
          const inst = this.api?.store?.instances?.find(i => i.instanceId === this._instanceId);
          await this.api.updateInstance(name || 'Folder', inst?.icon || '📁');
        }
      }, 600);
    });

    w.querySelectorAll('.folder-icon').forEach(btn => {
      const childId = btn.dataset.instanceId;

      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.api?.store?.launchInstance(childId);
      });

      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const store = this.api?.store;
        if (!store) return;
        store.showContextMenu(e.clientX, e.clientY, [
          { label: '↩ Remove from Folder', action: () => store.moveToDesktop(childId) },
          { separator: true },
          { label: '🗑 Delete', action: () => store.removeInstance(childId) },
        ]);
      });
    });
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

customElements.define('app-folder', AppFolder);
