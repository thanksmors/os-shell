import { adoptTailwind } from '/shell/shadow-tailwind.js';

class AppNotepad extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._wrapper = null;
    this._textarea = null;
    this._wordCountEl = null;
    this._charCountEl = null;
  }

  connectedCallback() {
    this._render();
  }

  async _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'module-root notepad-root';
    this._wrapper = wrapper;

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'notepad-toolbar';
    toolbar.innerHTML = `
      <span style="font-size:1.1rem;">📝</span>
      <span style="font-weight:600;font-size:0.875rem;color:#374151;">Notepad</span>
      <div style="flex:1;"></div>
      <button class="notepad-toolbar-btn" id="btn-clear" title="Clear all">🗑 Clear</button>
      <button class="notepad-toolbar-btn" id="btn-copy" title="Copy all">📋 Copy</button>
    `;

    // Textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'notepad-textarea';
    textarea.placeholder = 'Start typing...';
    textarea.spellcheck = true;
    this._textarea = textarea;

    // Footer
    const footer = document.createElement('div');
    footer.className = 'notepad-footer';
    const wordCount = document.createElement('span');
    wordCount.className = 'notepad-stat';
    wordCount.id = 'word-count';
    wordCount.textContent = '0 words';
    const charCount = document.createElement('span');
    charCount.className = 'notepad-stat';
    charCount.id = 'char-count';
    charCount.textContent = '0 chars';
    this._wordCountEl = wordCount;
    this._charCountEl = charCount;
    footer.appendChild(wordCount);
    footer.appendChild(charCount);

    wrapper.appendChild(toolbar);
    wrapper.appendChild(textarea);
    wrapper.appendChild(footer);
    this._shadow.appendChild(wrapper);

    // Adopt Tailwind + module styles
    await adoptTailwind(this._shadow, wrapper);

    // Load module styles
    const style = document.createElement('style');
    try {
      const r = await fetch('/modules/notepad/styles.css');
      if (r.ok) style.textContent = await r.text();
    } catch (e) {}
    this._shadow.appendChild(style);

    // Restore saved content per window
    const key = this.api ? `notepad-content-${this.api.windowId}` : 'notepad-content-default';
    const saved = sessionStorage.getItem(key);
    if (saved) {
      textarea.value = saved;
      this._updateStats();
    }

    // Single input listener — stats + persistence + title
    textarea.addEventListener('input', () => {
      this._updateStats();
      sessionStorage.setItem(key, textarea.value);
      if (this.api) {
        const words = this._countWords(textarea.value);
        this.api.setTitle(`Notepad — ${words} word${words !== 1 ? 's' : ''}`);
      }
    });

    toolbar.querySelector('#btn-clear').addEventListener('click', () => {
      textarea.value = '';
      this._updateStats();
      sessionStorage.removeItem(key);
      textarea.focus();
    });
    toolbar.querySelector('#btn-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        if (this.api) this.api.notify('Copied to clipboard!', 'success');
      }).catch(() => {
        if (this.api) this.api.notify('Copy failed', 'error');
      });
    });

    textarea.focus();
  }

  _countWords(text) {
    return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  }

  _updateStats() {
    const text = this._textarea ? this._textarea.value : '';
    const words = this._countWords(text);
    const chars = text.length;
    if (this._wordCountEl) this._wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    if (this._charCountEl) this._charCountEl.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
  }
}

customElements.define('app-notepad', AppNotepad);
