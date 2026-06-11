import { app } from 'codehooks-js';
import { dbGet } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';

// Temporary debug endpoint — shows raw DB state for the calling user.
app.get('/debug/me', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

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

  res.json({ userId, user, workspaces });
});
