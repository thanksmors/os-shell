import { dbGet, dbUpsert } from './db.js';

// ─── Effective role resolution ────────────────────────────────────────────────
// `workspaces.ownerId` is the authoritative record of who owns a workspace (kept
// in sync on ownership transfer). The per-member `ws_members` role can drift out
// of sync, which would otherwise lock the true owner out of owner-only actions.
// Always treat the recorded owner as 'owner' regardless of the members doc.

export function effectiveRole(ws, membersDoc, userId) {
  if (ws && ws.ownerId === userId) return 'owner';
  const me = membersDoc?.members?.find(m => m.userId === userId);
  return me?.role || null;
}

// If the caller owns the workspace but their members-doc role disagrees, repair
// the members doc so the two records stay consistent. Returns the (possibly
// updated) members doc.
export async function healOwnerRole(workspaceId, ws, membersDoc, userId) {
  if (!ws || ws.ownerId !== userId || !membersDoc?.members) return membersDoc;
  const me = membersDoc.members.find(m => m.userId === userId);
  if (!me || me.role === 'owner') return membersDoc;
  const healed = {
    ...membersDoc,
    members: membersDoc.members.map(m => m.userId === userId ? { ...m, role: 'owner' } : m),
  };
  await dbUpsert('ws_members', workspaceId, healed);
  return healed;
}
