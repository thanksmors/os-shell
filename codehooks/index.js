import { app, datastore } from 'codehooks-js';

const GOOGLE_CLIENT_ID = '424699749757-82n32i85givjhrlnoqgisjc85sk530mk.apps.googleusercontent.com';

// ─── Datastore helpers ────────────────────────────────────────────────────────

async function dbGet(collection, appId) {
  const db = await datastore.open();
  return db.getOne(collection, { appId }).catch(() => null);
}

async function dbUpsert(collection, appId, record) {
  const db = await datastore.open();
  const existing = await db.getOne(collection, { appId }).catch(() => null);
  const doc = { ...record, appId };
  if (existing) { await db.updateOne(collection, { appId }, doc); }
  else { await db.insertOne(collection, doc); }
  return doc;
}

async function dbInsert(collection, record) {
  const db = await datastore.open();
  return db.insertOne(collection, record);
}

async function dbDelete(collection, appId) {
  const db = await datastore.open();
  return db.removeOne(collection, { appId }).catch(() => null);
}

function genId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Session auth ─────────────────────────────────────────────────────────────
// All user-facing routes validate a session token from ?session= query param.
// Sessions are stored in the datastore and expire after 30 days.

async function getSessionUser(req) {
  const sessionToken = req.query?.session;
  if (!sessionToken) return null;
  const session = await dbGet('sessions', sessionToken);
  if (!session || session.expiresAt < Date.now()) return null;
  return { userId: session.userId };
}

function sendUnauth(res) {
  res.status(401);
  res.json({ error: 'Unauthorized' });
}

// ─── Changes feed helper ──────────────────────────────────────────────────────

async function recordChange(workspaceId, collection, id) {
  try {
    const key = `ws:${workspaceId}:changes`;
    const feed = await dbGet('_changes', key) || { changes: {} };
    feed.changes[`${collection}:${id}`] = Date.now();
    await dbUpsert('_changes', key, feed);
  } catch {}
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// POST /auth/me
// Body: { idToken } — Google ID token from the browser's Google Identity Services
// Returns: { sessionToken, userId, name, email, picture }
app.post('/auth/me', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) { res.status(400); res.json({ error: 'Missing idToken' }); return; }

  // Verify with Google tokeninfo endpoint
  const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
  const gData = await gRes.json().catch(() => null);
  if (!gData || gData.error || gData.aud !== GOOGLE_CLIENT_ID) {
    res.status(401); res.json({ error: 'Invalid token' }); return;
  }

  const { sub: userId, email, name, picture } = gData;

  // Create/update user
  await dbUpsert('users', userId, { userId, email, name: name || email, picture: picture || '' });

  // Create session (30 days)
  const sessionToken = genId('sess');
  await dbInsert('sessions', {
    appId: sessionToken,
    sessionToken,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  // Auto-create Personal workspace if user has none
  const userWs = await dbGet('user_workspaces', userId) || { workspaceIds: [] };
  if (!userWs.workspaceIds?.length) {
    const workspaceId = genId('ws');
    await dbInsert('workspaces', { appId: workspaceId, workspaceId, name: 'Personal', icon: '🏠', ownerId: userId, createdAt: Date.now() });
    const membersDoc = { workspaceId, members: [{ userId, role: 'owner', name: name || email, email, picture: picture || '', addedAt: Date.now() }] };
    await dbUpsert('ws_members', workspaceId, membersDoc);
    await dbUpsert('user_workspaces', userId, { userId, workspaceIds: [workspaceId] });
  }

  res.json({ sessionToken, userId, name: name || email, email, picture: picture || '' });
});

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

  const me = membersDoc.members.find(m => m.userId === authUser.userId);
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

  const me = membersDoc.members.find(m => m.userId === authUser.userId);
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
  if (membersDoc && !membersDoc.members.find(m => m.userId === authUser.userId)) {
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

// ─── Workspace-scoped data routes ────────────────────────────────────────────

app.get('/w/:workspaceId/instances', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const data = await dbGet('ws_instances', req.params.workspaceId);
  res.json(data || {});
});

app.put('/w/:workspaceId/instances', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const record = await dbUpsert('ws_instances', req.params.workspaceId, req.body);
  await recordChange(req.params.workspaceId, 'instances', 'instances');
  res.json(record);
});

app.get('/w/:workspaceId/changes', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const data = await dbGet('_changes', `ws:${req.params.workspaceId}:changes`);
  res.json(data?.changes || {});
});

app.get('/w/:workspaceId/:collection/:id', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const { workspaceId, collection, id } = req.params;
  const db = await datastore.open();
  const data = await db.getOne(collection, { workspaceId, appId: id }).catch(() => null);
  res.json(data || {});
});

app.put('/w/:workspaceId/:collection/:id', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const { workspaceId, collection, id } = req.params;
  const db = await datastore.open();
  const record = { ...req.body, workspaceId, appId: id };
  const existing = await db.getOne(collection, { workspaceId, appId: id }).catch(() => null);
  if (existing) { await db.updateOne(collection, { workspaceId, appId: id }, record); }
  else { await db.insertOne(collection, record); }
  await recordChange(workspaceId, collection, id);
  res.json(record);
});

export default app.init();
