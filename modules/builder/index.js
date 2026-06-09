import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { getData, setData, generateModule } from '/shell/api.js';

const COLLECTION = 'generated-modules';
const INDEX_KEY = 'index';

class AppBuilder extends HTMLElement {
  constructor() {
    super();
    this._messages = [];
    this._modules = {};
    this._activeTab = 'chat';
    this._loading = false;
    this._loadingTimer = null;
    this._loadingStart = 0;
    this._wrapper = null;
    this._themeObserver = null;
  }

  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const [moduleCss] = await Promise.all([
      fetch('/modules/builder/styles.css').then(r => r.text()).catch(() => ''),
    ]);
    const styleEl = document.createElement('style');
    styleEl.textContent = moduleCss;
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);
    await new Promise(r => setTimeout(r, 0));

    this._applyTheme();
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    this._modules = await getData(COLLECTION, INDEX_KEY) || {};
    this._messages = [{
      role: 'ai',
      text: "Hi! Describe the app you want to build and I'll generate it for you. Be specific — mention what data it saves, what actions the user can take, and how it should look.",
    }];
    this._render();
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
    clearInterval(this._loadingTimer);
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    const modCount = Object.keys(this._modules).length;
    this._wrapper.innerHTML = `
      <div class="tab-bar">
        <button class="tab ${this._activeTab === 'chat' ? 'active' : ''}" data-tab="chat">💬 Chat</button>
        <button class="tab ${this._activeTab === 'modules' ? 'active' : ''}" data-tab="modules">🧩 My Modules${modCount ? ` (${modCount})` : ''}</button>
      </div>
      ${this._activeTab === 'chat' ? this._renderChat() : this._renderModules()}
    `;
    this._bindEvents();
  }

  _renderChat() {
    return `
      <div class="messages" id="messages">
        ${this._messages.map(m => this._renderMessage(m)).join('')}
        ${this._loading ? `<div class="msg ai"><div class="bubble loading"><span class="loading-label">Asking AI</span><span class="loading-timer" id="loading-timer"></span></div></div>` : ''}
      </div>
      <div class="input-bar">
        <textarea class="chat-input" id="chat-input" placeholder="Describe the app you want to build…" rows="2"></textarea>
        <button class="send-btn" id="send-btn" ${this._loading ? 'disabled' : ''}>Send →</button>
      </div>
    `;
  }

  _renderMessage(msg) {
    if (msg.role === 'user') {
      return `<div class="msg user"><div class="bubble">${this._esc(msg.text)}</div></div>`;
    }
    const card = msg.preview ? this._renderPreviewCard(msg.preview) : '';
    return `<div class="msg ai"><div class="bubble">${this._esc(msg.text)}</div>${card}</div>`;
  }

  _renderPreviewCard({ manifest, js, css, installed, msgIdx }) {
    const id = manifest.appId;
    return `
      <div class="preview-card ${installed ? 'installed' : ''}" data-appid="${id}" data-msgidx="${msgIdx}">
        <div class="preview-header">
          <span class="preview-icon">${manifest.icon}</span>
          <span class="preview-title">${this._esc(manifest.title)}</span>
          ${installed ? '<span class="preview-badge">✓ Installed</span>' : ''}
        </div>
        <div class="preview-actions">
          <button class="code-toggle" data-target="js-${id}">JS ▾</button>
          <button class="code-toggle" data-target="css-${id}">CSS ▾</button>
          ${!installed ? `<button class="install-btn" data-action="install" data-msgidx="${msgIdx}">⬇ Install</button>` : ''}
        </div>
        <pre class="code-panel" id="js-${id}" style="display:none"><code>${this._esc(js)}</code></pre>
        <pre class="code-panel" id="css-${id}" style="display:none"><code>${this._esc(css)}</code></pre>
      </div>
    `;
  }

  _renderModules() {
    const entries = Object.entries(this._modules);
    return `
      <div class="modules-list">
        ${entries.length === 0 ? '<div class="empty-state">No generated modules yet.<br>Switch to Chat to create one.</div>' : ''}
        ${entries.map(([appId, { manifest }]) => `
          <div class="module-row">
            <span class="mod-icon">${manifest.icon}</span>
            <span class="mod-name">${this._esc(manifest.title)}</span>
            <span class="mod-type">${manifest.generator ? 'generator' : 'singleton'}</span>
            <button class="del-btn" data-action="delete" data-appid="${appId}">🗑</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    // Tab switching
    this._wrapper.querySelectorAll('.tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { this._activeTab = btn.dataset.tab; this._render(); });
    });

    // Chat send
    const sendBtn = this._wrapper.querySelector('#send-btn');
    const input = this._wrapper.querySelector('#chat-input');
    if (sendBtn && input) {
      sendBtn.addEventListener('click', () => this._send(input.value));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(input.value); }
      });
    }

    // Code panel toggles
    this._wrapper.querySelectorAll('.code-toggle[data-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = this._wrapper.querySelector(`#${btn.dataset.target}`);
        if (!panel) return;
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
        btn.textContent = btn.textContent.replace(open ? '▴' : '▾', open ? '▾' : '▴');
      });
    });

    // Install
    this._wrapper.querySelectorAll('[data-action="install"][data-msgidx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = this._messages[parseInt(btn.dataset.msgidx)];
        if (msg?.preview) this._install(msg.preview);
      });
    });

    // Delete
    this._wrapper.querySelectorAll('[data-action="delete"][data-appid]').forEach(btn => {
      btn.addEventListener('click', () => this._delete(btn.dataset.appid));
    });

    // Auto-scroll messages
    const msgs = this._wrapper.querySelector('#messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async _send(text) {
    text = text.trim();
    if (!text || this._loading) return;

    this._messages.push({ role: 'user', text });
    this._loading = true;
    this._loadingStart = Date.now();
    this._render();

    // Tick the elapsed-time counter every second
    this._loadingTimer = setInterval(() => {
      const el = this._wrapper.querySelector('#loading-timer');
      if (el) el.textContent = ` (${Math.floor((Date.now() - this._loadingStart) / 1000)}s)`;
    }, 1000);

    try {
      const result = await generateModule(text);
      clearInterval(this._loadingTimer);

      if (result.error) {
        this._messages.push({ role: 'ai', text: `❌ ${result.error}` });
      } else if (result.manifest && result.js) {
        const msgIdx = this._messages.length;
        const installed = !!this._modules[result.manifest.appId];
        this._messages.push({
          role: 'ai',
          text: `Here's your ${result.manifest.icon} ${result.manifest.title} module! Review the code and click Install to add it to your desktop.`,
          preview: { ...result, installed, msgIdx },
        });
      } else {
        this._messages.push({ role: 'ai', text: '❌ Unexpected response. Try rephrasing your request.' });
      }
    } catch (err) {
      clearInterval(this._loadingTimer);
      this._messages.push({ role: 'ai', text: `❌ ${err.message}` });
    }

    this._loading = false;
    this._render();
  }

  async _install({ manifest, js, css }) {
    try {
      this._modules[manifest.appId] = { manifest, js, css };
      await setData(COLLECTION, INDEX_KEY, this._modules);

      const blobUrl = URL.createObjectURL(new Blob([js], { type: 'application/javascript' }));
      this.api?.store?.registerApp({ ...manifest, entry: blobUrl });

      const msg = this._messages.find(m => m.preview?.manifest?.appId === manifest.appId);
      if (msg?.preview) msg.preview.installed = true;

      this.api?.notify(`${manifest.icon} ${manifest.title} installed!`, 'success');
      this._render();
    } catch (err) {
      this.api?.notify('Install failed: ' + err.message, 'error');
    }
  }

  async _delete(appId) {
    const mod = this._modules[appId];
    if (!mod) return;

    delete this._modules[appId];
    await setData(COLLECTION, INDEX_KEY, this._modules);
    this.api?.store?.unregisterApp(appId);
    this.api?.notify('Module removed', 'info');
    this._render();
  }
}

if (!customElements.get('app-builder')) {
  customElements.define('app-builder', AppBuilder);
}
