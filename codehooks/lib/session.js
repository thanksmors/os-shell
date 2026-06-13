import { GOOGLE_CLIENT_ID } from './config.js';
import { dbGet, dbUpsert, dbInsert, genId, kvSet, kvGet } from './db.js';

// ─── Session auth ─────────────────────────────────────────────────────────────
// Sessions stored in KV with 30-day TTL — expired entries auto-delete.

export async function getSessionUser(req) {
  const sessionToken = req.query?.session;
  if (!sessionToken) return null;
  const session = await kvGet(`session:${sessionToken}`);
  if (!session || !session.userId) return null;
  return { userId: session.userId };
}

export function sendUnauth(res) {
  res.status(401);
  res.json({ error: 'Unauthorized' });
}

// Given a verified Google profile (gData from tokeninfo), upsert the user, mint
// a 30-day session, and auto-create a Personal workspace on first sign-in.
// Returns the session payload the frontend needs.
export async function bootstrapSession(gData) {
  const { sub: userId, email, name, picture } = gData;

  await dbUpsert('users', userId, { userId, email, name: name || email, picture: picture || '' });

  const sessionToken = genId('sess');
  await kvSet(`session:${sessionToken}`, { sessionToken, userId }, { ttl: 30 * 24 * 60 * 60 * 1000 });

  const userWs = await dbGet('user_workspaces', userId) || { workspaceIds: [] };
  if (!userWs.workspaceIds?.length) {
    try {
      const workspaceId = genId('ws');
      await dbInsert('workspaces', { appId: workspaceId, workspaceId, name: 'My Workspace', icon: '🏢', ownerId: userId, createdAt: Date.now() });
      const membersDoc = { workspaceId, members: [{ userId, role: 'owner', name: name || email, email, picture: picture || '', addedAt: Date.now() }] };
      await dbUpsert('ws_members', workspaceId, membersDoc);
      await dbUpsert('user_workspaces', userId, { userId, workspaceIds: [workspaceId] });
    } catch(e) {
      console.error('[bootstrapSession] auto-workspace creation failed for', userId, e);
      // Non-fatal: user will see an empty workspace list and can create one manually.
    }
  }

  return { sessionToken, userId, name: name || email, email, picture: picture || '' };
}

// Verify a Google ID token and confirm it was issued for our client.
export async function verifyGoogleIdToken(idToken) {
  const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
  const gData = await gRes.json().catch(() => null);
  if (!gData || gData.error || gData.aud !== GOOGLE_CLIENT_ID) return null;
  return gData;
}
