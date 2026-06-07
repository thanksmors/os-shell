import { app } from 'codehooks-js';
import { dbGet, dbUpsert } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';

// ─── Members ──────────────────────────────────────────────────────────────────

app.get('/workspaces/:workspaceId/members', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId } = req.params;
  const membersDoc = await dbGet('ws_members', workspaceId);
  if (!membersDoc?.members?.find(m => m.userId === authUser.userId)) {
    res.json({ error: 'Not a member' }); return;
  }
  res.json(membersDoc.members);
});

app.put('/workspaces/:workspaceId/members/:userId', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId, userId } = req.params;
  const membersDoc = await dbGet('ws_members', workspaceId);
  if (!membersDoc) { res.json({ error: 'Workspace not found' }); return; }

  const me = membersDoc?.members?.find(m => m.userId === authUser.userId);
  if (!me || !['owner', 'admin'].includes(me.role)) { res.json({ error: 'Insufficient permissions' }); return; }

  const newRole = req.body.role;
  if (!['owner', 'admin', 'member'].includes(newRole)) { res.json({ error: 'Invalid role' }); return; }
  if (newRole === 'owner' && me.role !== 'owner') { res.json({ error: 'Only owner can transfer ownership' }); return; }

  membersDoc.members = membersDoc.members.map(m => {
    if (m.userId === userId) return { ...m, role: newRole };
    if (newRole === 'owner' && m.userId === authUser.userId) return { ...m, role: 'admin' }; // demote old owner
    return m;
  });

  if (newRole === 'owner') {
    await dbUpsert('workspaces', workspaceId, { ...(await dbGet('workspaces', workspaceId)), ownerId: userId });
  }

  await dbUpsert('ws_members', workspaceId, membersDoc);
  res.json({ ok: true });
});

app.delete('/workspaces/:workspaceId/members/:userId', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId, userId } = req.params;
  const membersDoc = await dbGet('ws_members', workspaceId);
  if (!membersDoc) { res.json({ error: 'Workspace not found' }); return; }

  const me = membersDoc?.members?.find(m => m.userId === authUser.userId);
  const isSelf = userId === authUser.userId;
  if (!isSelf && !['owner', 'admin'].includes(me?.role)) { res.json({ error: 'Insufficient permissions' }); return; }

  membersDoc.members = membersDoc.members.filter(m => m.userId !== userId);
  await dbUpsert('ws_members', workspaceId, membersDoc);

  // Remove workspace from user's list
  const userWs = await dbGet('user_workspaces', userId);
  if (userWs) {
    userWs.workspaceIds = (userWs.workspaceIds || []).filter(id => id !== workspaceId);
    await dbUpsert('user_workspaces', userId, userWs);
  }

  res.json({ ok: true });
});
