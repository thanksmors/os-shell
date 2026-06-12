// Apps tab — show/hide apps on the desktop and Start menu.
// `host` is the AppSettings element; host.api.store is the os store.
export function renderAppsTab(host, content) {
  const store = host.api?.store;
  if (!store) {
    content.innerHTML = `<div class="settings-section"><div class="settings-section-title">Apps</div><div style="color:#9ca3af;font-size:0.875rem;">Unavailable</div></div>`;
    return;
  }

  const apps = Object.values(store.apps)
    .filter(a => !a.generator)
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  const rows = apps.map(a => {
    const hidden = store.isAppHidden(a.appId);
    return `
      <div class="settings-row">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span style="font-size:1.25rem;line-height:1;flex-shrink:0;">${host._esc(a.icon || '📦')}</span>
          <div style="min-width:0;">
            <div class="settings-row-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${host._esc(a.title || a.appId)}</div>
            <div class="settings-row-desc">${hidden ? 'Hidden' : 'Visible'} on desktop &amp; Start menu</div>
          </div>
        </div>
        <button class="settings-toggle${hidden ? '' : ' on'}" data-app-id="${host._esc(a.appId)}"></button>
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">App Visibility</div>
      <div class="settings-row settings-row--col" style="align-items:flex-start;">
        <div class="settings-row-desc">Turn an app off to hide its icon from the desktop and Start menu. Its data is kept, and you can turn it back on anytime.</div>
      </div>
      ${rows}
    </div>
  `;

  content.querySelectorAll('[data-app-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.toggleAppHidden(btn.dataset.appId);
      const nowHidden = store.isAppHidden(btn.dataset.appId);
      btn.classList.toggle('on', !nowHidden);
      const desc = btn.closest('.settings-row')?.querySelector('.settings-row-desc');
      if (desc) desc.textContent = (nowHidden ? 'Hidden' : 'Visible') + ' on desktop & Start menu';
    });
  });
}
