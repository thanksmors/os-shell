// Workspace tab — members, invites, rename, switch/sign-out, delete.
// `host` is the AppSettings custom element instance (provides .api, ._esc, ._renderTab).
export async function renderWorkspaceTab(host, content) {
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
            <div class="settings-row-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${host._esc(m.name || m.email || 'Unknown')}</div>
            <div class="settings-row-desc" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${host._esc(m.email || '')}</div>
          </div>
        </div>
        <span style="font-size:0.75rem;padding:2px 8px;border-radius:20px;background:${m.role==='owner'?'#dbeafe':m.role==='admin'?'#f3e8ff':'#f3f4f6'};color:${m.role==='owner'?'#1d4ed8':m.role==='admin'?'#7c3aed':'#374151'};white-space:nowrap;text-transform:capitalize;">${host._esc(m.role)}</span>
        ${ws.role === 'owner' && m.role !== 'owner' ? `<button class="settings-btn" data-action="remove-member" data-user-id="${m.userId}" style="padding:4px 10px;font-size:0.75rem;">Remove</button>` : ''}
      </div>
    `).join('');

  content.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">Current Workspace</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">${host._esc(ws.icon || '')} ${host._esc(ws.name)}</div>
            <div class="settings-row-desc">Your role: ${host._esc(ws.role)}</div>
          </div>
          ${['owner','admin'].includes(ws.role) ? `<button class="settings-btn" id="btn-edit-ws">Edit</button>` : ''}
        </div>
        ${['owner','admin'].includes(ws.role) ? `
        <div id="edit-ws-form" style="display:none;" class="settings-row" style="flex-direction:column;gap:8px;">
          <div style="display:flex;gap:8px;">
            <input class="settings-input" id="ws-icon" value="${host._esc(ws.icon||'🏢')}" maxlength="4" style="width:56px;" />
            <input class="settings-input" id="ws-name" value="${host._esc(ws.name)}" placeholder="Workspace name…" style="flex:1;" />
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

      ${ws.role === 'owner' ? `
      <div class="settings-section">
        <div class="settings-section-title" style="color:#ef4444;">Danger Zone</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Delete Workspace</div>
            <div class="settings-row-desc">Permanently delete "${host._esc(ws.name)}" and all its data. This cannot be undone.</div>
          </div>
          <button class="settings-btn" id="btn-delete-ws" style="color:#ef4444;border-color:#fca5a5;">Delete</button>
        </div>
      </div>
      ` : ''}
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
      host.api?.notify('Workspace updated', 'success');
      host._renderTab(content, 'workspace');
    } catch { host.api?.notify('Failed to update workspace', 'error'); }
  });

  // Remove member
  content.querySelectorAll('[data-action="remove-member"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      try {
        const { removeMember } = await import('/shell/workspace.js');
        await removeMember(ws.workspaceId, userId, session);
        host.api?.notify('Member removed', 'success');
        host._renderTab(content, 'workspace');
      } catch { host.api?.notify('Failed to remove member', 'error'); }
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
        host.api?.notify('Link copied!', 'success');
      });
    } catch { host.api?.notify('Failed to create invite', 'error'); }
  });

  // Switch workspace
  content.querySelector('#btn-switch-ws')?.addEventListener('click', () => {
    const authStore = window.Alpine?.store('auth');
    if (authStore) {
      authStore.screen = 'workspace-select';
      localStorage.removeItem('os-workspace');
    }
    host.api?.requestClose();
  });

  // Sign out
  content.querySelector('#btn-signout')?.addEventListener('click', () => {
    window.Alpine?.store('auth')?.signOut();
    host.api?.requestClose();
  });

  // Delete workspace (owner only)
  content.querySelector('#btn-delete-ws')?.addEventListener('click', async () => {
    if (!confirm(`Delete workspace "${ws.name}"? This permanently removes all data and cannot be undone.`)) return;
    try {
      const { deleteWorkspace } = await import('/shell/workspace.js');
      await deleteWorkspace(ws.workspaceId, session);
      localStorage.removeItem('os-workspace');
      const authStore = window.Alpine?.store('auth');
      if (authStore) {
        authStore.workspaces = authStore.workspaces.filter(w => w.workspaceId !== ws.workspaceId);
        authStore.workspace = null;
        authStore.screen = authStore.workspaces.length ? 'workspace-select' : 'login';
        if (!authStore.workspaces.length) authStore.signOut();
      }
      host.api?.requestClose();
    } catch { host.api?.notify('Failed to delete workspace', 'error'); }
  });
}
