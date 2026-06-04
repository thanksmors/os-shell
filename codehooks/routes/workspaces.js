import { app } from 'codehooks-js';
import { dbGet, dbUpsert, dbInsert, dbDelete, genId } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';

// ─── Workspaces ───────────────────────────────────────────────────────────────

app.get('/workspaces', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const userWs = await dbGet('user_workspaces', authUser.userId);
  const wsIds = userWs?.workspaceIds || [];
  const workspaces = await Promise.all(wsIds.map(async id => {
    const ws = await dbGet('workspaces', id);
    const membersDoc = await dbGet('ws_members', id);
    const me = membersDoc?.members?.find(m => m.userId === authUser.userId);
    return ws ? { ...ws, role: me?.role || 'member' } : null;
  }));
  res.json(workspaces.filter(Boolean));
});

app.post('/workspaces', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const workspaceId = genId('ws');
  const user = await dbGet('users', authUser.userId);
  const ws = { workspaceId, name: req.body.name || 'New Workspace', icon: req.body.icon || '🏢', ownerId: authUser.userId, createdAt: Date.now() };
  await dbInsert('workspaces', { appId: workspaceId, ...ws });

  const membersDoc = { workspaceId, members: [{ userId: authUser.userId, role: 'owner', name: user?.name || '', email: user?.email || '', picture: user?.picture || '', addedAt: Date.now() }] };
  await dbUpsert('ws_members', workspaceId, membersDoc);

  const userWs = await dbGet('user_workspaces', authUser.userId) || { workspaceIds: [] };
  userWs.workspaceIds = [...(userWs.workspaceIds || []), workspaceId];
  await dbUpsert('user_workspaces', authUser.userId, userWs);

  res.json({ ...ws, role: 'owner' });
});

app.put('/workspaces/:workspaceId', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId } = req.params;
  const membersDoc = await dbGet('ws_members', workspaceId);
  const me = membersDoc?.members?.find(m => m.userId === authUser.userId);
  if (!me || !['owner', 'admin'].includes(me.role)) { res.json({ error: 'Insufficient permissions' }); return; }

  const ws = await dbGet('workspaces', workspaceId);
  if (!ws) { res.json({}); return; }

  const updated = { ...ws };
  if (req.body.name) updated.name = req.body.name;
  if (req.body.icon) updated.icon = req.body.icon;
  await dbUpsert('workspaces', workspaceId, updated);
  res.json(updated);
});

app.delete('/workspaces/:workspaceId', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId } = req.params;
  const ws = await dbGet('workspaces', workspaceId);
  if (!ws) { res.json({ error: 'Not found' }); return; }
  if (ws.ownerId !== authUser.userId) { res.json({ error: 'Only the owner can delete a workspace' }); return; }

  // Remove workspace from every member's user_workspaces list
  const membersDoc = await dbGet('ws_members', workspaceId);
  if (membersDoc?.members) {
    await Promise.all(membersDoc.members.map(async m => {
      const userWs = await dbGet('user_workspaces', m.userId);
      if (userWs) {
        userWs.workspaceIds = (userWs.workspaceIds || []).filter(id => id !== workspaceId);
        await dbUpsert('user_workspaces', m.userId, userWs);
      }
    }));
  }

  await dbDelete('workspaces', workspaceId);
  await dbDelete('ws_members', workspaceId);
  await dbDelete('ws_instances', workspaceId);
  res.json({ ok: true });
});
