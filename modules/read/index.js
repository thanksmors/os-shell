// Read — singleton window that embeds read.odvi.app like a mini browser.
// No persistence; plain web component (no AppModuleBase needed).
//
// Note: if read.odvi.app ever sends X-Frame-Options: DENY or a restrictive
// frame-ancestors CSP, the iframe will render blank — the "Open in tab"
// toolbar button is the fallback. Embedding can be allowed on the domain
// since it's first-party.

const READ_URL = 'https://read.odvi.app';

class AppRead extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'read-root';
    wrapper.innerHTML = `
      <div class="read-toolbar">
        <span class="read-title">📖 Read</span>
        <span class="read-url">${READ_URL.replace('https://', '')}</span>
        <button class="read-btn" id="btn-reload" title="Reload">↻</button>
        <button class="read-btn" id="btn-open" title="Open in browser tab">⧉</button>
      </div>
      <div class="read-loading" id="loading"><div class="read-spinner"></div></div>
      <iframe id="frame" src="${READ_URL}" allow="clipboard-write; fullscreen"></iframe>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .read-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #ffffff;
      }
      .dark .read-root { background: #1e2433; }
      .read-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
        flex-shrink: 0;
      }
      .dark .read-toolbar { background: #161d2e; border-bottom-color: rgba(255,255,255,0.07); }
      .read-title { font-size: 0.8rem; font-weight: 600; color: #374151; }
      .dark .read-title { color: #e5e7eb; }
      .read-url {
        flex: 1;
        font-size: 0.75rem;
        color: #9ca3af;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .read-btn {
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 0.9rem;
        color: #6b7280;
        padding: 4px 8px;
        border-radius: 6px;
        line-height: 1;
        transition: background 150ms, color 150ms;
      }
      .read-btn:hover { background: rgba(0,0,0,0.06); color: #111827; }
      .dark .read-btn { color: #9ca3af; }
      .dark .read-btn:hover { background: rgba(255,255,255,0.08); color: #f3f4f6; }
      iframe {
        flex: 1;
        width: 100%;
        border: 0;
        display: block;
      }
      .read-loading {
        position: absolute;
        inset: 33px 0 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        pointer-events: none;
        transition: opacity 200ms;
      }
      .dark .read-loading { background: #1e2433; }
      .read-loading.hidden { opacity: 0; }
      .read-spinner {
        width: 28px;
        height: 28px;
        border: 3px solid #e5e7eb;
        border-top-color: var(--os-accent, #3b82f6);
        border-radius: 50%;
        animation: read-spin 0.8s linear infinite;
      }
      @keyframes read-spin { to { transform: rotate(360deg); } }
      .read-root { position: relative; }
    `;

    this._shadow.appendChild(style);
    this._shadow.appendChild(wrapper);

    const frame = wrapper.querySelector('#frame');
    const loading = wrapper.querySelector('#loading');

    const ready = () => {
      loading.classList.add('hidden');
      this.api?.setReady?.();
    };
    frame.addEventListener('load', ready);
    setTimeout(ready, 3000); // safety net — never leave the skeleton stuck

    wrapper.querySelector('#btn-reload').addEventListener('click', () => {
      loading.classList.remove('hidden');
      frame.src = READ_URL;
    });
    wrapper.querySelector('#btn-open').addEventListener('click', () => {
      window.open(READ_URL, '_blank', 'noopener');
    });
  }
}

customElements.define('app-read', AppRead);
