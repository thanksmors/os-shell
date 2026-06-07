/**
 * showEmojiPicker(anchorEl, currentEmoji, onPick)
 *
 * Renders a floating emoji picker popover anchored to anchorEl.
 * Appended to document.body so it works outside shadow roots.
 * Calls onPick(emoji) on selection and self-dismisses.
 *
 * Emoji data loaded once from CDN and cached in memory.
 */

const EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji.json/emoji.json';
const RECENT_KEY = 'os:emoji-recent';
const RECENT_MAX = 24;
const FALLBACK_EMOJIS = ['😀','😂','🥰','😎','🤔','🎉','🔥','✅','⭐','💡','🚀','🎯','📋','🗂️','📊','🪨','📝','⚙️','🏠','👋'];

let _emojiData = null;        // cached array after first fetch
let _loadPromise = null;      // in-flight fetch promise
let _activePicker = null;     // currently open picker element

const CATEGORY_MAP = [
  { icon: '🕐', label: 'Recent',     group: '__recent__' },
  { icon: '😀', label: 'Smileys',    group: 'Smileys & Emotion' },
  { icon: '🧑', label: 'People',     group: 'People & Body' },
  { icon: '🐶', label: 'Animals',    group: 'Animals & Nature' },
  { icon: '🍕', label: 'Food',       group: 'Food & Drink' },
  { icon: '⚽', label: 'Activities', group: 'Activities' },
  { icon: '🚗', label: 'Travel',     group: 'Travel & Places' },
  { icon: '💡', label: 'Objects',    group: 'Objects' },
  { icon: '❤️', label: 'Symbols',   group: 'Symbols' },
];

async function _loadEmojis() {
  if (_emojiData) return _emojiData;
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch(EMOJI_CDN)
    .then(r => r.json())
    .then(data => { _emojiData = data; return data; })
    .catch(() => {
      _emojiData = FALLBACK_EMOJIS.map(char => ({ char, name: char, group: 'Objects' }));
      return _emojiData;
    });
  return _loadPromise;
}

function _getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

function _addRecent(emoji) {
  const recent = _getRecent().filter(e => e !== emoji);
  recent.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, RECENT_MAX)));
}

function _isDark() {
  return document.documentElement.classList.contains('dark');
}

function _buildGridHTML(emojis, activeTab, searchQuery) {
  const recent = _getRecent();
  const visibleEmojis = (() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return emojis.filter(e => e.name?.toLowerCase().includes(q) || e.char?.includes(q));
    }
    if (activeTab === 0) return recent.map(char => ({ char, name: char }));
    const group = CATEGORY_MAP[activeTab].group;
    return emojis.filter(e => e.group === group);
  })();

  if (visibleEmojis.length === 0) {
    return `<div class="ep-empty">${searchQuery ? 'No results' : 'None yet'}</div>`;
  }
  return visibleEmojis.map(e => `<button class="ep-emoji" data-emoji="${e.char}" title="${e.name || ''}">${e.char}</button>`).join('');
}

function _dismiss() {
  if (_activePicker) {
    _activePicker.remove();
    _activePicker = null;
  }
}

