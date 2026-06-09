import { app, datastore } from 'codehooks-js';
import { getSessionUser, sendUnauth } from '../lib/session.js';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';

// Bump this string every time ai.js changes so /ai/ping proves which build is live.
const AI_BUILD = '2026-06-09-ai-sync-m2.7-highspeed';

const SYSTEM_PROMPT = `You are an expert web developer for a browser-based OS shell called "Alpine OS Shell".
Your task is to generate complete, working app modules for this shell.

## Framework overview

Every module is a Web Component (custom HTML element) with Shadow DOM.
Generator modules (multi-instance) extend AppModuleBase.
Each instance has a stable \`this._appId\` used as the localStorage/backend key.

## AppModuleBase

Extend it for generator modules. It provides:
- \`this._appId\` — stable persistence key (always use this, NOT windowId)
- \`this._wrapper\` — root div.wrapper in shadow DOM (set innerHTML here)
- \`this._state\` — your data object (set in _load, read in _render)
- \`this._esc(str)\` — HTML-escape strings for innerHTML
- \`this.api.notify(msg, type)\` — toast ('info'/'success'/'error')

Implement exactly these three methods:
\`\`\`js
async _load() {
  // load state from getData, set this._state
}
_render() {
  // write DOM to this._wrapper.innerHTML
  // attach event listeners to elements inside _wrapper (not _wrapper itself)
}
_getTitle() {
  return this._state.name; // string shown in window titlebar
}
\`\`\`

## Persistence

\`\`\`js
import { getData, setData } from '/shell/api.js';

// in _load():
this._state = await getData('my-collection', this._appId) || { name: 'Default', ... };

// after any mutation:
await setData('my-collection', this._appId, this._state);
this._render();
\`\`\`

## Event handling pattern

Attach listeners to specific child elements inside _render(), NOT to this._wrapper.
Old elements are replaced on each _render(), so old listeners are automatically removed.

\`\`\`js
_render() {
  this._wrapper.innerHTML = \`
    <div class="body">
      <button class="add-btn">Add</button>
    </div>
  \`;
  this._wrapper.querySelector('.add-btn').addEventListener('click', () => {
    this._state.items.push({ id: Date.now(), text: 'New item' });
    setData('my-collection', this._appId, this._state);
    this._render();
  });
}
\`\`\`

## EXAMPLE — Complete counter module

JSON output:
{
  "manifest": {
    "appId": "counter",
    "tag": "app-counter",
    "entry": "/modules/placeholder/index.js",
    "title": "Counter",
    "icon": "🔢",
    "defaultSize": { "w": 320, "h": 260 },
    "minSize": { "w": 240, "h": 200 },
    "singleton": false,
    "generator": true,
    "resizable": true,
    "dataCollections": ["counters"],
    "contextMenu": [{ "label": "🔢 New Counter", "config": { "name": "Counter", "icon": "🔢" } }]
  },
  "js": "import { AppModuleBase } from '/shell/module-base.js';\\nimport { getData, setData } from '/shell/api.js';\\n\\nclass AppCounter extends AppModuleBase {\\n  async _load() {\\n    this._state = await getData('counters', this._appId) || { name: this.api?.config?.name || 'Counter', count: 0 };\\n  }\\n\\n  _render() {\\n    this._wrapper.innerHTML = \`<div class=\\"body\\"><div class=\\"count\\">\${this._state.count}</div><div class=\\"btns\\"><button class=\\"btn dec\\">−</button><button class=\\"btn rst\\">Reset</button><button class=\\"btn inc\\">+</button></div></div>\`;\\n    this._wrapper.querySelector('.dec').addEventListener('click', () => this._change(-1));\\n    this._wrapper.querySelector('.inc').addEventListener('click', () => this._change(1));\\n    this._wrapper.querySelector('.rst').addEventListener('click', () => this._change(0, true));\\n  }\\n\\n  _getTitle() { return this._state.name; }\\n\\n  async _change(delta, reset = false) {\\n    if (reset) this._state.count = 0; else this._state.count += delta;\\n    await setData('counters', this._appId, this._state);\\n    this._render();\\n  }\\n}\\n\\nif (!customElements.get('app-counter')) customElements.define('app-counter', AppCounter);",
  "css": ".wrapper { display:flex; flex-direction:column; min-height:100%; height:auto; align-items:center; justify-content:center; background:#f2f2f7; color:#1c1c1e; }\\n.wrapper.dark { background:#1c1c1e; color:#f5f5f7; }\\n.body { display:flex; flex-direction:column; align-items:center; gap:20px; }\\n.count { font-size:5rem; font-weight:700; }\\n.btns { display:flex; gap:8px; }\\n.btn { padding:10px 22px; border:none; border-radius:8px; background:#007aff; color:#fff; font-size:1rem; cursor:pointer; }\\n.btn:hover { opacity:.85; }\\n.rst { background:#8e8e93; }"
}

## Rules

1. Output ONLY valid JSON — no markdown, no code fences, no extra text
2. The "entry" field must always be exactly "/modules/placeholder/index.js" (the shell replaces it)
3. For generator modules (multiple named instances): set generator:true, add contextMenu with at least one entry
4. For singleton tools (one shared instance): set generator:false, singleton:true, no contextMenu
5. JS must start with: import { AppModuleBase } from '/shell/module-base.js';
6. JS must end with: if (!customElements.get('app-{appId}')) customElements.define('app-{appId}', ClassName);
7. Only use absolute /shell/ imports — no relative paths, no external URLs, no npm packages
8. All CSS selectors must be scoped under .wrapper
9. Dark mode: add .wrapper.dark selectors for every background/color rule
10. Use this.api?.config?.name for the initial name when available
11. The collection name in dataCollections must match what getData/setData use
12. Keep JS and CSS as single-line strings with \\n for newlines (valid JSON string)`;

