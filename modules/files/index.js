import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { getData, setData, deleteData } from '/shell/api.js';

const META_COL = 'files-meta';
const DATA_COL = 'files-data';
const META_KEY = 'root';

const FILE_ICONS = {
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
  pdf: '📕', doc: '📝', docx: '📝', txt: '📄', md: '📄',
  js: '📜', ts: '📜', html: '🌐', css: '🎨', json: '📋', py: '🐍',
  mp3: '🎵', mp4: '🎬', wav: '🎵', mov: '🎬',
  zip: '📦', tar: '📦', gz: '📦',
};

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return FILE_ICONS[ext] || '📄';
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

class AppFiles extends HTMLElement {
  constructor() {
    super();
    this._meta = { folders: [], files: [] };
    this._activeFolderId = null;
    this._uploading = false;
    this._addingFolder = false;
    this._wrapper = null;
    this._themeObserver = null;
  }

  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const css = await fetch('/modules/files/styles.css').then(r => r.text()).catch(() => '');
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);
    await new Promise(r => setTimeout(r, 0));

    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    await this._load();
    this._render();
    this.api?.setReady?.();
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Data ─────────────────────────────────────────────────────────────────

  async _load() {
    const saved = await getData(META_COL, META_KEY);
    if (saved?.folders || saved?.files) {
      this._meta = { folders: saved.folders || [], files: saved.files || [] };
    } else {
      this._meta = { folders: [], files: [] };
      await setData(META_COL, META_KEY, this._meta);
    }
  }

  async _saveMeta() {
    await setData(META_COL, META_KEY, this._meta);
  }

  _foldersIn(parentId) {
    return this._meta.folders.filter(f => (f.parentId ?? null) === parentId);
  }

  _filesIn(folderId) {
    return this._meta.files.filter(f => (f.folderId ?? null) === folderId);
  }

  _folderPath(folderId) {
    if (!folderId) return [];
    const path = [];
    let cur = folderId;
    const seen = new Set();
    while (cur) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const folder = this._meta.folders.find(f => f.id === cur);
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name });
      cur = folder.parentId ?? null;
    }
    return path;
  }

  _isFolderEmpty(folderId) {
    return this._filesIn(folderId).length === 0 && this._foldersIn(folderId).length === 0;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render() {
    this._wrapper.innerHTML = `
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">📁 My Drive</span>
            <button class="add-btn" id="add-folder-root" title="New folder">+</button>
          </div>
          <div class="sidebar-tree" id="sidebar-tree"></div>
        </aside>
        <div class="main">
          <div class="main-toolbar" id="main-toolbar"></div>
          <div class="file-area" id="file-area"></div>
        </div>
      </div>
    `;
    this._renderSidebar();
    this._renderToolbar();
    this._renderFileArea();
    this._bindStaticEvents();
  }

  _renderSidebar() {
    const tree = this._wrapper.querySelector('#sidebar-tree');
    if (!tree) return;
    const rootFolders = this._foldersIn(null);
    const activePath = this._folderPath(this._activeFolderId);
    const activeIds = new Set(activePath.map(p => p.id));
    if (this._activeFolderId) activeIds.add(this._activeFolderId);

    let html = rootFolders.map(f => {
      const isActive = activeIds.has(f.id);
      return `
        <div class="tree-item${isActive ? ' active' : ''}" data-folder="${this._esc(f.id)}">
          <span class="tree-icon">${isActive ? '📂' : '📁'}</span>
          <span class="tree-name">${this._esc(f.name)}</span>
        </div>
      `;
    }).join('');

    if (this._addingFolder === 'root') {
      html += `
        <div class="tree-item tree-new">
          <span class="tree-icon">📁</span>
          <input class="tree-new-input" id="tree-new-input" placeholder="Folder name" maxlength="60" />
        </div>
      `;
    }

    tree.innerHTML = html;
    this._bindSidebarEvents();
  }

  _renderToolbar() {
    const bar = this._wrapper.querySelector('#main-toolbar');
    if (!bar) return;
    const path = this._folderPath(this._activeFolderId);
    const breadcrumb = [
      `<button class="bc-item" data-nav="root">My Drive</button>`,
      ...path.map(p => `<span class="bc-sep">›</span><button class="bc-item" data-nav="${this._esc(p.id)}">${this._esc(p.name)}</button>`),
    ].join('');

    bar.innerHTML = `
      <div class="breadcrumb">${breadcrumb}</div>
      <div class="toolbar-actions">
        <button class="tb-btn" id="add-subfolder-btn">📁 New folder</button>
        <button class="tb-btn tb-primary" id="upload-btn" ${this._uploading ? 'disabled' : ''}>${this._uploading ? 'Uploading…' : '⬆ Upload'}</button>
      </div>
    `;
    this._bindToolbarEvents();
  }

  _renderFileArea() {
    const area = this._wrapper.querySelector('#file-area');
    if (!area) return;
    const folders = this._foldersIn(this._activeFolderId);
    const files   = this._filesIn(this._activeFolderId);

    if (folders.length === 0 && files.length === 0) {
      area.innerHTML = `
        <div class="empty-area" id="drop-zone">
          <div class="empty-icon">📂</div>
          <div class="empty-text">No files yet</div>
          <div class="empty-hint">Click Upload or drag & drop files here</div>
        </div>
      `;
    } else {
      const folderCards = folders.map(f => `
        <div class="file-card folder-card" data-folder-nav="${this._esc(f.id)}">
          <div class="file-card-icon">📁</div>
          <div class="file-card-name" title="${this._esc(f.name)}">${this._esc(f.name)}</div>
          <button class="file-card-menu" data-menu-folder="${this._esc(f.id)}">⋯</button>
        </div>
      `).join('');

      const fileCards = files.map(f => `
        <div class="file-card" data-file="${this._esc(f.id)}">
          <div class="file-card-icon">${fileIcon(f.name)}</div>
          <div class="file-card-name" title="${this._esc(f.name)}">${this._esc(f.name)}</div>
          <div class="file-card-size">${fmtSize(f.size)}</div>
          <button class="file-card-menu" data-menu-file="${this._esc(f.id)}">⋯</button>
        </div>
      `).join('');

      area.innerHTML = `<div class="file-grid" id="drop-zone">${folderCards}${fileCards}</div>`;
    }

    this._bindDropEvents(area.querySelector('#drop-zone') || area);
    this._bindFileAreaEvents();
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  _bindStaticEvents() {
    this._wrapper.querySelector('#add-folder-root')?.addEventListener('click', () => {
      this._addingFolder = 'root';
      this._renderSidebar();
      this._wrapper.querySelector('#tree-new-input')?.focus();
    });

    this._wrapper.addEventListener('click', e => {
      const menu = this._wrapper.querySelector('.ctx-menu');
      if (menu && !e.target.closest('.ctx-menu') && !e.target.closest('[data-menu-file]') && !e.target.closest('[data-menu-folder]')) {
        menu.remove();
      }
    });
  }

  _bindSidebarEvents() {
    const newInput = this._wrapper.querySelector('#tree-new-input');
    if (newInput) {
      const submit = async () => {
        const name = newInput.value.trim();
        this._addingFolder = false;
        if (name) {
          const id = `fld-${Date.now()}`;
          this._meta = { ...this._meta, folders: [...this._meta.folders, { id, name, parentId: null, createdAt: Date.now() }] };
          await this._saveMeta();
        }
        this._renderSidebar();
        this._renderFileArea();
      };
      newInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') { this._addingFolder = false; this._renderSidebar(); }
      });
      newInput.addEventListener('blur', submit);
    }

    this._wrapper.querySelectorAll('.tree-item[data-folder]').forEach(item => {
      item.addEventListener('click', () => {
        this._activeFolderId = item.dataset.folder;
        this._renderSidebar();
        this._renderToolbar();
        this._renderFileArea();
      });
    });
  }

  _bindToolbarEvents() {
    this._wrapper.querySelectorAll('.bc-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeFolderId = btn.dataset.nav === 'root' ? null : btn.dataset.nav;
        this._renderSidebar();
        this._renderToolbar();
        this._renderFileArea();
      });
    });

    this._wrapper.querySelector('#add-subfolder-btn')?.addEventListener('click', async () => {
      const name = prompt('Folder name:')?.trim();
      if (!name) return;
      const id = `fld-${Date.now()}`;
      this._meta = { ...this._meta, folders: [...this._meta.folders, { id, name, parentId: this._activeFolderId, createdAt: Date.now() }] };
      await this._saveMeta();
      this._renderSidebar();
      this._renderFileArea();
    });

    this._wrapper.querySelector('#upload-btn')?.addEventListener('click', () => this._triggerUpload());
  }

  _bindFileAreaEvents() {
    this._wrapper.querySelectorAll('[data-folder-nav]').forEach(card => {
      card.addEventListener('dblclick', e => {
        if (e.target.closest('.file-card-menu')) return;
        this._activeFolderId = card.dataset.folderNav;
        this._renderSidebar();
        this._renderToolbar();
        this._renderFileArea();
      });
    });

    this._wrapper.querySelectorAll('[data-menu-file]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._showContextMenu(e, 'file', btn.dataset.menuFile);
      });
    });

    this._wrapper.querySelectorAll('[data-menu-folder]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._showContextMenu(e, 'folder', btn.dataset.menuFolder);
      });
    });
  }

  _bindDropEvents(zone) {
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) this._uploadFiles(files);
    });
  }

  // ─── Context menu ─────────────────────────────────────────────────────────

  _showContextMenu(e, type, id) {
    this._wrapper.querySelector('.ctx-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';

    if (type === 'file') {
      menu.innerHTML = `
        <button class="ctx-item" data-action="download" data-id="${this._esc(id)}">⬇ Download</button>
        <button class="ctx-item ctx-danger" data-action="delete-file" data-id="${this._esc(id)}">🗑 Delete</button>
      `;
    } else {
      menu.innerHTML = `
        <button class="ctx-item ctx-danger" data-action="delete-folder" data-id="${this._esc(id)}">🗑 Delete folder</button>
      `;
    }

    this._wrapper.appendChild(menu);
    const wRect = this._wrapper.getBoundingClientRect();
    let x = e.clientX - wRect.left + 4;
    let y = e.clientY - wRect.top + 4;
    // Measure after DOM insert
    requestAnimationFrame(() => {
      const mRect = menu.getBoundingClientRect();
      if (x + mRect.width > wRect.width) x = wRect.width - mRect.width - 8;
      if (y + mRect.height > wRect.height) y = wRect.height - mRect.height - 8;
      menu.style.left = `${Math.max(4, x)}px`;
      menu.style.top  = `${Math.max(4, y)}px`;
    });

    menu.querySelectorAll('.ctx-item').forEach(btn => {
      btn.addEventListener('click', async e2 => {
        e2.stopPropagation();
        menu.remove();
        const { action, id: itemId } = btn.dataset;
        if (action === 'download')     await this._downloadFile(itemId);
        if (action === 'delete-file')  await this._deleteFile(itemId);
        if (action === 'delete-folder') await this._deleteFolder(itemId);
      });
    });
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  _triggerUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.length) this._uploadFiles(files);
    });
    input.click();
  }

  async _uploadFiles(fileList) {
    if (this._uploading) return;
    this._uploading = true;
    this._renderToolbar();

    for (const file of fileList) {
      await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = async ev => {
          const id = `fil-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          await setData(DATA_COL, id, { content: ev.target.result });
          this._meta = {
            ...this._meta,
            files: [...this._meta.files, {
              id,
              name: file.name,
              type: file.type || 'application/octet-stream',
              size: file.size,
              folderId: this._activeFolderId,
              createdAt: Date.now(),
            }],
          };
          await this._saveMeta();
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(file);
      });
    }

    this._uploading = false;
    this._renderToolbar();
    this._renderFileArea();
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  async _downloadFile(fileId) {
    const fileMeta = this._meta.files.find(f => f.id === fileId);
    if (!fileMeta) return;
    const data = await getData(DATA_COL, fileId);
    if (!data?.content) { this.api?.notify?.('File data not found', 'error'); return; }
    const a = document.createElement('a');
    a.href = data.content;
    a.download = fileMeta.name;
    a.click();
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async _deleteFile(fileId) {
    const f = this._meta.files.find(f => f.id === fileId);
    if (!f) return;
    if (!confirm(`Delete "${f.name}"?`)) return;
    this._meta = { ...this._meta, files: this._meta.files.filter(x => x.id !== fileId) };
    await this._saveMeta();
    deleteData(DATA_COL, fileId);
    this._renderFileArea();
  }

  async _deleteFolder(folderId) {
    const folder = this._meta.folders.find(f => f.id === folderId);
    if (!folder) return;
    if (!this._isFolderEmpty(folderId)) {
      alert(`"${folder.name}" is not empty. Delete all files inside first.`);
      return;
    }
    if (!confirm(`Delete folder "${folder.name}"?`)) return;
    this._meta = { ...this._meta, folders: this._meta.folders.filter(f => f.id !== folderId) };
    await this._saveMeta();
    if (this._activeFolderId === folderId) this._activeFolderId = null;
    this._renderSidebar();
    this._renderToolbar();
    this._renderFileArea();
  }
}

if (!customElements.get('app-files')) customElements.define('app-files', AppFiles);
