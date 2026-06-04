// Appearance tab — theme + desktop toggles.
// `host` is the AppSettings custom element instance (provides .api).
export function renderAppearanceTab(host, content) {
  const isDark = document.documentElement.classList.contains('dark');

  content.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">Theme</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Dark Mode</div>
            <div class="settings-row-desc">Toggle between light and dark interface</div>
          </div>
          <button class="settings-toggle ${isDark ? 'on' : ''}" id="theme-toggle" title="Toggle dark mode"></button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Desktop</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Window Animations</div>
            <div class="settings-row-desc">Smooth animations when opening windows</div>
          </div>
          <button class="settings-toggle on" id="anim-toggle" title="Toggle animations"></button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Show Desktop Icons</div>
            <div class="settings-row-desc">Display app icons on desktop</div>
          </div>
          <button class="settings-toggle on" id="icons-toggle" title="Toggle desktop icons"></button>
        </div>
      </div>
    `;

  const themeToggle = content.querySelector('#theme-toggle');
  themeToggle.addEventListener('click', () => {
    if (host.api) {
      host.api.store.toggleTheme();
      const nowDark = document.documentElement.classList.contains('dark');
      themeToggle.classList.toggle('on', nowDark);
    }
  });

  // Non-functional toggles (demo)
  content.querySelector('#anim-toggle').addEventListener('click', (e) => {
    e.target.classList.toggle('on');
  });
  content.querySelector('#icons-toggle').addEventListener('click', (e) => {
    e.target.classList.toggle('on');
  });
}