// ─── AI diagnostics ────────────────────────────────────────────────────────────

app.get('/ai/ping', (req, res) => {
  // List every POST/GET route key the live manifest actually contains, so we can
  // confirm whether "POST /w/:workspaceId/ai-generate" is really deployed.
  let routeKeys = [];
  try { routeKeys = Object.keys(app.routes || {}); } catch {}
  res.json({
    ok: true,
    build: AI_BUILD,
    hasKey: !!process.env.MINIMAX_API_KEY,
    aiGenerateRegistered: routeKeys.includes('POST /w/:workspaceId/ai-generate'),
    routes: routeKeys,
  });
});

// ─── AI module generation (async job + polling) ───────────────────────────────
//
// MiniMax reasoning models (M3) can take 40–90s — far past the Codehooks ~30s
// HTTP handler limit. So generation runs in a background WORKER (which has a
// configurable, longer timeout). The POST route enqueues a job and returns a
// jobId instantly; the GET route polls job status. Results live in `ai_jobs`.

const AI_JOBS = 'ai_jobs';

// Shared cleaner: strip <think> reasoning blocks + markdown fences, then extract
// the outermost {...} so stray prose can't break JSON.parse.
function extractModuleJson(content) {
  let cleaned = String(content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  return (braceStart !== -1 && braceEnd !== -1) ? cleaned.slice(braceStart, braceEnd + 1) : cleaned;
}

// Worker is a no-op stub — generation runs in the POST handler (sync, 55s budget).
// Switch back to a real worker once the Codehooks PRO plan propagates correctly.
app.worker('ai-generate-worker', async (req, res) => { res.end(); }, { timeout: 30000, workers: 1 });

// POST — runs MiniMax-M3 synchronously within the 60s HTTP handler window.
// Uses a 55s AbortController so we get a clean error instead of a hard cutoff.
// The job/poll dance is kept so the frontend (generateModule in api.js) works unchanged:
// we write the result to ai_jobs before returning, and the poll route reads it.
app.post('/w/:workspaceId/ai-generate', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.json({ error: 'prompt string required' });
    return;
  }
  if (!process.env.MINIMAX_API_KEY) {
    res.json({ error: 'MINIMAX_API_KEY not configured on server' });
    return;
  }

  const workspaceId = req.params.workspaceId;
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const conn = await datastore.open();
  await conn.insertOne(AI_JOBS, { jobId, workspaceId, status: 'pending', createdAt: Date.now() });

  const finish = async (patch) => {
    await conn.updateOne(AI_JOBS, { jobId, workspaceId }, { jobId, workspaceId, ...patch }).catch(() => {});
  };

  // Run M3 synchronously — 55s budget keeps us under the 60s HTTP handler limit.
  const ac = new AbortController();
  const killTimer = setTimeout(() => ac.abort(), 55000);
  try {
    const aiRes = await fetch(MINIMAX_URL, {
      signal: ac.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}` },
      body: JSON.stringify({
        model: 'MiniMax-M2.7-highspeed',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        // Force structured JSON output — M2.7 otherwise drifts into chat replies.
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      await finish({ status: 'error', error: `MiniMax API error ${aiRes.status}: ${errBody.slice(0, 300)}` });
      res.json({ jobId });
      return;
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) { await finish({ status: 'error', error: 'Empty response from AI' }); res.json({ jobId }); return; }

    const jsonStr = extractModuleJson(content);
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      await finish({ status: 'error', error: 'AI returned invalid JSON', raw: jsonStr.slice(0, 300) });
      res.json({ jobId });
      return;
    }

    if (!parsed.manifest || !parsed.js) {
      await finish({ status: 'error', error: 'AI response missing manifest or js fields', raw: jsonStr.slice(0, 300) });
      res.json({ jobId });
      return;
    }

    await finish({ status: 'done', module: parsed });
    res.json({ jobId });
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'AI took over 55s — try a simpler prompt, or retry (complex modules sometimes need a second attempt)'
      : (err.message || 'AI request failed');
    await finish({ status: 'error', error: msg });
    res.json({ jobId });
  } finally {
    clearTimeout(killTimer);
  }
});

// GET — poll job status. 3-segment path (`/w/:ws/ai-job`) avoids colliding with
// the generic 4-segment data route `/w/:ws/:collection/:id`. jobId is a query.
app.get('/w/:workspaceId/ai-job', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  const { workspaceId } = req.params;
  const jobId = req.query?.job;
  if (!jobId) { res.json({ status: 'error', error: 'job query param required' }); return; }

  const conn = await datastore.open();
  const job = await conn.getOne(AI_JOBS, { jobId, workspaceId }).catch(() => null);
  if (!job) { res.json({ status: 'unknown' }); return; }
  res.json({ status: job.status, module: job.module, error: job.error, raw: job.raw });
});
