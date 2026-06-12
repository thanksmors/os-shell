import { BACKEND_URL, API_KEY } from '/shell/config.js';

export function renderAboutTab(host, content) {
  content.innerHTML = `
    <div class="about-hero">
      <div class="about-logo">🪐</div>
      <div class="about-title">ODVI Spaces</div>
      <div class="about-subtitle">A shared workspace for your team.</div>
      <div class="about-version">Version 1.0.0</div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Built With</div>
      <div class="settings-info-grid">
        <div class="settings-info-card">
          <div class="settings-info-label">Reactive UI</div>
          <div class="settings-info-value">Alpine.js v3</div>
        </div>
        <div class="settings-info-card">
          <div class="settings-info-label">Animations</div>
          <div class="settings-info-value">Motion v11</div>
        </div>
        <div class="settings-info-card">
          <div class="settings-info-label">Modules</div>
          <div class="settings-info-value">Web Components</div>
        </div>
        <div class="settings-info-card">
          <div class="settings-info-label">Backend</div>
          <div class="settings-info-value">Codehooks.io</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Actions</div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Close All Windows</div>
          <div class="settings-row-desc">Close all open application windows</div>
        </div>
        <button class="settings-btn" id="btn-clear">Close All</button>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Reset Appearance</div>
          <div class="settings-row-desc">Restore default theme, font size, and accent color</div>
        </div>
        <button class="settings-btn settings-btn--danger" id="btn-reset">Reset</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Feedback</div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:0.5rem">
        <div class="settings-row-label">Suggestion or bug report</div>
        <textarea id="suggestion-text" rows="3" placeholder="What's on your mind?"
          style="width:100%;resize:vertical;border:1px solid var(--os-border,#e4e4e7);border-radius:6px;padding:0.5rem 0.625rem;font-size:0.875rem;font-family:inherit;background:var(--os-bg,#fff);color:inherit;outline:none;box-sizing:border-box"></textarea>
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:0.5rem">
          <span id="suggestion-status" style="font-size:0.75rem;color:#9ca3af"></span>
          <button class="settings-btn" id="btn-suggest">Send</button>
        </div>
      </div>
    </div>
  `;

  content.querySelector('#btn-clear').addEventListener('click', () => {
    const store = host.api?.store;
    if (!store) return;
    store.windows.filter(w => w.appId !== 'settings').map(w => w.id).forEach(id => store.close(id));
    host.api.notify('All windows closed', 'info');
  });

  content.querySelector('#btn-reset').addEventListener('click', () => {
    localStorage.removeItem('os:font-size');
    localStorage.removeItem('os:font-family');
    localStorage.removeItem('os:accent');
    localStorage.removeItem('os:icon-size');
    localStorage.removeItem('os:animated-bg');
    document.documentElement.style.fontSize = '';
    document.documentElement.style.fontFamily = '';
    document.documentElement.style.setProperty('--os-accent', '#3b82f6');
    document.documentElement.style.setProperty('--os-icon-size', '80px');
    document.documentElement.style.setProperty('--os-icon-emoji', '2rem');
    const wallpaper = document.querySelector('.os-desktop-wallpaper');
    if (wallpaper) wallpaper.classList.remove('animated');
    const store = host.api?.store;
    if (store) {
      if (store.theme !== 'light') store.toggleTheme();
      store.animatedBg = false;
    }
    host.api?.notify('Appearance reset to defaults', 'info');
  });

  content.querySelector('#btn-suggest').addEventListener('click', async () => {
    const textarea = content.querySelector('#suggestion-text');
    const status   = content.querySelector('#suggestion-status');
    const text = textarea.value.trim();
    if (!text) { textarea.focus(); return; }
    const email = host.api?.store?.auth?.user?.email || 'anonymous';
    try {
      status.textContent = 'Sending…';
      const res = await fetch(`${BACKEND_URL}/suggestions?apikey=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, email }),
      });
      if (!res.ok) throw new Error(await res.text());
      textarea.value = '';
      status.textContent = '';
      host.api?.notify('Feedback sent — thanks!', 'success');
    } catch (e) {
      status.textContent = 'Failed to send';
      console.error(e);
    }
  });
}
