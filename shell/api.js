import { BACKEND_URL, API_KEY } from './config.js';

const useBackend = () => Boolean(BACKEND_URL);

// ─── Session + workspace context ──────────────────────────────────────────────
// Set by auth store after login + workspace selection.

let _session = null;
let _workspaceId = null;

export function setSession(token) { _session = token; }
export function setWorkspace(wsId) { _workspaceId = wsId; }

function lsKey(collection, id) {
  // Namespace by workspaceId when active so different workspaces don't share cache
  const prefix = _workspaceId ? `os:${_workspaceId}:${collection}:${id}` : `os:${collection}:${id}`;
  return prefix;
}

function headers() {
  return { 'Content-Type': 'application/json' };
}

function url(collection, id) {
  // When workspace is active, use workspace-scoped routes with session auth.
  // Fall back to legacy API-key-only routes (dev/offline mode).
  if (_workspaceId && _session) {
    if (collection === 'meta' && id === 'instances') {
      return `${BACKEND_URL}/w/${_workspaceId}/instances?apikey=${API_KEY}&session=${encodeURIComponent(_session)}`;
    }
    return `${BACKEND_URL}/w/${_workspaceId}/${collection}/${encodeURIComponent(id)}?apikey=${API_KEY}&session=${encodeURIComponent(_session)}`;
  }
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

const _subscribers = new Map(); // "collection:id" → Set<callback>
let _lastSeen = {};
let _initialized = false;
let _pollTimer = null;
let _polling = false;

async function _poll() {
  if (_polling) return;
  _polling = true;
  if (!_workspaceId || !_session) return;
  try {
    const changesUrl = `${BACKEND_URL}/w/${_workspaceId}/changes?apikey=${API_KEY}&session=${encodeURIComponent(_session)}`;
    const r = await fetch(changesUrl);
    if (!r.ok) return;
    const changes = await safeJson(r);
    if (!changes || typeof changes !== 'object') return;

    if (!_initialized) {
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
  _polling = false;
}

function _startPolling() {
  if (_pollTimer || !useBackend()) return;
  _poll();
  _pollTimer = setInterval(_poll, 5 * 60 * 1000);
}

export function resetPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  _initialized = false;
  _lastSeen = {};
  _startPolling();
}

export function subscribe(collection, id, callback) {
  if (!useBackend()) return () => {};
  const key = `${collection}:${id}`;
  if (!_subscribers.has(key)) _subscribers.set(key, new Set());
  _subscribers.get(key).add(callback);
  _startPolling();
  return () => _subscribers.get(key)?.delete(callback);
}

// ─── AI module generation ──────────────────────────────────────────────────

export async function generateModule(prompt) {
  if (!useBackend() || !_workspaceId || !_session) {
    throw new Error('Backend required for AI generation — please log in first.');
  }
  const genUrl = `${BACKEND_URL}/w/${_workspaceId}/ai-generate?apikey=${API_KEY}&session=${encodeURIComponent(_session)}`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 35000);
  try {
    const r = await fetch(genUrl, {
      signal: ac.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!r.ok) {
      const raw = await r.text().catch(() => '');
      let detail = raw.slice(0, 300);
      try { const j = JSON.parse(raw); detail = j.error || JSON.stringify(j); } catch {}
      throw new Error(`Server error ${r.status}${detail ? ': ' + detail : ''}`);
    }
    return r.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('No response from server after 35s — try again or redeploy the backend.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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

// ─── Tier List helpers ─────────────────────────────────────────────────────

const DEFAULT_TIERS = [
  { id: 'tier-s', label: 'S', color: '#ff7f7f' },
  { id: 'tier-a', label: 'A', color: '#ffbf7f' },
  { id: 'tier-b', label: 'B', color: '#ffdf7f' },
  { id: 'tier-c', label: 'C', color: '#ffff7f' },
  { id: 'tier-d', label: 'D', color: '#7fff7f' },
  { id: 'tier-e', label: 'E', color: '#7fbfff' },
  { id: 'tier-f', label: 'F', color: '#ff7fff' },
];

export async function getTierList(id) {
  const data = await getData('tierlists', id);
  if (!data || typeof data !== 'object') return { name: 'New Tier List', tiers: DEFAULT_TIERS, cards: [] };
  if (!Array.isArray(data.tiers)) data.tiers = DEFAULT_TIERS;
  if (!Array.isArray(data.cards)) data.cards = [];
  if (typeof data.name !== 'string') data.name = 'New Tier List';
  return data;
}

export async function saveTierList(id, data) {
  return setData('tierlists', id, data);
}

// ─── Instance registry ─────────────────────────────────────────────────────

export async function getInstances() {
  if (useBackend() && _workspaceId && _session) {
    const data = await getData('meta', 'instances');
    return data?.list || [];
  }
  const data = await getData('meta', 'instances');
  return data?.list || [];
}

export async function saveInstances(list) {
  return setData('meta', 'instances', { list });
}
