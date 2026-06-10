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

// Session-level negative cache: keys confirmed absent on the backend.
// Without it, every open of a window with no saved data repeats the
// backend round-trip just to learn "nothing there" again.
const _missCache = new Set();

export async function getData(collection, id) {
  if (!useBackend()) return lsGet(collection, id);
  const cached = lsGet(collection, id);
  if (cached != null) return cached;
  const key = lsKey(collection, id);
  if (_missCache.has(key)) return null;
  try {
    const r = await fetch(url(collection, id), { headers: headers() });
    if (r.ok) {
      const json = await safeJson(r);
      if (json != null && Object.keys(json).length > 0) {
        lsSet(collection, id, json);
        return json;
      }
      _missCache.add(key);
    }
  } catch {}
  return null;
}

export async function setData(collection, id, data) {
  _missCache.delete(lsKey(collection, id));
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

export async function deleteData(collection, id) {
  _missCache.add(lsKey(collection, id));
  lsDel(collection, id);
  if (!useBackend()) return;
  try {
    await fetch(url(collection, id), { method: 'DELETE', headers: headers() });
  } catch {}
}

// Like getData but always bypasses the localStorage cache — use for polling.
export async function forceGetData(collection, id) {
  lsDel(collection, id);
  _missCache.delete(lsKey(collection, id));
  return getData(collection, id);
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
        _missCache.delete(lsKey(collection, id));
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

// ─── AI module generation (async job + polling) ───────────────────────────────
// The backend runs generation in a background worker (no 30s limit). We start a
// job, get a jobId, then poll until it's done/errored or we hit the cap.

export async function generateModule(prompt) {
  return aiRequest('build', { messages: [{ role: 'user', content: prompt }] });
}

// mode: 'clarify' | 'plan' | 'build' | 'revise'
// payload: { messages, plan, existing } — see codehooks/routes/ai.js
export async function aiRequest(mode, payload = {}) {
  if (!useBackend() || !_workspaceId || !_session) {
    throw new Error('Backend required for AI generation — please log in first.');
  }
  const auth = `apikey=${API_KEY}&session=${encodeURIComponent(_session)}`;

  // 1. Start the job. The backend runs the model synchronously (up to 55s) and
  // writes the result to ai_jobs before returning, so this request blocks for the
  // full generation. Allow 65s before giving up (55s server budget + overhead).
  const startUrl = `${BACKEND_URL}/w/${_workspaceId}/ai-generate?${auth}`;
  const ac = new AbortController();
  const startTimeout = setTimeout(() => ac.abort(), 65000);
  let startRes;
  try {
    startRes = await fetch(startUrl, {
      signal: ac.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...payload }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Generation did not finish within 65s — try a simpler prompt or retry.');
    throw err;
  } finally {
    clearTimeout(startTimeout);
  }
  if (!startRes.ok) {
    const raw = await startRes.text().catch(() => '');
    let detail = raw.slice(0, 300);
    try { const j = JSON.parse(raw); detail = j.error || JSON.stringify(j); } catch {}
    throw new Error(`Server error ${startRes.status}${detail ? ': ' + detail : ''}`);
  }
  const startData = await startRes.json().catch(() => ({}));
  if (startData.error) throw new Error(startData.error);
  if (!startData.jobId) throw new Error('Server did not return a job id');

  // 2. Poll for the result
  const pollUrl = `${BACKEND_URL}/w/${_workspaceId}/ai-job?job=${encodeURIComponent(startData.jobId)}&${auth}`;
  const deadline = Date.now() + 120000; // 2 min cap
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    let data;
    try {
      const pr = await fetch(pollUrl);
      data = await pr.json();
    } catch { continue; } // transient network hiccup — keep polling
    if (data.status === 'done') return data.module;
    if (data.status === 'error') {
      const msg = data.raw ? `${data.error || 'Generation failed'} — raw: ${data.raw}` : (data.error || 'Generation failed');
      throw new Error(msg);
    }
    // 'pending' or 'unknown' — keep waiting
  }
  throw new Error('Generation timed out after 2 minutes. Try a simpler prompt.');
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
