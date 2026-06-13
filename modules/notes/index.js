import { getData, setData } from '/shell/api.js';
import { setupShell, observeTheme } from '/shell/shell-setup.js';

const COLLECTION = 'notes';
const DATA_KEY = 'data';

class AppNotes extends HTMLElement {
  constructor() {
    super();
    this._data = { folders: [], notes: [] };
    this._selectedFolderId = null;
    this._selectedNoteId = null;
    this._editMode = true;
    this._searchQuery = '';
    this._saveTimer = null;
    this._themeCleanup = null;
    this._wrapper = null;
  }

  async connectedCallback() {
    const { wrapper } = await setupShell(this, { cssUrl: '/modules/notes/styles.css' });
    this._wrapper = wrapper;

    this._applyTheme();
    this._themeCleanup = observeTheme(() => this._applyTheme());

    const saved = await getData(COLLECTION, DATA_KEY);
    if (saved) {
      this._data = {
        folders: Array.isArray(saved.folders) ? saved.folders : [],
        notes: Array.isArray(saved.notes) ? saved.notes : [],
      };
    }

    if (this._data.notes.length > 0) {
      this._selectedNoteId = this._data.notes[0].id;
    }

    this._render();
    this.api?.setReady?.();
  }

  disconnectedCallback() {
    this._themeCleanup?.();
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      setData(COLLECTION, DATA_KEY, this._data);
    }
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      setData(COLLECTION, DATA_KEY, this._data);
    }, 800);
  }

  _newNote() {
    const note = {
      id: `n-${Date.now()}`,
      title: 'Untitled',
      folderId: this._selectedFolderId,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this._data = { ...this._data, notes: [note, ...this._data.notes] };
    this._selectedNoteId = note.id;
    this._editMode = true;
    this._scheduleSave();
    this._render();
    setTimeout(() => this._wrapper.querySelector('#note-title')?.select(), 50);
  }

  _newFolder() {
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    const folder = { id: `f-${Date.now()}`, name: name.trim() };
    this._data = { ...this._data, folders: [...this._data.folders, folder] };
    this._scheduleSave();
    this._render();
  }

  _deleteNote(id) {
    const visible = this._visibleNotes().filter(n => n.id !== id);
    this._data = { ...this._data, notes: this._data.notes.filter(n => n.id !== id) };
    if (this._selectedNoteId === id) {
      this._selectedNoteId = visible.length > 0 ? visible[0].id : null;
    }
    this._scheduleSave();
    this._render();
  }

  _deleteFolder(id) {
    this._data = {
      folders: this._data.folders.filter(f => f.id !== id),
      notes: this._data.notes.map(n => n.folderId === id ? { ...n, folderId: null } : n),
    };
    if (this._selectedFolderId === id) this._selectedFolderId = null;
    this._scheduleSave();
    this._render();
  }

  _visibleNotes() {
    let notes = this._data.notes;
    if (this._selectedFolderId) notes = notes.filter(n => n.folderId === this._selectedFolderId);
    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      notes = notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  _selectedNote() {
    return this._data.notes.find(n => n.id === this._selectedNoteId) || null;
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    this._wrapper.innerHTML = `
      <div class="notes-layout">
        ${this._renderSidebar()}
        ${this._renderNoteList()}
        ${this._renderEditor()}
      </div>
    `;
    this._bindEvents();
  }

  _renderSidebar() {
    const folderCount = id => this._data.notes.filter(n => n.folderId === id).length;
    return `
      <div class="sidebar">
        <div class="sidebar-toolbar">
          <button class="sidebar-btn" id="new-note-btn" title="New Note">✏️ Note</button>
          <button class="sidebar-btn secondary" id="new-folder-btn" title="New Folder">📁+</button>
        </div>
        <div class="folder-list">
          <div class="folder-item ${this._selectedFolderId === null ? 'active' : ''}" data-folder="__all__">
            <span class="folder-icon">📋</span>
            <span class="folder-name">All Notes</span>
            <span class="folder-count">${this._data.notes.length}</span>
          </div>
          ${this._data.folders.map(f => `
            <div class="folder-item ${this._selectedFolderId === f.id ? 'active' : ''}" data-folder="${f.id}">
              <span class="folder-icon">📁</span>
              <span class="folder-name">${this._esc(f.name)}</span>
              <span class="folder-count">${folderCount(f.id)}</span>
              <button class="folder-del-btn" data-del-folder="${f.id}" title="Delete folder">×</button>
            </div>
          `).join('')}
        </div>
        <div class="sidebar-search">
          <input type="search" class="search-input" placeholder="Search…" value="${this._esc(this._searchQuery)}">
        </div>
      </div>
    `;
  }

  _renderNoteList() {
    const notes = this._visibleNotes();
    return `
      <div class="note-list">
        ${notes.length === 0
          ? '<div class="empty-list">No notes yet.<br>Click ✏️ Note to start.</div>'
          : notes.map(n => `
            <div class="note-item ${n.id === this._selectedNoteId ? 'active' : ''}" data-note="${n.id}">
              <div class="note-item-title">${this._esc(n.title || 'Untitled')}</div>
              <div class="note-item-preview">${this._esc((n.content || '').replace(/[#*`>]/g, '').slice(0, 80))}</div>
            </div>
          `).join('')
        }
      </div>
    `;
  }

  _renderEditor() {
    const note = this._selectedNote();
    if (!note) {
      return `<div class="editor-pane empty-editor"><span>Select a note or create a new one</span></div>`;
    }
    const rawContent = note.content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
      <div class="editor-pane">
        <div class="editor-toolbar">
          <input class="note-title-input" id="note-title" type="text" value="${this._esc(note.title)}" placeholder="Untitled">
          <div class="view-toggle">
            <button class="tb-btn ${this._editMode ? 'active' : ''}" data-action="edit-mode">Edit</button>
            <button class="tb-btn ${!this._editMode ? 'active' : ''}" data-action="preview-mode">Preview</button>
          </div>
        </div>
        ${this._editMode ? `
          <div class="md-toolbar">
            <button class="md-btn" data-md="bold" title="Bold"><strong>B</strong></button>
            <button class="md-btn" data-md="italic" title="Italic"><em>I</em></button>
            <button class="md-btn" data-md="code" title="Inline code">&#96;</button>
            <button class="md-btn" data-md="heading" title="Heading">H</button>
            <button class="md-btn" data-md="link" title="Insert link">🔗</button>
            <button class="md-btn" data-md="image" title="Insert image">🖼</button>
            <button class="md-btn" data-md="video" title="Embed video">📹</button>
            <span class="md-sep"></span>
            <button class="md-btn danger" data-action="delete-note" title="Delete note">🗑</button>
          </div>
          <textarea class="note-editor" id="note-editor" spellcheck="true">${rawContent}</textarea>
        ` : `
          <div class="md-toolbar" style="justify-content:flex-end">
            <button class="md-btn danger" data-action="delete-note" title="Delete note">🗑</button>
          </div>
          <div class="note-preview">${this._parseMarkdown(note.content)}</div>
        `}
      </div>
    `;
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    this._wrapper.querySelector('#new-note-btn')?.addEventListener('click', () => this._newNote());
    this._wrapper.querySelector('#new-folder-btn')?.addEventListener('click', () => this._newFolder());

    this._wrapper.querySelectorAll('.folder-item[data-folder]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.folder-del-btn')) return;
        const id = el.dataset.folder;
        this._selectedFolderId = id === '__all__' ? null : id;
        this._render();
      });
    });

    this._wrapper.querySelectorAll('[data-del-folder]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`Delete folder "${btn.closest('.folder-item')?.querySelector('.folder-name')?.textContent}"? Notes will be moved to All Notes.`)) {
          this._deleteFolder(btn.dataset.delFolder);
        }
      });
    });

    const searchInput = this._wrapper.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._searchQuery = searchInput.value;
        this._render();
      });
    }

    this._wrapper.querySelectorAll('.note-item[data-note]').forEach(el => {
      el.addEventListener('click', () => {
        if (this._selectedNoteId !== el.dataset.note) {
          this._selectedNoteId = el.dataset.note;
          this._render();
        }
      });
    });

    const titleInput = this._wrapper.querySelector('#note-title');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        const note = this._selectedNote();
        if (!note) return;
        this._updateNote(note.id, { title: titleInput.value });
        const item = this._wrapper.querySelector(`[data-note="${note.id}"] .note-item-title`);
        if (item) item.textContent = titleInput.value || 'Untitled';
      });
    }

    const editor = this._wrapper.querySelector('#note-editor');
    if (editor) {
      editor.addEventListener('input', () => {
        const note = this._selectedNote();
        if (!note) return;
        this._updateNote(note.id, { content: editor.value });
      });
    }

    this._wrapper.querySelector('[data-action="edit-mode"]')?.addEventListener('click', () => {
      this._editMode = true; this._render();
    });
    this._wrapper.querySelector('[data-action="preview-mode"]')?.addEventListener('click', () => {
      this._editMode = false; this._render();
    });

    this._wrapper.querySelector('[data-action="delete-note"]')?.addEventListener('click', () => {
      if (this._selectedNoteId && confirm('Delete this note?')) {
        this._deleteNote(this._selectedNoteId);
      }
    });

    this._wrapper.querySelectorAll('.md-btn[data-md]').forEach(btn => {
      btn.addEventListener('click', () => this._insertMarkdown(btn.dataset.md));
    });
  }

  _updateNote(id, patch) {
    const idx = this._data.notes.findIndex(n => n.id === id);
    if (idx === -1) return;
    const updated = [...this._data.notes];
    updated[idx] = { ...updated[idx], ...patch, updatedAt: Date.now() };
    this._data = { ...this._data, notes: updated };
    this._scheduleSave();
  }

  _insertMarkdown(type) {
    const editor = this._wrapper.querySelector('#note-editor');
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const sel = editor.value.slice(start, end);

    const wrap = (before, after, placeholder = 'text') => {
      const replacement = before + (sel || placeholder) + after;
      editor.setRangeText(replacement, start, end, 'end');
      if (!sel) {
        editor.selectionStart = start + before.length;
        editor.selectionEnd = start + before.length + placeholder.length;
      }
      editor.dispatchEvent(new Event('input'));
      editor.focus();
    };

    switch (type) {
      case 'bold':    return wrap('**', '**');
      case 'italic':  return wrap('*', '*');
      case 'code':    return wrap('`', '`', 'code');
      case 'heading': return wrap('## ', '', 'Heading');
      case 'link': {
        const url = prompt('Link URL:');
        if (!url) return;
        const text = sel || prompt('Link text:') || 'link';
        editor.setRangeText(`[${text}](${url})`, start, end, 'end');
        editor.dispatchEvent(new Event('input'));
        editor.focus();
        return;
      }
      case 'image': {
        const url = prompt('Image URL:');
        if (!url) return;
        const alt = prompt('Alt text (optional):') || 'image';
        editor.setRangeText(`![${alt}](${url})`, start, end, 'end');
        editor.dispatchEvent(new Event('input'));
        editor.focus();
        return;
      }
      case 'video': {
        const url = prompt('YouTube or video URL:');
        if (!url) return;
        const nl = start > 0 && editor.value[start - 1] !== '\n' ? '\n' : '';
        editor.setRangeText(`${nl}[embed](${url})\n`, start, end, 'end');
        editor.dispatchEvent(new Event('input'));
        editor.focus();
        return;
      }
    }
  }

  // ─── Markdown parser (inline, no external deps) ───────────────────────────

  _parseMarkdown(md) {
    if (!md) return '';

    // Extract fenced code blocks before escaping
    const codeBlocks = [];
    md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      codeBlocks.push(`<pre class="md-pre"><code${lang ? ` class="lang-${lang}"` : ''}>${esc}</code></pre>`);
      return `\x00CB${codeBlocks.length - 1}\x00`;
    });

    // Escape HTML in remaining text
    md = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = md.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block placeholder
      const cbMatch = line.trim().match(/^\x00CB(\d+)\x00$/);
      if (cbMatch) { out.push(codeBlocks[+cbMatch[1]]); i++; continue; }

      // Headings
      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        const lvl = hm[1].length;
        out.push(`<h${lvl} class="md-h">${this._inline(hm[2])}</h${lvl}>`);
        i++; continue;
      }

      // HR
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        out.push('<hr class="md-hr">');
        i++; continue;
      }

      // Blockquote
      if (line.startsWith('&gt;')) {
        let content = '';
        while (i < lines.length && lines[i].startsWith('&gt;')) {
          content += lines[i].slice(4).trim() + ' ';
          i++;
        }
        out.push(`<blockquote class="md-bq">${this._inline(content.trim())}</blockquote>`);
        continue;
      }

      // Unordered list
      if (/^[-*+]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
          items.push(`<li>${this._inline(lines[i].replace(/^[-*+]\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ul class="md-ul">${items.join('')}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(`<li>${this._inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ol class="md-ol">${items.join('')}</ol>`);
        continue;
      }

      // [embed](url) video embed
      const emb = line.trim().match(/^\[embed\]\((.+)\)$/);
      if (emb) { out.push(this._embed(emb[1])); i++; continue; }

      // Blank line
      if (!line.trim()) { out.push('<div class="md-spacer"></div>'); i++; continue; }

      // Paragraph
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

  _embed(url) {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (yt) {
      return `<div class="md-video"><iframe src="https://www.youtube.com/embed/${yt[1]}" frameborder="0" allowfullscreen></iframe></div>`;
    }
    return `<p><a class="md-a" href="${url}" target="_blank" rel="noopener">${url}</a></p>`;
  }
}

if (!customElements.get('app-notes')) {
  customElements.define('app-notes', AppNotes);
}
