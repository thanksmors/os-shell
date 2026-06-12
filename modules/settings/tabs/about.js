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
}
