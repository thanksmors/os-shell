// About tab — system info + actions.
// `host` is the AppSettings custom element instance (provides .api, ._renderTab).
export function renderAboutTab(host, content) {
  content.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">System Information</div>
        <div class="settings-info-grid">
          <div class="settings-info-card">
            <div class="settings-info-label">OS Name</div>
            <div class="settings-info-value">Alpine Shell</div>
          </div>
          <div class="settings-info-card">
            <div class="settings-info-label">Version</div>
            <div class="settings-info-value">1.0.0</div>
          </div>
          <div class="settings-info-card">
            <div class="settings-info-label">Alpine.js</div>
            <div class="settings-info-value">v3.x</div>
          </div>
          <div class="settings-info-card">
            <div class="settings-info-label">Build</div>
            <div class="settings-info-value">2025.05</div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Actions</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Clear All Windows</div>
            <div class="settings-row-desc">Close all open application windows</div>
          </div>
          <button class="settings-btn" id="btn-clear-windows">Close All</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Reset Theme</div>
            <div class="settings-row-desc">Reset to default light theme</div>
          </div>
          <button class="settings-btn" id="btn-reset-theme">Reset</button>
        </div>
      </div>
    `;

  content.querySelector('#btn-clear-windows').addEventListener('click', () => {
    if (host.api) {
      const store = host.api.store;
      const toClose = store.windows.filter(w => w.appId !== 'settings').map(w => w.id);
      toClose.forEach(id => store.close(id));
      host.api.notify('All windows closed', 'info');
    }
  });

  content.querySelector('#btn-reset-theme').addEventListener('click', () => {
    if (host.api) {
      const store = host.api.store;
      if (store.theme !== 'light') {
        store.toggleTheme();
        host._renderTab(content, 'about');
      }
      host.api.notify('Theme reset to light', 'success');
    }
  });
}
