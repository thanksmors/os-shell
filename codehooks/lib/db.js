import { datastore } from 'codehooks-js';

// ─── Datastore helpers ────────────────────────────────────────────────────────

export async function dbGet(collection, appId) {
  const db = await datastore.open();
  return db.getOne(collection, { appId }).catch(() => null);
}

export async function dbUpsert(collection, appId, record) {
  const db = await datastore.open();
  const doc = { ...record, appId };
  await db.updateOne(collection, { appId }, doc, {}, { upsert: true });
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

// ─── Key-value helpers ────────────────────────────────────────────────────────
// The KV store coerces non-string values with String(), so passing an object
// stores the useless literal "[object Object]". Always serialize on write and
// parse on read so KV records (sessions, invites) survive a round-trip.

export async function kvSet(key, value, opts) {
  const db = await datastore.open();
  return db.set(key, JSON.stringify(value), opts);
}

export async function kvGet(key) {
  const db = await datastore.open();
  const raw = await db.get(key).catch(() => null);
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;          // already parsed
  try { return JSON.parse(raw); } catch { return null; } // corrupt/legacy value
}
