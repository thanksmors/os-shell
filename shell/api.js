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

export async function getData(collection, id) {
  if (!useBackend()) return lsGet(collection, id);
  const cached = lsGet(collection, id);
  if (cached != null) return cached;
  try {
    const r = await fetch(url(collection, id), { headers: headers() });
    if (r.ok) {
      const json = await safeJson(r);
      // Backend returns {} when nothing found — treat as null
      if (json != null && Object.keys(json).length > 0) {
        lsSet(collection, id, json);
        return json;
      }
    }
  } catch {}
  return null;
}

export async function setData(collection, id, data) {
  // Always write the local cache first — instant + survives network failures.
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
    // One-time migration: push localStorage instances to backend if backend is empty
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