export function showEmojiPicker(anchorEl, currentEmoji, onPick) {
  _dismiss();

  let activeTab = 0;
  let searchQuery = '';
  let emojis = _emojiData || [];

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;z-index:99999;';
  document.body.appendChild(container);
  _activePicker = container;

  function buildFullHTML() {
    const dark = _isDark();
    const tabs = CATEGORY_MAP.map((cat, i) => `
      <button class="ep-tab ${i === activeTab && !searchQuery ? 'active' : ''}" data-tab="${i}" title="${cat.label}">${cat.icon}</button>
    `).join('');

    return `
      <style>
        .ep-wrap {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: ${dark ? '#2c2c2e' : '#ffffff'};
          border: 1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'};
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,${dark ? '0.5' : '0.18'});
          width: 280px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .ep-search-row {
          padding: 8px 10px 6px;
          border-bottom: 1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'};
        }
        .ep-search {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
          border-radius: 7px;
          padding: 5px 9px;
          font-size: 13px;
          background: ${dark ? '#3a3a3c' : '#f5f5f7'};
          color: ${dark ? '#f5f5f7' : '#1d1d1f'};
          outline: none;
        }
        .ep-tabs {
          display: flex;
          padding: 4px 6px;
          gap: 2px;
          border-bottom: 1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'};
          overflow-x: auto;
          scrollbar-width: none;
        }
        .ep-tabs::-webkit-scrollbar { display: none; }
        .ep-tab {
          flex-shrink: 0;
          border: none;
          background: transparent;
          border-radius: 6px;
          padding: 4px 5px;
          font-size: 16px;
          cursor: pointer;
          opacity: 0.5;
          transition: opacity 0.1s, background 0.1s;
        }
        .ep-tab:hover { opacity: 0.9; background: ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'}; }
        .ep-tab.active { opacity: 1; background: ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,122,255,0.1)'}; }
        .ep-grid {
          display: flex;
          flex-wrap: wrap;
          padding: 6px;
          gap: 1px;
          max-height: 220px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: ${dark ? '#555 transparent' : '#ccc transparent'};
        }
        .ep-emoji {
          border: none;
          background: transparent;
          border-radius: 6px;
          width: 32px;
          height: 32px;
          font-size: 19px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.1s;
          line-height: 1;
        }
        .ep-emoji:hover { background: ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)'}; }
        .ep-empty, .ep-loading {
          padding: 20px;
          text-align: center;
          color: ${dark ? '#888' : '#aaa'};
          font-size: 13px;
          width: 100%;
        }
      </style>
      <div class="ep-wrap">
        <div class="ep-search-row">
          <input class="ep-search" placeholder="Search emojis…" />
        </div>
        <div class="ep-tabs">${tabs}</div>
        <div class="ep-grid">${!_emojiData ? '<div class="ep-loading">Loading…</div>' : _buildGridHTML(emojis, activeTab, searchQuery)}</div>
      </div>
    `;
  }

  function updateGrid() {
    const gridEl = container.querySelector('.ep-grid');
    if (!gridEl) return;
    gridEl.innerHTML = _buildGridHTML(emojis, activeTab, searchQuery);
    bindGridEvents();
    updateTabActive();
  }

  function updateTabActive() {
    container.querySelectorAll('.ep-tab').forEach((btn, i) => {
      btn.classList.toggle('active', i === activeTab && !searchQuery);
    });
  }

  function positionPicker() {
    const rect = anchorEl.getBoundingClientRect();
    const pickerEl = container.querySelector('.ep-wrap');
    if (!pickerEl) return;
    const ph = pickerEl.offsetHeight || 320;
    const pw = pickerEl.offsetWidth || 280;
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = rect.bottom + 6;
    let left = rect.left;
    if (top + ph > vh) top = rect.top - ph - 6;
    if (left + pw > vw) left = vw - pw - 8;
    if (left < 8) left = 8;
    container.style.top = top + 'px';
    container.style.left = left + 'px';
  }

  function bindGridEvents() {
    container.querySelectorAll('.ep-emoji').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const emoji = btn.dataset.emoji;
        _addRecent(emoji);
        onPick(emoji);
        _dismiss();
      });
    });
  }

  function bindStaticEvents() {
    // Search — only update the grid, never re-render the whole picker
    container.querySelector('.ep-search')?.addEventListener('input', e => {
      searchQuery = e.target.value;
      updateGrid();
    });

    // Tab clicks — only update grid + tab active state
    container.querySelectorAll('.ep-tab').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        activeTab = parseInt(btn.dataset.tab, 10);
        searchQuery = '';
        container.querySelector('.ep-search').value = '';
        updateGrid();
      });
    });

    container.querySelector('.ep-wrap')?.addEventListener('click', e => e.stopPropagation());
  }

  // Initial full render
  container.innerHTML = buildFullHTML();
  bindStaticEvents();
  bindGridEvents();
  positionPicker();
  container.querySelector('.ep-search')?.focus();

  // Dismiss on outside click
  setTimeout(() => document.addEventListener('click', _dismiss, { once: true }), 0);

  // Load emojis if not cached yet
  if (!_emojiData) {
    _loadEmojis().then(data => {
      emojis = data;
      if (_activePicker === container) updateGrid();
    });
  }
}
