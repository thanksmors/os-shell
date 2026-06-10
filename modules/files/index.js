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
    this._previewFile = null;
    this._previewContent = null;
    this._previewLoading = false;
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
          <div class="main-body">
            <div class="file-area-wrap">
              <div class="file-area" id="file-area"></div>
            </div>
            <div class="preview-panel" id="preview-panel"></div>
          </div>
        </div>
      </div>
    `;
    this._renderSidebar();
    this._renderToolbar();
    this._renderFileArea();
    this._renderPreview();
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
        <div class="file-card${this._previewFile?.id === f.id ? ' pv-selected' : ''}" data-file="${this._esc(f.id)}">
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

  // ─── Preview ──────────────────────────────────────────────────────────────

  async _openPreview(file) {
    this._previewFile = file;
    this._previewContent = null;
    this._previewLoading = true;
    this._renderPreview();
    this._renderFileArea(); // update selected card highlight
    const rec = await getData(DATA_COL, file.id);
    this._previewContent = rec?.content ?? null;
    this._previewLoading = false;
    this._renderPreview();
  }

  _closePreview() {
    this._previewFile = null;
    this._previewContent = null;
    this._previewLoading = false;
    this._renderPreview();
    this._renderFileArea(); // clear selected highlight
  }

  _renderPreview() {
    const panel = this._wrapper.querySelector('#preview-panel');
    if (!panel) return;

    if (!this._previewFile) {
      panel.classList.remove('pv-open');
      panel.innerHTML = '';
      return;
    }

    panel.classList.add('pv-open');

    const bodyHtml = this._previewLoading
      ? '<div class="pv-loading">Loading…</div>'
      : this._buildPreviewHtml();

    panel.innerHTML = `
      <div class="pv-header">
        <span class="pv-icon">${fileIcon(this._previewFile.name)}</span>
        <span class="pv-name" title="${this._esc(this._previewFile.name)}">${this._esc(this._previewFile.name)}</span>
        <button class="pv-close" id="pv-close" title="Close preview">✕</button>
      </div>
      <div class="pv-body" id="pv-body">${bodyHtml}</div>
      <div class="pv-footer">
        <button class="tb-btn" id="pv-download">⬇ Download</button>
        <span class="pv-size">${fmtSize(this._previewFile.size)}</span>
      </div>
    `;

    panel.querySelector('#pv-close').addEventListener('click', () => this._closePreview());
    panel.querySelector('#pv-download').addEventListener('click', () => this._downloadFile(this._previewFile.id));

    // Trigger async loaders after DOM is ready
    if (!this._previewLoading && this._previewContent) {
      const ext = (this._previewFile.name.split('.').pop() || '').toLowerCase();
      if (ext === 'docx') this._renderDocx(this._previewContent);
      if (ext === 'xlsx' || ext === 'xls') this._renderXlsx(this._previewContent);
    }
  }

  _buildPreviewHtml() {
    if (!this._previewContent) return '<p class="pv-unsupported">File data not found.</p>';
    const file = this._previewFile;
    const mime = file.type || '';
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    if (mime.startsWith('image/'))
      return `<img src="${this._previewContent}" class="pv-img" alt="${this._esc(file.name)}">`;

    if (mime === 'application/pdf') {
      const url = this._toBlobUrl(this._previewContent, 'application/pdf');
      return `<iframe src="${url}" class="pv-frame" title="${this._esc(file.name)}"></iframe>`;
    }

    if (ext === 'html' || ext === 'htm') {
      const text = this._b64ToText(this._previewContent);
      return `<iframe sandbox="allow-same-origin" srcdoc="${this._esc(text)}" class="pv-frame" title="${this._esc(file.name)}"></iframe>`;
    }

    if (ext === 'md') {
      const text = this._b64ToText(this._previewContent);
      return `<div class="pv-md">${this._parseMarkdown(text)}</div>`;
    }

    if (mime.startsWith('text/') || ['txt','log','json','xml','csv','conf','ini','sh','yaml','yml','ts','js','py','css'].includes(ext)) {
      const text = this._b64ToText(this._previewContent);
      if (ext === 'csv') return this._csvTable(text);
      return `<pre class="pv-pre">${this._escHtml(text)}</pre>`;
    }

    if (ext === 'docx' || ext === 'xlsx' || ext === 'xls')
      return '<div class="pv-async" id="pv-async"><div class="pv-loading">Loading document…</div></div>';

    return '<p class="pv-unsupported">No preview available — use Download.</p>';
  }

  // ─── Async document loaders ───────────────────────────────────────────────

  async _renderDocx(content) {
    const target = this._wrapper.querySelector('#pv-async');
    if (!target) return;
    try {
      if (!window._mammoth) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/browser/mammoth.browser.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Failed to load mammoth.js'));
          document.head.appendChild(s);
        });
        window._mammoth = window.mammoth;
      }
      const buf = this._b64ToArrayBuffer(content);
      const { value } = await window._mammoth.convertToHtml({ arrayBuffer: buf });
      if (this._wrapper.querySelector('#pv-async') === target)
        target.innerHTML = `<div class="pv-docx">${value}</div>`;
    } catch (e) {
      if (this._wrapper.querySelector('#pv-async') === target)
        target.innerHTML = `<p class="pv-err">Could not render document: ${this._esc(e.message)}</p>`;
    }
  }

  async _renderXlsx(content) {
    const target = this._wrapper.querySelector('#pv-async');
    if (!target) return;
    try {
      if (!window._XLSX)
        window._XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const XLSX = window._XLSX;
      const wb = XLSX.read(content.split(',')[1], { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const html = XLSX.utils.sheet_to_html(ws);
      if (this._wrapper.querySelector('#pv-async') === target)
        target.innerHTML = `<div class="pv-xlsx">${html}</div>`;
    } catch (e) {
      if (this._wrapper.querySelector('#pv-async') === target)
        target.innerHTML = `<p class="pv-err">Could not render spreadsheet: ${this._esc(e.message)}</p>`;
    }
  }

  // ─── Preview helpers ──────────────────────────────────────────────────────

  _b64ToText(dataUrl) {
    try {
      return decodeURIComponent(escape(atob(dataUrl.split(',')[1])));
    } catch {
      return atob(dataUrl.split(',')[1]);
    }
  }

  _b64ToArrayBuffer(dataUrl) {
    const raw = atob(dataUrl.split(',')[1]);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer;
  }

  _toBlobUrl(dataUrl, mime) {
    return URL.createObjectURL(new Blob([this._b64ToArrayBuffer(dataUrl)], { type: mime }));
  }

  _escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _csvTable(text) {
    const rows = text.trim().split('\n').map(r =>
      r.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
    );
    if (!rows.length) return '';
    const hdr = rows[0].map(c => `<th>${this._escHtml(c)}</th>`).join('');
    const body = rows.slice(1).map(r =>
      `<tr>${r.map(c => `<td>${this._escHtml(c)}</td>`).join('')}</tr>`
    ).join('');
    return `<div class="pv-csv"><table><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ─── Markdown (no external deps) ─────────────────────────────────────────

  _parseMarkdown(md) {
    if (!md) return '';

    const codeBlocks = [];
    md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      codeBlocks.push(`<pre class="md-pre"><code${lang ? ` class="lang-${lang}"` : ''}>${esc}</code></pre>`);
      return `\x00CB${codeBlocks.length - 1}\x00`;
    });

    md = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = md.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const cbMatch = line.trim().match(/^\x00CB(\d+)\x00$/);
      if (cbMatch) { out.push(codeBlocks[+cbMatch[1]]); i++; continue; }

      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        const lvl = hm[1].length;
        out.push(`<h${lvl} class="md-h">${this._inline(hm[2])}</h${lvl}>`);
        i++; continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        out.push('<hr class="md-hr">');
        i++; continue;
      }

      if (line.startsWith('&gt;')) {
        let content = '';
        while (i < lines.length && lines[i].startsWith('&gt;')) {
          content += lines[i].slice(4).trim() + ' ';
          i++;
        }
        out.push(`<blockquote class="md-bq">${this._inline(content.trim())}</blockquote>`);
        continue;
      }

      if (/^[-*+]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
          items.push(`<li>${this._inline(lines[i].replace(/^[-*+]\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ul class="md-ul">${items.join('')}</ul>`);
        continue;
      }

      if (/^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(`<li>${this._inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ol class="md-ol">${items.join('')}</ol>`);
        continue;
      }

      const emb = line.trim().match(/^\[embed\]\((.+)\)$/);
      if (emb) { out.push(this._mdEmbed(emb[1])); i++; continue; }

      if (!line.trim()) { out.push('<div class="md-spacer"></div>'); i++; continue; }

      out.push(`<p class="md-p">${this._inline(line)}</p>`);
      i++;
    }

    return out.join('');
  }

  _inline(text) {
    if (!text) return '';
    text = text.replace(/`([^`]+)`/g, '<code class="md-ic">$1</code>');
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="md-img" src="$2" alt="$1" loading="lazy">');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-a" href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  }

  _mdEmbed(url) {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (yt) return `<div class="md-video"><iframe src="https://www.youtube.com/embed/${yt[1]}" frameborder="0" allowfullscreen></iframe></div>`;
    return `<p><a class="md-a" href="${url}" target="_blank" rel="noopener">${url}</a></p>`;
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
        this._previewFile = null;
        this._previewContent = null;
        this._renderSidebar();
        this._renderToolbar();
        this._renderFileArea();
        this._renderPreview();
      });
    });
  }

  _bindToolbarEvents() {
    this._wrapper.querySelectorAll('.bc-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeFolderId = btn.dataset.nav === 'root' ? null : btn.dataset.nav;
        this._previewFile = null;
        this._previewContent = null;
        this._renderSidebar();
        this._renderToolbar();
        this._renderFileArea();
        this._renderPreview();
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
        this._previewFile = null;
        this._previewContent = null;
        this._renderSidebar();
        this._renderToolbar();
        this._renderFileArea();
        this._renderPreview();
      });
    });

    this._wrapper.querySelectorAll('[data-file]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.file-card-menu')) return;
        const file = this._meta.files.find(f => f.id === card.dataset.file);
        if (file) this._openPreview(file);
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
        <button class="ctx-item" data-action="preview" data-id="${this._esc(id)}">👁 Preview</button>
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
        if (action === 'preview') {
          const file = this._meta.files.find(f => f.id === itemId);
          if (file) this._openPreview(file);
        }
        if (action === 'download')      await this._downloadFile(itemId);
        if (action === 'delete-file')   await this._deleteFile(itemId);
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
    if (this._previewFile?.id === fileId) {
      this._previewFile = null;
      this._previewContent = null;
    }
    this._meta = { ...this._meta, files: this._meta.files.filter(x => x.id !== fileId) };
    await this._saveMeta();
    deleteData(DATA_COL, fileId);
    this._renderFileArea();
    this._renderPreview();
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
