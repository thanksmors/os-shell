import { adoptTailwind } from '/shell/shadow-tailwind.js';

const TABS = [
  { id: 'appearance', label: '🎨 Appearance', icon: '🎨' },
  { id: 'workspace', label: '🏢 Workspace', icon: '🏢' },
  { id: 'about', label: 'ℹ️ About', icon: 'ℹ️' },
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
    style.textContent = `
      .settings-root {
        background: #ffffff;
        color: #111827;
        display: flex;
        flex-direction: row;
        overflow: hidden;
      }
      .dark .settings-root {
        background: #1e2433;
        color: #e5e7eb;
      }
      .settings-sidebar {
        width: 160px;
        min-width: 140px;
        flex-shrink: 0;
        background: #f9fafb;
        border-right: 1px solid #e5e7eb;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .dark .settings-sidebar {
        background: #161d2e;
        border-right-color: rgba(255,255,255,0.07);
      }
      .settings-sidebar-title {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ca3af;
        padding: 6px 10px 4px;
      }
      .settings-tab-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 8px;
        border: none;
        background: transparent;
        font-size: 0.875rem;
        color: #374151;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 150ms, color 150ms;
      }
      .settings-tab-btn:hover {
        background: #e5e7eb;
      }
      .dark .settings-tab-btn {
        color: #d1d5db;
      }
      .dark .settings-tab-btn:hover {
        background: rgba(255,255,255,0.07);
      }
      .settings-tab-btn.active {
        background: #dbeafe;
        color: #1d4ed8;
        font-weight: 500;
      }
      .dark .settings-tab-btn.active {
        background: rgba(59,130,246,0.15);
        color: #93c5fd;
      }
      .settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      .settings-section {
        margin-bottom: 24px;
      }
      .settings-section-title {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ca3af;
        margin-bottom: 12px;
      }
      .settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        margin-bottom: 8px;
      }
      .dark .settings-row {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.07);
      }
      .settings-row-label {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .settings-row-desc {
        font-size: 0.75rem;
        color: #9ca3af;
        margin-top: 2px;
      }
      .settings-toggle {
        position: relative;
        width: 44px;
        height: 24px;
        background: #e5e7eb;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        transition: background 200ms;
        flex-shrink: 0;
      }
      .settings-toggle.on {
        background: #3b82f6;
      }
      .settings-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: #ffffff;
        border-radius: 50%;
        transition: transform 200ms;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      .settings-toggle.on::after {
        transform: translateX(20px);
      }
      .settings-btn {
        padding: 7px 16px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        color: #374151;
        transition: background 150ms, border-color 150ms;
      }
      .settings-btn:hover {
        background: #f3f4f6;
        border-color: #d1d5db;
      }
      .dark .settings-btn {
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.1);
        color: #d1d5db;
      }
      .dark .settings-btn:hover {
        background: rgba(255,255,255,0.10);
      }
      .settings-info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .settings-info-card {
        padding: 12px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
      }
      .dark .settings-info-card {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.07);
      }
      .settings-info-label {
        font-size: 0.7rem;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .settings-info-value {
        font-size: 0.875rem;
        font-weight: 600;
      }
    `;
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
      btn.innerHTML = `<span>${tab.icon}</span><span>${tab.label.replace(/^.\s/, '')}</span>`;
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
      this._renderAppearanceTab(content);
    } else if (tabId === 'workspace') {
      this._renderWorkspaceTab(content);
    } else if (tabId === 'about') {
      this._renderAboutTab(content);
    }
  }

  _renderAppearanceTab(content) {
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
      if (this.api) {
        this.api.store.toggleTheme();
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

  _renderAboutTab(content) {
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
      if (this.api) {
        const store = this.api.store;
        const toClose = store.windows.filter(w => w.appId !== 'settings').map(w => w.id);
        toClose.forEach(id => store.close(id));
        this.api.notify('All windows closed', 'info');
      }
    });

    content.querySelector('#btn-reset-theme').addEventListener('click', () => {
      if (this.api) {
        const store = this.api.store;
        if (store.theme !== 'light') {
          store.toggleTheme();
          this._renderTab(content, 'about');
        }
        this.api.notify('Theme reset to light', 'success');
      }
    });
  }
  async _renderWorkspaceTab(content) {
    const auth = window.Alpine?.store('auth');
    const ws = auth?.workspace;
    if (!ws) {
      content.innerHTML = `<div class="settings-section"><div class="settings-section-title">Workspace</div><div style="color:#9ca3af;font-size:0.875rem;">Not signed in</div></div>`;
      return;
    }

    const session = localStorage.getItem('os-session');
    let members = [];
    try {
      const { fetchMembers } = await import('/shell/workspace.js');
      members = await fetchMembers(ws.workspaceId, session) || [];
    } catch {}

    const memberRows = members.map(m => `
      <div class="settings-row" style="gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          ${m.picture ? `<img src="${m.picture}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;" />` : `<div style="width:28px;height:28px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:0.8rem;flex-shrink:0;">${(m.name||m.email||'?')[0].toUpperCase()}</div>`}
          <div style="min-width:0;">
            <div class="settings-row-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._esc(m.name || m.email || 'Unknown')}</div>
            <div class="settings-row-desc" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._esc(m.email || '')}</div>
          </div>
        </div>
        <span style="font-size:0.75rem;padding:2px 8px;border-radius:20px;background:${m.role==='owner'?'#dbeafe':m.role==='admin'?'#f3e8ff':'#f3f4f6'};color:${m.role==='owner'?'#1d4ed8':m.role==='admin'?'#7c3aed':'#374151'};white-space:nowrap;text-transform:capitalize;">${this._esc(m.role)}</span>
        ${ws.role === 'owner' && m.role !== 'owner' ? `<button class="settings-btn" data-action="remove-member" data-user-id="${m.userId}" style="padding:4px 10px;font-size:0.75rem;">Remove</button>` : ''}
      </div>
    `).join('');

    content.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">Current Workspace</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">${this._esc(ws.icon || '')} ${this._esc(ws.name)}</div>
            <div class="settings-row-desc">Your role: ${this._esc(ws.role)}</div>
          </div>
          ${['owner','admin'].includes(ws.role) ? `<button class="settings-btn" id="btn-edit-ws">Edit</button>` : ''}
        </div>
        ${['owner','admin'].includes(ws.role) ? `
        <div id="edit-ws-form" style="display:none;" class="settings-row" style="flex-direction:column;gap:8px;">
          <div style="display:flex;gap:8px;">
            <input class="settings-input" id="ws-icon" value="${this._esc(ws.icon||'🏢')}" maxlength="4" style="width:56px;" />
            <input class="settings-input" id="ws-name" value="${this._esc(ws.name)}" placeholder="Workspace name…" style="flex:1;" />
          </div>
          <button class="settings-save" id="btn-save-ws">Save</button>
        </div>
        ` : ''}
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Members (${members.length})</div>
        ${memberRows}
      </div>

      ${['owner','admin'].includes(ws.role) ? `
      <div class="settings-section">
        <div class="settings-section-title">Invite</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Invite Link</div>
            <div class="settings-row-desc">7-day link, anyone with it can join as member</div>
          </div>
          <button class="settings-btn" id="btn-create-invite">Generate</button>
        </div>
        <div id="invite-result" style="display:none;padding:8px;background:#f3f4f6;border-radius:8px;font-size:0.75rem;word-break:break-all;margin-top:4px;"></div>
      </div>
      ` : ''}

      <div class="settings-section">
        <div class="settings-section-title">Account</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Switch Workspace</div>
            <div class="settings-row-desc">Go back to workspace selection</div>
          </div>
          <button class="settings-btn" id="btn-switch-ws">Switch</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Sign Out</div>
            <div class="settings-row-desc">Sign out of your account</div>
          </div>
          <button class="settings-btn" id="btn-signout" style="color:#ef4444;border-color:#fca5a5;">Sign Out</button>
        </div>
      </div>
    `;

    // Edit workspace toggle
    const editBtn = content.querySelector('#btn-edit-ws');
    const editForm = content.querySelector('#edit-ws-form');
    editBtn?.addEventListener('click', () => {
      editForm.style.display = editForm.style.display === 'none' ? 'flex' : 'none';
    });

    // Save workspace name/icon
    content.querySelector('#btn-save-ws')?.addEventListener('click', async () => {
      const name = content.querySelector('#ws-name')?.value.trim();
      const icon = content.querySelector('#ws-icon')?.value.trim();
      if (!name) return;
      try {
        const { updateWorkspace } = await import('/shell/workspace.js');
        await updateWorkspace(ws.workspaceId, name, icon || ws.icon, session);
        const authStore = window.Alpine?.store('auth');
        if (authStore) {
          authStore.workspace = { ...authStore.workspace, name, icon: icon || ws.icon };
          authStore.workspaces = authStore.workspaces.map(w => w.workspaceId === ws.workspaceId ? { ...w, name, icon: icon || ws.icon } : w);
        }
        this.api?.notify('Workspace updated', 'success');
        this._renderTab(content, 'workspace');
      } catch { this.api?.notify('Failed to update workspace', 'error'); }
    });

    // Remove member
    content.querySelectorAll('[data-action="remove-member"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.userId;
        try {
          const { removeMember } = await import('/shell/workspace.js');
          await removeMember(ws.workspaceId, userId, session);
          this.api?.notify('Member removed', 'success');
          this._renderTab(content, 'workspace');
        } catch { this.api?.notify('Failed to remove member', 'error'); }
      });
    });

    // Create invite
    content.querySelector('#btn-create-invite')?.addEventListener('click', async () => {
      try {
        const { createInvite } = await import('/shell/workspace.js');
        const invite = await createInvite(ws.workspaceId, 'member', session);
        const link = `${window.location.origin}${window.location.pathname}?invite=${invite.inviteId}`;
        const result = content.querySelector('#invite-result');
        result.style.display = 'block';
        result.innerHTML = `<strong>Invite link (7 days):</strong><br/><a href="${link}" style="color:#2563eb;">${link}</a><br/><button class="settings-btn" style="margin-top:6px;font-size:0.75rem;" id="btn-copy-invite">Copy</button>`;
        result.querySelector('#btn-copy-invite')?.addEventListener('click', () => {
          navigator.clipboard?.writeText(link);
          this.api?.notify('Link copied!', 'success');
        });
      } catch { this.api?.notify('Failed to create invite', 'error'); }
    });

    // Switch workspace
    content.querySelector('#btn-switch-ws')?.addEventListener('click', () => {
      const authStore = window.Alpine?.store('auth');
      if (authStore) {
        authStore.screen = 'workspace-select';
        localStorage.removeItem('os-workspace');
      }
      this.api?.requestClose();
    });

    // Sign out
    content.querySelector('#btn-signout')?.addEventListener('click', () => {
      window.Alpine?.store('auth')?.signOut();
      this.api?.requestClose();
    });
  }

  _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

customElements.define('app-settings', AppSettings);
