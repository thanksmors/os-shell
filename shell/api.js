import { BACKEND_URL, API_KEY } from './config.js';

const useBackend = () => Boolean(BACKEND_URL);

// ─── Session + workspace context ──────────────────────────────────────────────

let _session = null;
let _workspaceId = null;

export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

export function setSession(token) {
  _session = token;
  // Rewrite any queued outbox entries that still carry the old session
  if (token) {
    const q = _loadOutbox();
    if (q.length) { _saveOutbox(q.map(e => ({ ...e, session: token }))); }
  }
}
export function setWorkspace(wsId) { _workspaceId = wsId; }

function lsKey(collection, id) {
  const prefix = _workspaceId ? `os:${_workspaceId}:${collection}:${id}` : `os:${collection}:${id}`;
  return prefix;
}

function headers() {
  return { 'Content-Type': 'application/json' };
}

// Build URL using current globals (for reads)
function url(collection, id) {
  if (_workspaceId && _session) {
    if (collection === 'meta' && id === 'instances') {
      return `${BACKEND_URL}/w/${_workspaceId}/instances?apikey=${API_KEY}&session=${encodeURIComponent(_session)}&client=${CLIENT_ID}`;
    }
    return `${BACKEND_URL}/w/${_workspaceId}/${collection}/${encodeURIComponent(id)}?apikey=${API_KEY}&session=${encodeURIComponent(_session)}&client=${CLIENT_ID}`;
  }
  const base = `${BACKEND_URL}/${collection}/${encodeURIComponent(id)}`;
  return API_KEY ? `${base}?apikey=${API_KEY}&client=${CLIENT_ID}` : base;
}

// Build URL from outbox entry's snapshotted context (for writes)
function _urlFor(entry) {
  const { wsId, session, collection, id } = entry;
  if (wsId && session) {
    if (collection === 'meta' && id === 'instances') {
      return `${BACKEND_URL}/w/${wsId}/instances?apikey=${API_KEY}&session=${encodeURIComponent(session)}&client=${CLIENT_ID}`;
    }
    return `${BACKEND_URL}/w/${wsId}/${collection}/${encodeURIComponent(id)}?apikey=${API_KEY}&session=${encodeURIComponent(session)}&client=${CLIENT_ID}`;
  }
  const base = `${BACKEND_URL}/${collection}/${encodeURIComponent(id)}`;
  return API_KEY ? `${base}?apikey=${API_KEY}&client=${CLIENT_ID}` : base;
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

// setData: writes localStorage immediately, queues network PUT in background.
// Returns instantly — callers get back their data without waiting for the network.
// Stamps _ts on every object payload so the server-side merge can order concurrent writes.
export function setData(collection, id, data) {
  const payload = (data && typeof data === 'object' && !Array.isArray(data))
    ? { ...data, _ts: Date.now() }
    : data;
  _missCache.delete(lsKey(collection, id));
  lsSet(collection, id, payload);
  _enqueue({ op: 'put', collection, id, data: payload });
  return payload;
}

export function deleteData(collection, id) {
  _missCache.add(lsKey(collection, id));
  lsDel(collection, id);
  _enqueue({ op: 'delete', collection, id, data: null });
}

// Like getData but always bypasses the localStorage cache — use when you need
// the freshest server state (e.g. before appending to a shared array).
export async function forceGetData(collection, id) {
  lsDel(collection, id);
  _missCache.delete(lsKey(collection, id));
  return getData(collection, id);
}

// ─── Persistent outbox ────────────────────────────────────────────────────────
// Writes go here first (instant local), then drain to the backend in the
// background. The queue survives page reload (stored in localStorage).
// Coalesces by collection:id — last write wins per key; delete supersedes put.

const OUTBOX_KEY = 'os:outbox';

function _loadOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || []; } catch { return []; }
}

function _saveOutbox(q) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(q)); } catch {}
}

function _enqueue(entry) {
  if (!useBackend()) return;
  const key = `${entry.collection}:${entry.id}`;
  const full = { ...entry, wsId: _workspaceId, session: _session, ts: Date.now() };
  const q = _loadOutbox();
  const i = q.findIndex(e => `${e.collection}:${e.id}` === key);
  if (i >= 0) {
    // Coalesce: replace existing entry for this key (last write wins).
    // A delete always supersedes a pending put.
    if (entry.op === 'delete' || q[i].op !== 'delete') {
      q[i] = full;
    }
  } else {
    q.push(full);
  }
  _saveOutbox(q);
  _flushOutbox();
}

