import { app } from 'codehooks-js';
import { getSessionUser, sendUnauth } from '../lib/session.js';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';

// Bump this string every time ai.js changes so /ai/ping proves which build is live.
const AI_BUILD = '2026-06-09-ai-text01-v1';

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

// ─── AI module generation ──────────────────────────────────────────────────────

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

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 25000);

  try {
    const aiRes = await fetch(MINIMAX_URL, {
      signal: ac.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        // MiniMax-Text-01 is the fast, non-reasoning model. MiniMax-M3 is a
        // reasoning model that emits <think> blocks and is too slow for the
        // Codehooks 30s handler limit.
        model: 'MiniMax-Text-01',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
      }),
    });
    clearTimeout(timeout);

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      res.json({ error: `MiniMax API error ${aiRes.status}: ${errBody.slice(0, 300)}` });
      return;
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) { res.json({ error: 'Empty response from AI' }); return; }

    // Clean the model output before parsing: drop <think> reasoning blocks and
    // markdown fences, then extract the outermost {...} so any stray prose can't
    // break JSON.parse.
    let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const braceStart = cleaned.indexOf('{');
    const braceEnd = cleaned.lastIndexOf('}');
    const jsonStr = (braceStart !== -1 && braceEnd !== -1)
      ? cleaned.slice(braceStart, braceEnd + 1)
      : cleaned;
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      res.json({ error: 'AI returned invalid JSON', raw: jsonStr.slice(0, 300) });
      return;
    }

    if (!parsed.manifest || !parsed.js) {
      res.json({ error: 'AI response missing manifest or js fields', raw: jsonStr.slice(0, 300) });
      return;
    }

    res.json(parsed);
  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === 'AbortError'
      ? 'MiniMax took too long (>25s). Try a shorter/simpler prompt.'
      : (err.message || 'AI request failed');
    res.json({ error: msg });
  }
});
