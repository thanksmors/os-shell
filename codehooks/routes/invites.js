import { app } from 'codehooks-js';
import { dbGet, dbUpsert, dbInsert, genId } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';

// ─── Invites ──────────────────────────────────────────────────────────────────

app.post('/workspaces/:workspaceId/invites', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId } = req.params;
  const membersDoc = await dbGet('ws_members', workspaceId);
  const me = membersDoc?.members?.find(m => m.userId === authUser.userId);
  if (!me || !['owner', 'admin'].includes(me.role)) { res.json({ error: 'Insufficient permissions' }); return; }

  const inviteId = genId('inv');
  const invite = { appId: inviteId, inviteId, workspaceId, role: req.body.role || 'member', invitedBy: authUser.userId, createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  await dbInsert('invites', invite);
  res.json(invite);
});

app.get('/invites/:inviteId', async (req, res) => {
  const invite = await dbGet('invites', req.params.inviteId);
  if (!invite) { res.json({}); return; }
  const ws = await dbGet('workspaces', invite.workspaceId);
  const inviter = await dbGet('users', invite.invitedBy);
  res.json({ ...invite, workspaceName: ws?.name || 'Unknown', workspaceIcon: ws?.icon || '🏠', inviterName: inviter?.name || 'Someone' });
});

app.post('/invites/:inviteId/accept', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const invite = await dbGet('invites', req.params.inviteId);
  if (!invite) { res.json({ error: 'Invite not found' }); return; }
  if (invite.expiresAt < Date.now()) { res.json({ error: 'Invite expired' }); return; }

  const membersDoc = await dbGet('ws_members', invite.workspaceId);
  const user = await dbGet('users', authUser.userId);
  if (membersDoc && !membersDoc.members?.find(m => m.userId === authUser.userId)) {
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
