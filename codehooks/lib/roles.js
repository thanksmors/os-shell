import { dbGet, dbUpsert } from './db.js';

// ─── Effective role resolution ────────────────────────────────────────────────
// `workspaces.ownerId` is the authoritative record of who owns a workspace (kept
// in sync on ownership transfer). The per-member `ws_members` role can drift out
// of sync, which would otherwise lock the true owner out of owner-only actions.
// Always treat the recorded owner as 'owner' regardless of the members doc.

export function effectiveRole(ws, membersDoc, userId) {
  if (ws && ws.ownerId === userId) return 'owner';
  // Fallback: a workspace with no recorded owner whose only member is this user
  // — a lone member can never be locked out of their own workspace.
  if (ws && !ws.ownerId && membersDoc?.members?.length === 1
      && membersDoc.members[0].userId === userId) return 'owner';
  const me = membersDoc?.members?.find(m => m.userId === userId);
  return me?.role || null;
}

// Repair drift so the authoritative owner regains the owner role everywhere.
// Covers two cases:
//   1. ws.ownerId === user but their members-doc role disagrees → fix members doc
//   2. ws has no ownerId and user is the sole member → claim ownership
//      (writes ownerId on the workspace AND owner role in the members doc)
// Returns the (possibly updated) members doc.
export async function healOwnerRole(workspaceId, ws, membersDoc, userId) {
  if (!ws || !membersDoc?.members) return membersDoc;

  const isRecordedOwner = ws.ownerId === userId;
  const isSoleOrphan = !ws.ownerId
    && membersDoc.members.length === 1
    && membersDoc.members[0].userId === userId;
  if (!isRecordedOwner && !isSoleOrphan) return membersDoc;

  // Persist ownerId on the workspace if it was missing.
  if (isSoleOrphan) {
    await dbUpsert('workspaces', workspaceId, { ...ws, ownerId: userId });
  }

  const me = membersDoc.members.find(m => m.userId === userId);
  if (me && me.role === 'owner') return membersDoc;

  const healed = {
    ...membersDoc,
    members: membersDoc.members.map(m => m.userId === userId ? { ...m, role: 'owner' } : m),
  };
  await dbUpsert('ws_members', workspaceId, healed);
  return healed;
}
