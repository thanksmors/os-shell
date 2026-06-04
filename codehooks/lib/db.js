import { datastore } from 'codehooks-js';

// ─── Datastore helpers ────────────────────────────────────────────────────────

export async function dbGet(collection, appId) {
  const db = await datastore.open();
  return db.getOne(collection, { appId }).catch(() => null);
}

export async function dbUpsert(collection, appId, record) {
  const db = await datastore.open();
  const existing = await db.getOne(collection, { appId }).catch(() => null);
  const doc = { ...record, appId };
  if (existing) { await db.updateOne(collection, { appId }, doc); }
  else { await db.insertOne(collection, doc); }
  return doc;
}

export async function dbInsert(collection, record) {
  const db = await datastore.open();
  return db.insertOne(collection, record);
}

export async function dbDelete(collection, appId) {
  const db = await datastore.open();
  return db.removeOne(collection, { appId }).catch(() => null);
}

export function genId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
