import { getData, setData } from '/shell/api.js';

const COLLECTION = 'data';
const KEY = 'collections';

const _listeners = new Set();

function _notify() {
  _listeners.forEach(cb => cb());
}

async function _all() {
  return (await getData(COLLECTION, KEY)) || {};
}

async function _save(all) {
  await setData(COLLECTION, KEY, all);
  _notify();
}

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getCollections() {
  return _all();
}

export async function getCollection(name) {
  const all = await _all();
  return all[name] || null;
}

// ─── Collection CRUD ───────────────────────────────────────────────────────

export async function createCollection(name) {
  const all = await _all();
  if (all[name]) return;
  all[name] = { items: [] };
  await _save(all);
}

export async function deleteCollection(name) {
  const all = await _all();
  delete all[name];
  await _save(all);
}

export async function renameCollection(oldName, newName) {
  if (!newName || oldName === newName) return;
  const all = await _all();
  if (!all[oldName]) return;
  all[newName] = all[oldName];
  delete all[oldName];
  await _save(all);
}

// ─── Item CRUD ─────────────────────────────────────────────────────────────

export async function addItem(collectionName, item) {
  const all = await _all();
  if (!all[collectionName]) all[collectionName] = { items: [] };
  const newItem = { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, ...item };
  all[collectionName] = { ...all[collectionName], items: [...all[collectionName].items, newItem] };
  await _save(all);
  return newItem;
}

export async function updateItem(collectionName, id, patch) {
  const all = await _all();
  if (!all[collectionName]) return;
  all[collectionName] = {
    ...all[collectionName],
    items: all[collectionName].items.map(i => i.id === id ? { ...i, ...patch } : i),
  };
  await _save(all);
}

export async function deleteItem(collectionName, id) {
  const all = await _all();
  if (!all[collectionName]) return;
  all[collectionName] = {
    ...all[collectionName],
    items: all[collectionName].items.filter(i => i.id !== id),
  };
  await _save(all);
}

export async function reorderItems(collectionName, ids) {
  const all = await _all();
  if (!all[collectionName]) return;
  const map = Object.fromEntries(all[collectionName].items.map(i => [i.id, i]));
  all[collectionName] = { ...all[collectionName], items: ids.map(id => map[id]).filter(Boolean) };
  await _save(all);
}

// ─── Live updates (in-page) ────────────────────────────────────────────────

export function subscribeCollections(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
