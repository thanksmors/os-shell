import { datastore } from 'codehooks-js';

// ─── Changes feed helper ──────────────────────────────────────────────────────

export async function recordChange(workspaceId, collection, id) {
  try {
    const db = await datastore.open();
    const key = `changes:${workspaceId}`;
    const feed = (await db.get(key).catch(() => null)) || {};
    feed[`${collection}:${id}`] = Date.now();
    await db.set(key, feed);
  } catch {}
}
