// Renders a Settings tab's content into an arbitrary light-DOM element so the
// Settings app can live INSIDE the Spaces modal (onboarding hub). Reuses the
// exact tab renderers the Settings window uses, with a host adapter that maps
// requestClose → closeOnboarding. SETTINGS_CSS is injected once into the page
// (the tab markup uses bare .settings-* classes, so global injection styles it;
// it can't pierce other modules' shadow DOM).
import { SETTINGS_CSS } from '/modules/settings/tabs/styles.js';
import { renderAppearanceTab } from '/modules/settings/tabs/appearance.js';
import { renderAppsTab } from '/modules/settings/tabs/apps.js';
import { renderWorkspaceTab } from '/modules/settings/tabs/workspace.js';
import { renderAboutTab } from '/modules/settings/tabs/about.js';

export const SETTINGS_TABS = [
  { id: 'appearance', icon: '🎨', label: 'Appearance' },
  { id: 'apps',       icon: '🧩', label: 'Apps' },
  { id: 'workspace',  icon: '🏢', label: 'Workspace' },
  { id: 'about',      icon: 'ℹ️', label: 'About' },
];

const RENDERERS = {
  appearance: renderAppearanceTab,
  apps: renderAppsTab,
  workspace: renderWorkspaceTab,
  about: renderAboutTab,
};

let _cssInjected = false;
function injectCss() {
  if (_cssInjected || document.getElementById('settings-embed-css')) { _cssInjected = true; return; }
  const style = document.createElement('style');
  style.id = 'settings-embed-css';
  style.textContent = SETTINGS_CSS;
  document.head.appendChild(style);
  _cssInjected = true;
}

function makeHost() {
  const store = window.Alpine?.store('os');
  const host = {
    _esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    api: {
      store,
      notify: (msg, type) => store?.notify?.(msg, type),
      // Inside the hub there is no window to close — closing means dismissing the
      // Spaces modal (e.g. after Switch workspace / Sign out / Delete).
      requestClose: () => store?.closeOnboarding?.(false),
    },
    // Tabs re-render themselves via host._renderTab(content, tabId).
    _renderTab: (content, tabId) => renderInto(tabId, content, host),
  };
  return host;
}

function renderInto(tabId, contentEl, host) {
  const fn = RENDERERS[tabId] || renderAppearanceTab;
  return fn(host, contentEl);
}

// Render a settings tab into contentEl. Returns the (possibly async) renderer result.
export function renderSettingsTab(tabId, contentEl) {
  if (!contentEl) return;
  injectCss();
  return renderInto(tabId, contentEl, makeHost());
}
