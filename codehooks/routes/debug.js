import { app, datastore } from 'codehooks-js';
import { dbGet } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';

// Bumped on every debug change. Hit /debug/version after a deploy to confirm the
// new code actually landed. If this number is stale, the deploy didn't ship it.
const DEBUG_BUILD = 5;

app.get('/debug/version', async (req, res) => {
  res.json({ build: DEBUG_BUILD });
});

// Temporary debug endpoint — shows raw DB state for the calling user.
app.get('/debug/me', async (req, res) => {
  // Dump the raw session record so we can see exactly what's stored (and whether
  // it actually carries a userId). This is the root-cause check.
  const sessionToken = req.query?.session;
  const db = await datastore.open();
  const rawSession = sessionToken
    ? await db.get(`session:${sessionToken}`).catch(() => null)
    : null;

  const authUser = await getSessionUser(req);
  if (!authUser) { res.json({ error: 'no session', rawSession }); return; }

  const { userId } = authUser;
  const user = await dbGet('users', userId);
  const userWs = await dbGet('user_workspaces', userId);
  const wsIds = userWs?.workspaceIds || [];

  const workspaces = await Promise.all(wsIds.map(async wsId => {
    const ws = await dbGet('workspaces', wsId);
    const membersDoc = await dbGet('ws_members', wsId);
    const me = membersDoc?.members?.find(m => m.userId === userId);
    return {
      wsId,
      wsName: ws?.name,
      ownerId: ws?.ownerId,
      ownerIdMatchesMe: ws?.ownerId === userId,
      myMembersDocRole: me?.role || null,
      memberCount: membersDoc?.members?.length || 0,
    };
  }));

  res.json({ build: DEBUG_BUILD, resolvedUserId: userId, rawSession, user, workspaces });
});
