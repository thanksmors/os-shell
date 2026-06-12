import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { SETTINGS_CSS } from './tabs/styles.js';
import { renderAppearanceTab } from './tabs/appearance.js';
import { renderAboutTab } from './tabs/about.js';
import { renderWorkspaceTab } from './tabs/workspace.js';
import { renderAppsTab } from './tabs/apps.js';

const TABS = [
  { id: 'appearance', icon: '🎨', label: 'Appearance' },
  { id: 'apps', icon: '🧩', label: 'Apps' },
  { id: 'workspace', icon: '🏢', label: 'Workspace' },
  { id: 'about', icon: 'ℹ️', label: 'About' },
];

class AppSettings extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._activeTab = 'appearance';
  }

  connectedCallback() {
    this._render();
  }

  async _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'module-root settings-root';

    const sidebar = document.createElement('nav');
    sidebar.className = 'settings-sidebar';

    const content = document.createElement('div');
    content.className = 'settings-content';

    wrapper.appendChild(sidebar);
    wrapper.appendChild(content);
    this._shadow.appendChild(wrapper);

    await adoptTailwind(this._shadow, wrapper);

    const style = document.createElement('style');
    style.textContent = SETTINGS_CSS;
    this._shadow.appendChild(style);

    this._renderSidebar(sidebar, content);
    this._renderTab(content, this._activeTab);
  }

  _renderSidebar(sidebar, content) {
    const title = document.createElement('div');
    title.className = 'settings-sidebar-title';
    title.textContent = 'Settings';
    sidebar.appendChild(title);

    for (const tab of TABS) {
      const btn = document.createElement('button');
      btn.className = `settings-tab-btn${this._activeTab === tab.id ? ' active' : ''}`;
      btn.innerHTML = `<span>${tab.icon}</span><span>${tab.label}</span>`;
      btn.dataset.tab = tab.id;
      btn.addEventListener('click', () => {
        this._activeTab = tab.id;
        this._shadow.querySelectorAll('.settings-tab-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === tab.id);
        });
        this._renderTab(content, tab.id);
      });
      sidebar.appendChild(btn);
    }
  }

  _renderTab(content, tabId) {
    content.innerHTML = '';

    if (tabId === 'appearance') {
      renderAppearanceTab(this, content);
    } else if (tabId === 'apps') {
      renderAppsTab(this, content);
    } else if (tabId === 'workspace') {
      renderWorkspaceTab(this, content);
    } else if (tabId === 'about') {
      renderAboutTab(this, content);
    }
  }

  _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

customElements.define('app-settings', AppSettings);
