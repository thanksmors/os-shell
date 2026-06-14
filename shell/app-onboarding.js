// Per-app onboarding: a small first-run intro overlay shown inside an app window.
// Pages are declared in the module manifest as `onboarding: [{title, body, features?, tips?}]`.
// Reuses the hub's .os-onboarding-*/.os-ob-* styles (adopted into every shadow root via
// adoptTailwind) inside an absolute, window-scoped overlay (.os-app-onboarding).
//
// Shown once on first load (seen flag os:onboarding-seen:<appId>, keyed on appId so a
// generator's intro shows once across all instances). Re-openable via showAppOnboarding
// (wired into each app's settings panel as a "Replay intro" button).

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// appId from an AppModuleBase host (_moduleId) or a standalone element tag (app-<id>--vN).
function appIdOf(host) {
  if (host && typeof host._moduleId === 'function') return host._moduleId();
  return (host?.tagName || '').toLowerCase().replace(/^app-/, '').replace(/--v\d+$/, '');
}

function pagesOf(host) {
  const appId = appIdOf(host);
  const pages = window.Alpine?.store('os')?.apps?.[appId]?.onboarding;
  return Array.isArray(pages) ? pages : [];
}

const seenKey = (appId) => `os:onboarding-seen:${appId}`;
export function hasSeenOnboarding(appId) { return localStorage.getItem(seenKey(appId)) === '1'; }

function slideHTML(page) {
  const features = Array.isArray(page.features) && page.features.length
    ? `<div class="os-ob-feat-row">${page.features.map(f => `
        <div class="os-ob-feat" title="${_esc(f.desc || '')}">
          <span class="os-ob-feat-icon">${_esc(f.icon || '•')}</span>
          <span class="os-ob-feat-name">${_esc(f.name || '')}</span>
        </div>`).join('')}</div>`
    : '';
  const tips = Array.isArray(page.tips) && page.tips.length
    ? `<p class="os-ob-body">${page.tips.map(t => `<span class="os-ob-tip">${_esc(t)}</span>`).join('')}</p>`
    : '';
  return `
    ${page.icon ? `<div class="os-ob-icon">${_esc(page.icon)}</div>` : ''}
    <h2 class="os-ob-title">${_esc(page.title || '')}</h2>
    ${page.body ? `<p class="os-ob-body">${_esc(page.body)}</p>` : ''}
    ${features}
    ${tips}
  `;
}

// Render (or re-render) the intro overlay into the app window. Always shows.
export function showAppOnboarding(host) {
  const wrapper = host?._wrapper;
  const pages = pagesOf(host);
  if (!wrapper || !pages.length) return;
  const appId = appIdOf(host);

  // Single instance per window.
  wrapper.querySelector(':scope > .os-app-onboarding')?.remove();
  wrapper.style.position = wrapper.style.position || 'relative';

  const overlay = document.createElement('div');
  overlay.className = 'os-app-onboarding';

  let slide = 0;
  let showNext = false;

  const close = () => {
    if (!showNext) localStorage.setItem(seenKey(appId), '1');
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

  const render = () => {
    const last = slide >= pages.length - 1;
    overlay.innerHTML = `
      <div class="os-onboarding-panel os-app-ob-panel">
        <div class="os-onboarding-slide">${slideHTML(pages[slide])}</div>
        <div class="os-onboarding-footer">
          <label class="os-ob-check" style="${last ? '' : 'visibility:hidden'}">
            <input type="checkbox" data-ob-next ${showNext ? 'checked' : ''}> Show next time
          </label>
          <div class="os-ob-dots">
            ${pages.map((_, i) => `<span class="os-ob-dot${i === slide ? ' active' : ''}" data-ob-dot="${i}"></span>`).join('')}
          </div>
          <button class="os-ob-next-btn" data-ob-act>${last ? 'Got it' : 'Next →'}</button>
        </div>
      </div>`;
    overlay.querySelector('[data-ob-act]').addEventListener('click', () => {
      if (slide >= pages.length - 1) close(); else { slide++; render(); }
    });
    overlay.querySelectorAll('[data-ob-dot]').forEach(d =>
      d.addEventListener('click', () => { slide = parseInt(d.dataset.obDot, 10); render(); }));
    const cb = overlay.querySelector('[data-ob-next]');
    if (cb) cb.addEventListener('change', () => { showNext = cb.checked; });
  };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  render();
  wrapper.appendChild(overlay);
  document.addEventListener('keydown', onKey);
}

// Auto-show on first load: only if the app declares pages and hasn't been seen.
export function maybeShowAppOnboarding(host) {
  if (!pagesOf(host).length) return;
  if (hasSeenOnboarding(appIdOf(host))) return;
  showAppOnboarding(host);
}

// Shared "Replay intro" control for an app's settings panel.
export function replayButtonHTML() {
  return `<button class="ob-replay-btn" data-ob-replay>↻ Replay intro</button>`;
}
// Wire the replay button(s) found within `root` (a shadowRoot or element).
export function wireReplay(host, root) {
  root?.querySelectorAll?.('[data-ob-replay]').forEach(b =>
    b.addEventListener('click', () => showAppOnboarding(host)));
}

// Minimal settings overlay for apps that have no settings panel of their own — its
// only purpose is the Replay intro action. Call from an `os:toggle-settings` listener:
//   this.addEventListener('os:toggle-settings', () => toggleMinimalSettings(this));
export function toggleMinimalSettings(host) {
  const wrapper = host?._wrapper;
  if (!wrapper) return;
  const existing = wrapper.querySelector(':scope > .app-settings-min');
  if (existing) { existing.remove(); return; }
  wrapper.style.position = wrapper.style.position || 'relative';
  const o = document.createElement('div');
  o.className = 'app-settings-min';
  o.innerHTML = `<div class="app-settings-card">
    <div class="as-title">Settings</div>
    ${replayButtonHTML()}
    <div class="as-row"><button class="ob-replay-btn" data-as-close>Close</button></div>
  </div>`;
  const close = () => o.remove();
  o.addEventListener('click', (e) => { if (e.target === o) close(); });
  o.querySelector('[data-as-close]').addEventListener('click', close);
  wireReplay(host, o);
  o.querySelector('[data-ob-replay]')?.addEventListener('click', close);
  wrapper.appendChild(o);
}
