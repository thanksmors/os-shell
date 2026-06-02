import { BACKEND_URL, API_KEY } from './config.js';

const useBackend = () => Boolean(BACKEND_URL);

function lsKey(collection, id) {
  return `os:${collection}:${id}`;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-apikey': API_KEY } : {}),
  };
}

// ─── Generic CRUD ──────────────────────────────────────────────────────────

async function safeJson(r) {
  const text = await r.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function getData(collection, id) {
  if (!useBackend()) {
    const raw = localStorage.getItem(lsKey(collection, id));
    return raw ? JSON.parse(raw) : null;
  }
  try {
    const r = await fetch(`${BACKEND_URL}/${collection}/${encodeURIComponent(id)}`, { headers: headers() });
    if (!r.ok) return null;
    return safeJson(r);
  } catch { return null; }
}

export async function setData(collection, id, data) {
  if (!useBackend()) {
    localStorage.setItem(lsKey(collection, id), JSON.stringify(data));
    return data;
  }
  try {
    const r = await fetch(`${BACKEND_URL}/${collection}/${encodeURIComponent(id)}`, {
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
  return data || { name: 'My List', items: [] };
}

export async function saveList(appId, list) {
  return setData('lists', appId, list);
}

// ─── Board helpers ─────────────────────────────────────────────────────────

export async function getBoard(appId) {
  const data = await getData('boards', appId);
  return data || {
    name: 'My Board',
    columns: [
      { id: 'col-1', name: 'To Do' },
      { id: 'col-2', name: 'In Progress' },
      { id: 'col-3', name: 'Done' },
    ],
    cards: [],
  };
}

export async function saveBoard(appId, board) {
  return setData('boards', appId, board);
}

// ─── Gantt helpers ──────────────────────────────────────────────────────────

export async function getGantt(appId) {
  const data = await getData('gantt', appId);
  return data || { name: 'My Projects', viewMonths: 12, projects: [] };
}

export async function saveGantt(appId, gantt) {
  return setData('gantt', appId, gantt);
}

// ─── Instance registry ─────────────────────────────────────────────────────

export async function getInstances() {
  const data = await getData('meta', 'instances');
  return data?.list || [];
}

export async function saveInstances(list) {
  return setData('meta', 'instances', { list });
}