let _flushing = false;
let _backoff = 1000;

async function _flushOutbox() {
  if (_flushing || !useBackend()) return;
  if (!navigator.onLine) return;
  _flushing = true;
  try {
    while (true) {
      const q = _loadOutbox();
      if (!q.length) break;
      const e = q[0];
      if (!e.wsId || !e.session) { // no auth context yet — skip until after login
        const q2 = _loadOutbox(); q2.shift(); _saveOutbox(q2); // drop invalid entry
        continue;
      }
      let r;
      try {
        r = await fetch(_urlFor(e), e.op === 'put'
          ? { method: 'PUT', headers: headers(), body: JSON.stringify(e.data) }
          : { method: 'DELETE', headers: headers() });
      } catch {
        // Network failure — back off and retry later
        setTimeout(_flushOutbox, _backoff = Math.min(_backoff * 2, 60000));
        return;
      }
      if (r.ok || (r.status >= 400 && r.status !== 401 && r.status !== 429)) {
        // Permanent result (success or permanent client error) — drop head
        // only if still the same ts (a newer coalesced write must still be sent)
        const q2 = _loadOutbox();
        if (q2[0]?.ts === e.ts) { q2.shift(); _saveOutbox(q2); }
        _backoff = 1000;
      } else {
        // 401 (session expired) or 429 (rate limit) — back off
        setTimeout(_flushOutbox, _backoff = Math.min(_backoff * 2, 60000));
        return;
      }
    }
  } finally {
    _flushing = false;
  }
}

window.addEventListener('online', () => { _backoff = 1000; _flushOutbox(); });

// ─── Cross-client sync: polling (fallback) + SSE (primary) ────────────────────

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
  _startSSE(); // SSE is the primary path; polling remains as fallback
}

export function resetPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  _initialized = false;
  _lastSeen = {};
  // Close any existing SSE connection (workspace may have changed)
  if (_es) { _es.close(); _es = null; }
  _startPolling();
  _flushOutbox(); // Drain any queued writes from before/during login
}

export function subscribe(collection, id, callback) {
  if (!useBackend()) return () => {};
  const key = `${collection}:${id}`;
  if (!_subscribers.has(key)) _subscribers.set(key, new Set());
  _subscribers.get(key).add(callback);
  _startPolling();
  return () => _subscribers.get(key)?.delete(callback);
}

// ─── SSE (Codehooks Realtime) ─────────────────────────────────────────────────

let _es = null;
let _esBackoff = 2000;

async function _getListenerId() {
  if (!_workspaceId || !_session) return null;
  const cacheKey = `os:${_workspaceId}:sse-listener`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;
  try {
    const r = await fetch(
      `${BACKEND_URL}/w/${_workspaceId}/sse-listener?apikey=${API_KEY}&session=${encodeURIComponent(_session)}`,
      { method: 'POST', headers: headers() }
    );
    if (!r.ok) return null;
    const { listenerId } = await safeJson(r) || {};
    if (listenerId) { localStorage.setItem(cacheKey, listenerId); }
    return listenerId || null;
  } catch { return null; }
}

async function _startSSE() {
  if (_es || !useBackend() || !_workspaceId || !_session) return;
  const listenerId = await _getListenerId();
  if (!listenerId) {
    setTimeout(_startSSE, _esBackoff = Math.min(_esBackoff * 2, 60000));
    return;
  }
  _esBackoff = 2000;
  _es = new EventSource(`${BACKEND_URL}/sync/${listenerId}?apikey=${API_KEY}`);

  _es.onmessage = (ev) => {
    let payload;
    try { payload = JSON.parse(ev.data); } catch { return; }
    // Codehooks wraps published data: { channel, data, query, timestamp }
    const evt = payload?.data ?? payload;
    if (!evt?.collection) return;
    if (evt.workspaceId && evt.workspaceId !== _workspaceId) return;
    if (evt.clientId && evt.clientId === CLIENT_ID) return; // own echo — cache already fresh

    lsDel(evt.collection, evt.id);
    _missCache.delete(lsKey(evt.collection, evt.id));
    // Keep fallback poll from double-firing for this key
    _lastSeen[`${evt.collection}:${evt.id}`] = evt.ts || Date.now();
    _subscribers.get(`${evt.collection}:${evt.id}`)?.forEach(cb => cb());
  };

  _es.onerror = () => {
    // EventSource auto-reconnects on transient errors; only act when CLOSED
    if (_es && _es.readyState === EventSource.CLOSED) {
      _es = null;
      // Drop cached listener id — it may have expired server-side
      localStorage.removeItem(`os:${_workspaceId}:sse-listener`);
      setTimeout(_startSSE, _esBackoff = Math.min(_esBackoff * 2, 60000));
    }
  };
}

