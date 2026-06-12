import { app } from 'codehooks-js';
import { dbGet, dbUpsert, genId, kvSet, kvGet } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';
import { effectiveRole } from '../lib/roles.js';

// ─── Invites ──────────────────────────────────────────────────────────────────
// Invites stored in KV with 7-day TTL — expired entries auto-delete.

app.post('/workspaces/:workspaceId/invites', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId } = req.params;
  const membersDoc = await dbGet('ws_members', workspaceId);
  const ws = await dbGet('workspaces', workspaceId);
  const role = effectiveRole(ws, membersDoc, authUser.userId);
  if (!['owner', 'admin'].includes(role)) { res.status(403); res.json({ error: 'Insufficient permissions' }); return; }

  const inviteId = genId('inv');
  const invite = { inviteId, workspaceId, role: req.body.role || 'member', invitedBy: authUser.userId, createdAt: Date.now() };
  await kvSet(`invite:${inviteId}`, invite, { ttl: 7 * 24 * 60 * 60 });
  res.json({ ...invite, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
});

app.get('/invites/:inviteId', async (req, res) => {
  const invite = await kvGet(`invite:${req.params.inviteId}`);
  if (!invite) { res.json({}); return; }
  const ws = await dbGet('workspaces', invite.workspaceId);
  const inviter = await dbGet('users', invite.invitedBy);
  res.json({ ...invite, workspaceName: ws?.name || 'Unknown', workspaceIcon: ws?.icon || '🏠', inviterName: inviter?.name || 'Someone' });
});

app.post('/invites/:inviteId/accept', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const invite = await kvGet(`invite:${req.params.inviteId}`);
  if (!invite) { res.json({ error: 'Invite not found' }); return; }

  // Initialize the members doc if missing so the very first accepted invite on
  // a workspace can't silently skip the member add.
  let membersDoc = await dbGet('ws_members', invite.workspaceId);
  if (!membersDoc) membersDoc = { workspaceId: invite.workspaceId, members: [] };
  if (!Array.isArray(membersDoc.members)) membersDoc.members = [];
  const user = await dbGet('users', authUser.userId);
  if (!membersDoc.members.find(m => m.userId === authUser.userId)) {
    membersDoc.members.push({ userId: authUser.userId, role: invite.role, name: user?.name || '', email: user?.email || '', picture: user?.picture || '', addedAt: Date.now() });
    await dbUpsert('ws_members', invite.workspaceId, membersDoc);
  }

  const userWs = await dbGet('user_workspaces', authUser.userId) || { workspaceIds: [] };
  if (!userWs.workspaceIds.includes(invite.workspaceId)) {
    userWs.workspaceIds.push(invite.workspaceId);
    await dbUpsert('user_workspaces', authUser.userId, userWs);
  }

  res.json({ workspaceId: invite.workspaceId, role: invite.role });
});
