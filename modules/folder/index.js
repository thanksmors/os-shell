import { AppModuleBase } from '/shell/module-base.js';

class AppFolder extends AppModuleBase {
  constructor() {
    super();
    this._dragChildId = null;
    this._onInstancesChanged = () => this._render();
  }

  // Override to add the window-level instances listener after base setup completes.
  async connectedCallback() {
    await super.connectedCallback();
    window.addEventListener('os:instances-changed', this._onInstancesChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('os:instances-changed', this._onInstancesChanged);
  }

  async _load() {
    this._state = {}; // no persistent data; identity comes from this._appId
  }

  _getTitle() { return 'Folder'; }

  _children() {
    return (this.api?.store?.instances || []).filter(i => i.parentId === this._appId);
  }

  _render() {
    const children = this._children();

    this._wrapper.innerHTML = `
      <div class="icon-grid">
        ${children.length === 0 ? `
          <div class="empty-state">
            <div class="empty-hint">Drag a desktop icon here<br>to add it to this folder</div>
          </div>
        ` : children.map(child => `
          <button class="folder-icon" draggable="true" data-instance-id="${this._esc(child.instanceId)}">
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

    // External drop: desktop icon dragged into this folder window
    const grid = w.querySelector('.icon-grid');
    grid.addEventListener('dragover', e => {
      const store = this.api?.store;
      if (!store?.dragInstanceId) return;
      const dragged = store.instances.find(i => i.instanceId === store.dragInstanceId);
      if (dragged && dragged.parentId !== this._appId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        grid.classList.add('drop-target');
      }
    });
    grid.addEventListener('dragleave', e => {
      if (!grid.contains(e.relatedTarget)) grid.classList.remove('drop-target');
    });
    grid.addEventListener('drop', e => {
      e.preventDefault();
      grid.classList.remove('drop-target');
      const store = this.api?.store;
      if (!store?.dragInstanceId) return;
      store.moveToFolder(store.dragInstanceId, this._appId);
      store.dragInstanceId = null;
      store.dragDesktopKey = null;
      store.dragOverFolderId = null;
      store.dragOverDesktopKey = null;
    });

    // Child icon interactions: click, context menu, and internal reorder drag
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
          { label: '🗑 Delete', action: () => store.removeInstance(childId) },
        ]);
      });

      // Internal reorder drag (also notifies store so desktop drop zones work)
      btn.addEventListener('dragstart', e => {
        this._dragChildId = childId;
        btn.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
        if (this.api?.store) this.api.store.beginInstanceDrag(childId);
      });
      btn.addEventListener('dragend', () => {
        this._dragChildId = null;
        if (this.api?.store) this.api.store.endInstanceDrag();
        this._render();
      });
      btn.addEventListener('dragover', e => {
        if (this._dragChildId && this._dragChildId !== childId) {
          e.preventDefault();
          e.stopPropagation();
          btn.classList.add('reorder-target');
        }
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('reorder-target'));
      btn.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('reorder-target');
        if (this._dragChildId && this._dragChildId !== childId) {
          this.api.store.reorderInstance(this._dragChildId, childId);
          this._dragChildId = null;
        }
      });
    });
  }
}

customElements.define('app-folder', AppFolder);
