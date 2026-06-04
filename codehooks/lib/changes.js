import { dbGet, dbUpsert } from './db.js';

// ─── Changes feed helper ──────────────────────────────────────────────────────

export async function recordChange(workspaceId, collection, id) {
  try {
    const key = `ws:${workspaceId}:changes`;
    const feed = await dbGet('_changes', key) || { changes: {} };
    feed.changes[`${collection}:${id}`] = Date.now();
    await dbUpsert('_changes', key, feed);
  } catch {}
}
