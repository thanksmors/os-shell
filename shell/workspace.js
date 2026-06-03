import { BACKEND_URL, API_KEY } from './config.js';

function authUrl(path, sessionToken) {
  const sep = path.includes('?') ? '&' : '?';
  return `${BACKEND_URL}${path}${sep}apikey=${API_KEY}&session=${encodeURIComponent(sessionToken)}`;
}

async function apiFetch(path, sessionToken, options = {}) {
  const r = await fetch(authUrl(path, sessionToken), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!r.ok) throw new Error(`API error ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

export async function fetchWorkspaces(sessionToken) {
  return apiFetch('/workspaces', sessionToken);
}

export async function createWorkspace(name, icon, sessionToken) {
  return apiFetch('/workspaces', sessionToken, {
    method: 'POST',
    body: JSON.stringify({ name, icon }),
  });
}

export async function updateWorkspace(workspaceId, name, icon, sessionToken) {
  return apiFetch(`/workspaces/${workspaceId}`, sessionToken, {
    method: 'PUT',
    body: JSON.stringify({ name, icon }),
  });
}

export async function fetchMembers(workspaceId, sessionToken) {
  return apiFetch(`/workspaces/${workspaceId}/members`, sessionToken);
}

export async function updateMember(workspaceId, userId, role, sessionToken) {
  return apiFetch(`/workspaces/${workspaceId}/members/${userId}`, sessionToken, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(workspaceId, userId, sessionToken) {
  return apiFetch(`/workspaces/${workspaceId}/members/${userId}`, sessionToken, {
    method: 'DELETE',
  });
}

export async function createInvite(workspaceId, role, sessionToken) {
  return apiFetch(`/workspaces/${workspaceId}/invites`, sessionToken, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export async function getInvite(inviteId) {
  const r = await fetch(`${BACKEND_URL}/invites/${inviteId}?apikey=${API_KEY}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

export async function acceptInvite(inviteId, sessionToken) {
  return apiFetch(`/invites/${inviteId}/accept`, sessionToken, {
    method: 'POST',
  });
}

export async function deleteWorkspace(workspaceId, sessionToken) {
  return apiFetch(`/workspaces/${workspaceId}`, sessionToken, { method: 'DELETE' });
}
