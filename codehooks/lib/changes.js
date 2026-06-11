import { kvGet, kvSet } from './db.js';

// ─── Changes feed helper ──────────────────────────────────────────────────────

export async function recordChange(workspaceId, collection, id) {
  try {
    const key = `changes:${workspaceId}`;
    const feed = (await kvGet(key)) || {};
    feed[`${collection}:${id}`] = Date.now();
    await kvSet(key, feed);
  } catch {}
}
