import { BACKEND_URL, API_KEY } from './config.js';

const useBackend = () => Boolean(BACKEND_URL);

function lsKey(collection, id) {
  return `os:${collection}:${id}`;
}

function headers() {
  return { 'Content-Type': 'application/json' };
}

function url(collection, id) {
  const base = `${BACKEND_URL}/${collection}/${encodeURIComponent(id)}`;
  return API_KEY ? `${base}?apikey=${API_KEY}` : base;
}

// ─── Generic CRUD ──────────────────────────────────────────────────────────

async function safeJson(r) {
  const text = await r.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function lsGet(collection, id) {
  const raw = localStorage.getItem(lsKey(collection, id));
  return raw ? JSON.parse(raw) : null;
}

function lsSet(collection, id, data) {
  try { localStorage.setItem(lsKey(collection, id), JSON.stringify(data)); } catch {}
}

function lsDel(collection, id) {
  try { localStorage.removeItem(lsKey(collection, id)); } catch {}
}

export async function getData(collection, id) {
  if (!useBackend()) return lsGet(collection, id);
  const cached = lsGet(collection, id);
  if (cached != null) return cached;
  try {
    const r = await fetch(url(collection, id), { headers: headers() });
    if (r.ok) {
      const json = await safeJson(r);
      if (json != null && Object.keys(json).length > 0) {
        lsSet(collection, id, json);
        return json;
      }
    }
  } catch {}
  return null;
}

export async function setData(collection, id, data) {
  lsSet(collection, id, data);
  if (!useBackend()) return data;
  try {
    const r = await fetch(url(collection, id), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    });
    return await safeJson(r) ?? data;
  } catch { return data; }
}

// ─── Cross-client sync (polling) ───────────────────────────────────────────
// One GET /changes request every 5 minutes regardless of how many modules are
// open. On a changed timestamp, invalidates the local cache for that key and
// calls all registered subscriber callbacks so open modules re-fetch.

const _subscribers = new Map(); // "collection:id" → Set<callback>
let _lastSeen = {};             // "collection:id" → last known timestamp
let _initialized = false;
let _pollTimer = null;

async function _poll() {
  try {
    const changesUrl = API_KEY
      ? `${BACKEND_URL}/changes?apikey=${API_KEY}`
      : `${BACKEND_URL}/changes`;
    const r = await fetch(changesUrl);
    if (!r.ok) return;
    const changes = await safeJson(r);
    if (!changes || typeof changes !== 'object') return;

    if (!_initialized) {
      // First poll: record current state so we don't fire stale callbacks.
      _lastSeen = { ...changes };
      _initialized = true;
      return;
    }

    for (const [key, ts] of Object.entries(changes)) {
      if (ts > (_lastSeen[key] || 0)) {
        _lastSeen[key] = ts;
        const colonIdx = key.indexOf(':');
        const collection = key.slice(0, colonIdx);
        const id = key.slice(colonIdx + 1);
        lsDel(collection, id);
        _subscribers.get(key)?.forEach(cb => cb());
      }
    }
  } catch {}
}

function _startPolling() {
  if (_pollTimer || !useBackend()) return;
  _poll(); // immediate first poll to seed _lastSeen
  _pollTimer = setInterval(_poll, 5 * 60 * 1000); // every 5 minutes
}

// Subscribe to changes for a specific collection + id.
// Returns an unsubscribe function — call it in disconnectedCallback.
export function subscribe(collection, id, callback) {
  if (!useBackend()) return () => {};
  const key = `${collection}:${id}`;
  if (!_subscribers.has(key)) _subscribers.set(key, new Set());
  _subscribers.get(key).add(callback);
  _startPolling();
  return () => _subscribers.get(key)?.delete(callback);
}

// ─── List helpers ──────────────────────────────────────────────────────────

export async function getList(appId) {
  const data = await getData('lists', appId);
  if (!data || typeof data !== 'object') return { name: 'My List', items: [], fields: [] };
  if (!Array.isArray(data.items)) data.items = [];
  if (!Array.isArray(data.fields)) data.fields = [];
  if (typeof data.name !== 'string') data.name = 'My List';
  return data;
}

export async function saveList(appId, list) {
  return setData('lists', appId, list);
}

// ─── Board helpers ─────────────────────────────────────────────────────────

export async function getBoard(appId) {
  const defaults = {
    name: 'My Board',
    columns: [
      { id: 'col-1', name: 'To Do' },
      { id: 'col-2', name: 'In Progress' },
      { id: 'col-3', name: 'Done' },
    ],
    cards: [],
  };
  const data = await getData('boards', appId);
  if (!data || typeof data !== 'object') return defaults;
  if (!Array.isArray(data.columns)) data.columns = defaults.columns;
  if (!Array.isArray(data.cards)) data.cards = [];
  if (typeof data.name !== 'string') data.name = 'My Board';
  return data;
}

export async function saveBoard(appId, board) {
  return setData('boards', appId, board);
}

// ─── Gantt helpers ──────────────────────────────────────────────────────────

export async function getGantt(appId) {
  const data = await getData('gantt', appId);
  if (!data || typeof data !== 'object') return { name: 'My Projects', viewMonths: 12, projects: [] };
  if (!Array.isArray(data.projects)) data.projects = [];
  if (typeof data.name !== 'string') data.name = 'My Projects';
  if (typeof data.viewMonths !== 'number') data.viewMonths = 12;
  return data;
}

export async function saveGantt(appId, gantt) {
  return setData('gantt', appId, gantt);
}

// ─── Instance registry ─────────────────────────────────────────────────────

export async function getInstances() {
  if (useBackend()) {
    let data = await getData('meta', 'instances');
    if (!data?.list?.length) {
      const raw = localStorage.getItem('os:meta:instances');
      if (raw) {
        try {
          const local = JSON.parse(raw);
          if (local?.list?.length) {
            await setData('meta', 'instances', local);
            return local.list;
          }
        } catch {}
      }
    }
    return data?.list || [];
  }
  const data = await getData('meta', 'instances');
  return data?.list || [];
}

export async function saveInstances(list) {
  return setData('meta', 'instances', { list });
}
