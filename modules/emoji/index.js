import { adoptTailwind } from '/shell/shadow-tailwind.js';

const EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji.json/emoji.json';

const CATS = [
  { key: 'smileys',    icon: '😀', label: 'Smileys',    group: 'Smileys & Emotion' },
  { key: 'people',     icon: '🧑', label: 'People',     group: 'People & Body' },
  { key: 'animals',    icon: '🐶', label: 'Animals',    group: 'Animals & Nature' },
  { key: 'food',       icon: '🍕', label: 'Food',       group: 'Food & Drink' },
  { key: 'activities', icon: '⚽', label: 'Activities', group: 'Activities' },
  { key: 'travel',     icon: '🚗', label: 'Travel',     group: 'Travel & Places' },
  { key: 'objects',    icon: '💡', label: 'Objects',    group: 'Objects' },
  { key: 'symbols',    icon: '❤️', label: 'Symbols',    group: 'Symbols' },
];

const FALLBACK = ['😀','😂','🥰','😎','🤔','😭','🔥','✅','👍','❤️','🎉','🚀','💡','📝','🌟','⚡','🎯','💯','🙏','✨'].map(c => ({ char: c, name: c, group: '' }));

let _cache = null;
let _promise = null;

async function loadEmojis() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = fetch(EMOJI_CDN)
    .then(r => r.json())
    .then(data => { _cache = data; return data; })
    .catch(() => { _cache = FALLBACK; return FALLBACK; });
  return _promise;
}

class AppEmoji extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._emojis = null;
    this._activeTab = 'smileys';
    this._query = '';
    this._grid = null;
    this._themeObserver = null;
  }

  async connectedCallback() {
    await this._buildShell();
    this._emojis = await loadEmojis();
    this._renderGrid();
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
  }

  async _buildShell() {
    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper' + (document.documentElement.classList.contains('dark') ? ' dark' : '');
    this._wrapper = wrapper;

    // Search bar
    const searchBar = document.createElement('div');
    searchBar.className = 'search-bar';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'search-input';
    input.placeholder = 'Search emoji…';
    input.setAttribute('autocomplete', 'off');
    searchBar.appendChild(input);
    this._input = input;

    // Category tabs
    const tabs = document.createElement('div');
    tabs.className = 'cat-tabs';
    CATS.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (cat.key === this._activeTab ? ' active' : '');
      btn.textContent = cat.icon;
      btn.title = cat.label;
      btn.dataset.key = cat.key;
      tabs.appendChild(btn);
    });
    this._tabs = tabs;

    // Grid container
    const grid = document.createElement('div');
    grid.className = 'em-grid';
    grid.innerHTML = '<div class="state-msg">Loading…</div>';
    this._grid = grid;

    wrapper.appendChild(searchBar);
    wrapper.appendChild(tabs);
    wrapper.appendChild(grid);
    this._shadow.appendChild(wrapper);

    await adoptTailwind(this._shadow, wrapper);

    const style = document.createElement('style');
    try {
      const r = await fetch('/modules/emoji/styles.css');
      if (r.ok) style.textContent = await r.text();
    } catch (e) {}
    this._shadow.appendChild(style);

    // Events
    input.addEventListener('input', () => {
      this._query = input.value.trim().toLowerCase();
      this._renderGrid();
    });

    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      this._activeTab = btn.dataset.key;
      this._query = '';
      input.value = '';
      tabs.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.key === this._activeTab));
      this._renderGrid();
    });

    grid.addEventListener('click', e => {
      const btn = e.target.closest('.em-btn');
      if (!btn) return;
      const char = btn.dataset.char;
      navigator.clipboard.writeText(char).then(() => {
        this.api?.notify(`${char} copied!`, 'success');
      }).catch(() => {
        this.api?.notify('Copy failed', 'error');
      });
    });

    // Theme sync
    this._themeObserver = new MutationObserver(() => {
      wrapper.classList.toggle('dark', document.documentElement.classList.contains('dark'));
    });
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  _renderGrid() {
    if (!this._emojis) return;
    const grid = this._grid;

    let filtered;
    if (this._query) {
      filtered = this._emojis.filter(e => e.name?.toLowerCase().includes(this._query) || e.char === this._query);
    } else {
      const cat = CATS.find(c => c.key === this._activeTab);
      filtered = cat ? this._emojis.filter(e => e.group === cat.group) : this._emojis;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="state-msg">No results</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(e => {
      const btn = document.createElement('button');
      btn.className = 'em-btn';
      btn.textContent = e.char;
      btn.dataset.char = e.char;
      btn.title = e.name || e.char;
      frag.appendChild(btn);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);
  }
}

customElements.define('app-emoji', AppEmoji);