// ─── AI module generation ─────────────────────────────────────────────────────

export async function generateModule(prompt) {
  return aiRequest('build', { messages: [{ role: 'user', content: prompt }] });
}

export async function aiRequest(mode, payload = {}, onPhase = null) {
  if (!useBackend() || !_workspaceId || !_session) {
    throw new Error('Backend required for AI generation — please log in first.');
  }
  const auth = `apikey=${API_KEY}&session=${encodeURIComponent(_session)}`;
  const phase = (p) => { try { onPhase && onPhase(p); } catch {} };

  // POST the job. `extra` lets the fallback path re-submit with inline:true.
  const startJob = async (extra = {}) => {
    const startUrl = `${BACKEND_URL}/w/${_workspaceId}/ai-generate?${auth}`;
    const ac = new AbortController();
    const startTimeout = setTimeout(() => ac.abort(), 65000);
    let startRes;
    try {
      startRes = await fetch(startUrl, {
        signal: ac.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...payload, ...extra }),
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
    return startData;
  };

  phase('queued');
  let { jobId } = await startJob();

  // Build/revise run in a backend worker (300s LLM budget). Poll up to 6
  // minutes — job TTL is 10min so results always outlive the poll. If the job
  // never leaves 'pending' (queue worker dead on this plan), fall back once to
  // an inline build on the highspeed model.
  const isBuild = mode === 'build' || mode === 'revise';
  const deadline = Date.now() + 360000;
  const queuedAt = Date.now();
  let sawBuilding = false;
  let usedFallback = false;
  let lastStatus = 'queued';
  let unknownPolls = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    let data;
    try {
      const pr = await fetch(`${BACKEND_URL}/w/${_workspaceId}/ai-job?job=${encodeURIComponent(jobId)}&${auth}`);
      data = await pr.json();
    } catch { continue; }
    if (data.status !== lastStatus) {
      console.debug(`[ai] job ${jobId} status ${lastStatus} → ${data.status} +${Date.now() - queuedAt}ms`);
      lastStatus = data.status;
    }
    // 'unknown' means the job record vanished from KV. The job was created
    // before polling started, so a sustained run of misses is a server-side
    // loss (expiry/KV failure) — fail fast instead of spinning to the deadline.
    unknownPolls = data.status === 'unknown' ? unknownPolls + 1 : 0;
    // For builds, let the 20s inline fallback below try once first.
    if (unknownPolls >= 10 && (!isBuild || usedFallback)) {
      throw new Error(`Job record disappeared on the server (job ${jobId}) — check backend logs (coho log).`);
    }
    if (data.status === 'building' && !sawBuilding) { sawBuilding = true; phase('building'); }
    if (data.status === 'done') return data.module;
    if (data.status === 'error') {
      const msg = data.raw ? `${data.error || 'Generation failed'} — raw: ${data.raw}` : (data.error || 'Generation failed');
      throw new Error(msg);
    }
    // Stuck in 'pending' for 20s+ — the queue never picked the job up.
    // Re-submit once with inline:true (built in the request handler instead).
    if (isBuild && !sawBuilding && !usedFallback && Date.now() - queuedAt > 20000) {
      usedFallback = true;
      phase('retrying');
      console.debug(`[ai] job ${jobId} stuck in '${lastStatus}' for 20s — falling back to inline build`);
      ({ jobId } = await startJob({ inline: true }));
      unknownPolls = 0;
    }
  }
  throw new Error(`Generation timed out after 6 minutes (job ${jobId}, last status: ${lastStatus}). Try a simpler prompt.`);
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
  const data = await getData('meta', 'instances');
  return data?.list || [];
}

export async function saveInstances(list) {
  return setData('meta', 'instances', { list });
}
