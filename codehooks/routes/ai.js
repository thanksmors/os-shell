import { app, datastore } from 'codehooks-js';
import { getSessionUser, sendUnauth } from '../lib/session.js';
import { kvSet, kvGet } from '../lib/db.js';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';

// Bump this string every time ai.js changes so /ai/ping proves which build is live.
const AI_BUILD = '2026-06-13-maxtokens-32k';

const SYSTEM_PROMPT = `You are an expert web developer for a browser-based OS shell called "ODVI Spaces".
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
  "css": ".wrapper { display:flex; flex-direction:column; min-height:100%; height:auto; align-items:center; justify-content:center; background:#f2f2f7; color:#1c1c1e; }\\n.wrapper.dark { background:#1c1c1e; color:#f5f5f7; }\\n.body { display:flex; flex-direction:column; align-items:center; gap:20px; }\\n.count { font-size:5rem; font-weight:700; }\\n.btns { display:flex; gap:8px; }\\n.btn { padding:10px 22px; border:none; border-radius:8px; background:var(--os-accent, #3b82f6); color:#fff; font-size:1rem; cursor:pointer; }\\n.btn:hover { opacity:.85; }\\n.rst { background:#8e8e93; }"
}

## EXAMPLE — Complete singleton module (one shared window)

Singletons ALSO extend AppModuleBase. Set generator:false, singleton:true, NO contextMenu.
If the app needs no saved data, just set this._state to a default object in _load().

JSON output:
{
  "manifest": {
    "appId": "clock",
    "tag": "app-clock",
    "entry": "/modules/placeholder/index.js",
    "title": "Clock",
    "icon": "🕐",
    "defaultSize": { "w": 300, "h": 200 },
    "minSize": { "w": 220, "h": 160 },
    "singleton": true,
    "generator": false,
    "resizable": true
  },
  "js": "import { AppModuleBase } from '/shell/module-base.js';\\n\\nclass AppClock extends AppModuleBase {\\n  async _load() {\\n    this._state = { name: 'Clock', now: new Date().toLocaleTimeString() };\\n  }\\n\\n  _render() {\\n    this._wrapper.innerHTML = \`<div class=\\"body\\"><div class=\\"time\\">\${this._state.now}</div></div>\`;\\n    clearInterval(this._timer);\\n    this._timer = setInterval(() => {\\n      const t = this._wrapper.querySelector('.time');\\n      if (t) t.textContent = new Date().toLocaleTimeString();\\n    }, 1000);\\n  }\\n\\n  _getTitle() { return this._state.name; }\\n\\n  disconnectedCallback() { super.disconnectedCallback(); clearInterval(this._timer); }\\n}\\n\\nif (!customElements.get('app-clock')) customElements.define('app-clock', AppClock);",
  "css": ".wrapper { display:flex; align-items:center; justify-content:center; min-height:100%; height:auto; background:#f2f2f7; color:#1c1c1e; }\\n.wrapper.dark { background:#1c1c1e; color:#f5f5f7; }\\n.body { text-align:center; }\\n.time { font-size:3rem; font-weight:700; font-variant-numeric:tabular-nums; }"
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
12. Keep JS and CSS as single-line strings with \\n for newlines (valid JSON string)
13. ALL modules (generator AND singleton) extend AppModuleBase. NEVER write your own constructor or connectedCallback — AppModuleBase already awaits _load() (which sets this._state) BEFORE calling _render(). Writing your own connectedCallback runs _render() before _state exists and crashes with "this._state is null".
14. _load() MUST always assign this._state before it returns — to persisted data OR a default object. Use: this._state = await getData(coll, key) || { ...defaults }. Singletons with no saved data just do: this._state = { ...defaults };
15. _render() may safely assume this._state is set. Always null-check elements from querySelector before using them.
16. If you override disconnectedCallback (e.g. to clear a setInterval), call super.disconnectedCallback() first.
17. Singletons have no per-instance id — persist with a fixed literal key, e.g. getData('myapp', 'data') / setData('myapp', 'data', this._state). Do NOT use this._appId for singleton persistence.
18. Font sizes in CSS must use rem units (the shell scales html font-size from user settings) — never px for text.
19. Primary action colors must use var(--os-accent, #3b82f6) — the user picks the accent in OS settings.
20. NEVER declare font-family in CSS — it inherits the user's chosen font from the shell.
21. SINGLETON IS THE DEFAULT. Only produce a generator module if the approved plan's type is "generator". Follow the plan's "type" field EXACTLY.
22. Be economical with output: no code comments, no dead code, no decorative whitespace. Implement exactly the planned features and nothing extra — your response is cut off at a hard token limit, so every wasted token risks truncating the module.`;

// ─── Phase prompts (clarify → plan → build/revise) ────────────────────────────

const CLARIFY_PROMPT = `You are a requirements analyst for "ODVI Spaces" app modules (Web Components, shadow DOM, localStorage/Codehooks persistence — the tech stack is FIXED, never ask about it).

Given the conversation, decide if the request is clear enough to plan. Output ONLY valid JSON, one of:

1. If genuinely ambiguous, ask 1-3 multiple-choice questions:
{"questions":[{"id":"q1","question":"...","options":[{"label":"...","detail":"...","recommended":true},{"label":"...","detail":"...","recommended":false}]}]}
- Max 3 questions, 2-4 options each, EXACTLY one option per question has recommended:true.
- Ask only about product decisions: scope, key features, data to track, layout style.
- NEVER ask about tech stack, frameworks, or persistence mechanics.
- Do NOT ask whether the app should be single-window or multi-instance UNLESS the user's words hint at multiple named instances (e.g. "lists", "boards", "one per project"). The default is a single shared window (singleton).

2. If the request is already clear (or after questions were answered):
{"ready":true,"summary":"one-paragraph restatement of what will be built"}`;

const PLAN_PROMPT = `You are a software planner for "ODVI Spaces" app modules (Web Components + AppModuleBase, getData/setData persistence — tech stack is FIXED).

Given the conversation (user request + any clarification answers), output ONLY valid JSON:

{"plan":{
  "title":"App Name",
  "icon":"single emoji",
  "appId":"kebab-case-id",
  "type":"singleton",
  "summary":"2-3 sentence description of what will be built",
  "features":["feature 1","feature 2","..."],
  "collections":["collection-name"],
  "dataModel":"one-line description of the persisted state shape"
}}

CRITICAL RULE for "type": it MUST be "singleton" unless the user EXPLICITLY asked for multiple separately-named instances (e.g. "I want to create several boards", "one per project"). Vague or absent instance-model preference = "singleton". If you choose "generator", the summary MUST quote the user's exact words that demanded multiple instances.

SCOPE LIMIT: the plan must fit a single-file module of roughly 400 lines of JS. If the request implies more than that, plan a core feature set that fits and say in "summary" which features were deferred — the user can add them later via Revise.

If the user asks to revise an existing app, keep its appId and title unless they asked to change them, and list only what changes under "features".`;

const REVISE_SUFFIX = `

## Revision mode

You are REVISING an existing installed module. You will receive its current manifest, js, and css plus an approved change plan.
- Keep the SAME appId and tag (user data is keyed by them).
- Apply only the planned changes; preserve all other behavior and styling.
- Output the COMPLETE updated module JSON (manifest + js + css), not a diff.`;

// Enforce the approved plan's instance model — the model occasionally drifts.
function enforcePlanType(parsed, planType) {
  if (!parsed?.manifest) return null;
  if (planType === 'generator') {
    parsed.manifest.generator = true;
    parsed.manifest.singleton = false;
    if (!Array.isArray(parsed.manifest.contextMenu) || parsed.manifest.contextMenu.length === 0) {
      return 'Generated generator module has no contextMenu entries — it would be unreachable. Retry the build.';
    }
  } else {
    // singleton is the default for everything else
    parsed.manifest.singleton = true;
    parsed.manifest.generator = false;
    delete parsed.manifest.contextMenu;
  }
  return null;
}

// ─── AI diagnostics ────────────────────────────────────────────────────────────

// Trivial worker that just writes a KV timestamp — proves the queue actually
// invokes workers on this plan/space (the ai-generate-worker timeout assumes
// PRO; if the queue is dead, builds stay 'pending' forever).
app.worker('ping-worker', async (req, res) => {
  await kvSet('worker_ping', { at: Date.now() }, { ttl: WORKER_PING_TTL })
    .catch((e) => console.error('[ai] kvSet worker_ping failed:', e.message));
  res.end();
});

app.get('/ai/ping', async (req, res) => {
  // List every POST/GET route key the live manifest actually contains, so we can
  // confirm whether "POST /w/:workspaceId/ai-generate" is really deployed.
  let routeKeys = [];
  try { routeKeys = Object.keys(app.routes || {}); } catch {}

  // Worker-alive probe: enqueue ping-worker, give it ~3s, check the KV stamp.
  let workerAlive = false;
  let workerError = null;
  try {
    const probeStart = Date.now();
    const conn = await datastore.open();
    await conn.enqueue('ping-worker', { probe: probeStart });
    await new Promise(r => setTimeout(r, 3000));
    const stamp = await kvGet('worker_ping');
    workerAlive = !!(stamp?.at && stamp.at >= probeStart);
  } catch (err) {
    workerError = err?.message || String(err);
  }

  res.json({
    ok: true,
    build: AI_BUILD,
    hasKey: !!process.env.MINIMAX_API_KEY,
    workerMode: true,
    workerAlive,
    ...(workerError && { workerError }),
    aiGenerateRegistered: routeKeys.includes('POST /w/:workspaceId/ai-generate'),
    routes: routeKeys,
  });
});

// ─── AI module generation (async job + polling) ───────────────────────────────
//
// Two execution paths by mode:
// - clarify/plan: fast (~5-10s), run synchronously in the POST handler on
//   MiniMax-M2.7-highspeed. Result is in ai_jobs before the POST returns.
// - build/revise: slow (M3 is a reasoning model — 40s to several minutes), run
//   in a background WORKER with a 300s LLM budget (worker timeout 330s; paid
//   plans allow up to 10min). POST enqueues and returns the jobId instantly;
//   the frontend polls (deadline 360s).

// ⚠️ Codehooks KV ttl is MILLISECONDS, not seconds. `10 * 60` (600ms) expired
// every job record before the frontend's first 2s poll — every build "timed out".
// AI job TTL: 10 minutes — frontend polls max 6min, so jobs always outlive polling.
const AI_JOB_TTL = 10 * 60 * 1000;
const WORKER_PING_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days, ms

// Shared cleaner: strip <think> reasoning blocks + markdown fences, then extract
// the outermost {...} so stray prose can't break JSON.parse. (M3 emits <think>.)
function extractModuleJson(content) {
  let cleaned = String(content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  return (braceStart !== -1 && braceEnd !== -1) ? cleaned.slice(braceStart, braceEnd + 1) : cleaned;
}

// Shared MiniMax call + JSON extraction. Returns { parsed, finishReason } or
// throws with a user-facing message.
async function runMiniMax({ model, systemPrompt, convo, maxTokens, budgetMs }) {
  const ac = new AbortController();
  const killTimer = setTimeout(() => ac.abort(), budgetMs);
  try {
    const aiRes = await fetch(MINIMAX_URL, {
      signal: ac.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...convo],
        max_tokens: maxTokens,
      }),
    });
    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      throw new Error(`MiniMax API error ${aiRes.status}: ${errBody.slice(0, 300)}`);
    }
    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from AI');
    return { jsonStr: extractModuleJson(content), finishReason: aiData.choices?.[0]?.finish_reason };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI took over ${Math.round(budgetMs / 1000)}s — try a simpler prompt, or retry (complex modules sometimes need a second attempt)`);
    }
    throw err;
  } finally {
    clearTimeout(killTimer);
  }
}

// Validate + finalize a build/revise result. Returns an error string or null.
function validateBuildResult(parsed, planType) {
  if (!parsed.manifest || !parsed.js) return 'AI response missing manifest or js fields';
  return enforcePlanType(parsed, planType === 'generator' ? 'generator' : 'singleton');
}

// ─── Worker: build/revise on MiniMax-M3 (300s LLM budget, 330s worker timeout —
// paid plans allow worker timeouts up to 10 minutes) ───────────────────────────

app.worker('ai-generate-worker', async (req, res) => {
  // Defensive payload parse: handle both delivery shapes (body.payload and
  // bare body) so a shape mismatch can't silently no-op the worker.
  const payload = req.body?.payload ?? req.body ?? {};
  const { jobId, workspaceId, mode, convo, planType, maxTokens, model } = payload;
  const startedAt = Date.now();
  const finish = (patch) => {
    console.log(`[ai-worker] job ${jobId} → ${patch.status}${patch.error ? ` (${patch.error})` : ''} +${Date.now() - startedAt}ms`);
    return kvSet(`ai_job:${jobId}`, { jobId, workspaceId, ...patch }, { ttl: AI_JOB_TTL })
      .catch((e) => console.error(`[ai-worker] kvSet failed for job ${jobId}:`, e.message));
  };

  if (!jobId || !Array.isArray(convo)) {
    console.error('[ai-worker] bad payload shape:', JSON.stringify(req.body || {}).slice(0, 300));
    res.end();
    return;
  }

  // Breadcrumb: mark the job as picked up BEFORE the slow LLM call. Polling can
  // now distinguish "worker never ran" (pending forever) from "LLM slow/killed"
  // (building, then nothing). Also refresh the worker-health stamp the POST
  // handler uses to route between worker and inline builds.
  const workerStartedAt = Date.now();
  await finish({ status: 'building', workerStartedAt });
  await kvSet('worker_ping', { at: Date.now() }, { ttl: WORKER_PING_TTL })
    .catch((e) => console.error('[ai] kvSet worker_ping failed:', e.message));

  // NOTE: no liveness heartbeat. Timer callbacks inside queue workers are
  // unreliable (setInterval throws; setTimeout chains silently never fire) —
  // a heartbeat built on them killed builds that were actually succeeding.
  // The platform worker timeout (330s) is the backstop for a hung LLM call.

  try {
    const systemPrompt = mode === 'revise' ? SYSTEM_PROMPT + REVISE_SUFFIX : SYSTEM_PROMPT;
    console.log(`[ai-worker] job ${jobId} LLM call start (${model || 'MiniMax-M3'}, mode=${mode}, convo=${convo.length})`);
    const { jsonStr, finishReason } = await runMiniMax({
      model: model || 'MiniMax-M3',
      systemPrompt,
      convo,
      maxTokens: maxTokens || 32768,
      budgetMs: 300000,
    });
    console.log(`[ai-worker] job ${jobId} LLM done +${Date.now() - startedAt}ms (finish_reason=${finishReason}, len=${jsonStr.length})`);

    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      const truncated = finishReason === 'length';
      await finish({
        status: 'error',
        error: truncated
          ? 'Module too large — the AI response was cut off at the token limit. Try fewer features, or build a basic version first and use Revise to add more.'
          : 'AI returned invalid JSON',
        raw: jsonStr.slice(0, 800),
      });
      res.end();
      return;
    }

    const typeErr = validateBuildResult(parsed, planType);
    if (typeErr) { await finish({ status: 'error', error: typeErr }); res.end(); return; }

    await finish({ status: 'done', module: parsed });
  } catch (err) {
    await finish({ status: 'error', error: err.message || 'AI request failed' });
  }
  res.end();
}, { timeout: 330000, workers: 1 });

// ─── POST: clarify/plan run inline; build/revise enqueue to the worker ────────

app.post('/w/:workspaceId/ai-generate', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }

  // mode: clarify | plan | build | revise. Legacy callers send only {prompt} → build.
  const { prompt, messages, plan, existing } = req.body || {};
  const mode = ['clarify', 'plan', 'build', 'revise'].includes(req.body?.mode) ? req.body.mode : 'build';

  // Normalize conversation: prefer messages[], fall back to single prompt.
  let convo = Array.isArray(messages)
    ? messages.filter(m => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    : [];
  if (!convo.length && typeof prompt === 'string' && prompt.trim()) {
    convo = [{ role: 'user', content: prompt }];
  }
  if (!convo.length) {
    res.json({ error: 'messages array or prompt string required' });
    return;
  }
  if (!process.env.MINIMAX_API_KEY) {
    res.json({ error: 'MINIMAX_API_KEY not configured on server' });
    return;
  }

  if ((mode === 'build' || mode === 'revise') && plan) {
    convo = [...convo, { role: 'user', content: `APPROVED PLAN (follow "type" exactly):\n${JSON.stringify(plan)}` }];
  }
  if (mode === 'revise' && existing) {
    convo = [...convo, { role: 'user', content: `EXISTING MODULE (keep appId/tag, apply only planned changes):\n${JSON.stringify(existing)}` }];
  }

  const workspaceId = req.params.workspaceId;
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  const conn = await datastore.open();
  await kvSet(`ai_job:${jobId}`, { jobId, workspaceId, status: 'pending', createdAt }, { ttl: AI_JOB_TTL });
  console.log(`[ai] job ${jobId} created (mode=${mode}, convo=${convo.length})`);

  const finish = async (patch) => {
    console.log(`[ai] job ${jobId} → ${patch.status}${patch.error ? ` (${patch.error})` : ''} +${Date.now() - createdAt}ms`);
    await kvSet(`ai_job:${jobId}`, { jobId, workspaceId, ...patch }, { ttl: AI_JOB_TTL })
      .catch((e) => console.error(`[ai] kvSet failed for job ${jobId}:`, e.message));
  };

  // ── build/revise: hand off to the worker (M3, 110s budget) and return now ──
  if (mode === 'build' || mode === 'revise') {
    const planType = plan?.type === 'generator' ? 'generator' : 'singleton';

    // Worker-health routing: any worker that runs (ping-worker via /ai/ping, or
    // ai-generate-worker on pickup) stamps worker_ping. If no stamp in the last
    // 24h, queue workers don't run on this plan — build inline directly instead
    // of letting every job waste 20s discovering a dead queue. Self-healing: if
    // the plan is upgraded later, one /ai/ping restores the M3 worker path.
    let workerHealthy = false;
    try {
      const stamp = await kvGet('worker_ping');
      workerHealthy = !!(stamp?.at && Date.now() - stamp.at < 24 * 60 * 60 * 1000);
    } catch {}

    // Inline path: explicit frontend fallback (inline:true after 20s of
    // 'pending') or automatic when the queue is known-dead. Runs the build in
    // this request handler on the highspeed model — weaker than M3, but it
    // works even when queue workers are dead on this plan.
    if (req.body?.inline || !workerHealthy) {
      console.log(`[ai] job ${jobId} building INLINE (${req.body?.inline ? 'frontend fallback' : 'queue dead'})`);
      try {
        const systemPrompt = mode === 'revise' ? SYSTEM_PROMPT + REVISE_SUFFIX : SYSTEM_PROMPT;
        const { jsonStr, finishReason } = await runMiniMax({
          model: 'MiniMax-M2.7-highspeed',
          systemPrompt,
          convo,
          maxTokens: 32768,
          budgetMs: 50000,
        });
        let parsed;
        try { parsed = JSON.parse(jsonStr); }
        catch {
          await finish({
            status: 'error',
            error: finishReason === 'length'
              ? 'Module too large — the AI response was cut off at the token limit. Try fewer features, or build a basic version first and use Revise to add more.'
              : 'AI returned invalid JSON',
            raw: jsonStr.slice(0, 800),
          });
          res.json({ jobId });
          return;
        }
        const typeErr = validateBuildResult(parsed, planType);
        if (typeErr) { await finish({ status: 'error', error: typeErr }); res.json({ jobId }); return; }
        await finish({ status: 'done', module: parsed });
      } catch (err) {
        await finish({ status: 'error', error: err.message || 'AI request failed' });
      }
      res.json({ jobId });
      return;
    }

    console.log(`[ai] job ${jobId} enqueued to ai-generate-worker`);
    await conn.enqueue('ai-generate-worker', {
      jobId,
      workspaceId,
      mode,
      convo,
      planType,
      maxTokens: 32768,
      model: 'MiniMax-M3',
    });
    res.json({ jobId });
    return;
  }

  // ── clarify/plan: fast modes, run inline on the highspeed model ────────────
  try {
    const { jsonStr } = await runMiniMax({
      model: 'MiniMax-M2.7-highspeed',
      systemPrompt: mode === 'clarify' ? CLARIFY_PROMPT : PLAN_PROMPT,
      convo,
      maxTokens: mode === 'clarify' ? 1024 : 2048,
      budgetMs: 55000,
    });

    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      await finish({ status: 'error', error: 'AI returned invalid JSON', raw: jsonStr.slice(0, 800) });
      res.json({ jobId });
      return;
    }

    if (mode === 'clarify') {
      if (!Array.isArray(parsed.questions) && parsed.ready !== true) {
        await finish({ status: 'error', error: 'AI clarify response missing questions/ready', raw: jsonStr.slice(0, 300) });
        res.json({ jobId });
        return;
      }
    } else {
      if (!parsed.plan?.title || !parsed.plan?.type) {
        await finish({ status: 'error', error: 'AI plan response missing plan.title/type', raw: jsonStr.slice(0, 300) });
        res.json({ jobId });
        return;
      }
      // Singleton default: anything that isn't an explicit generator is singleton.
      if (parsed.plan.type !== 'generator') parsed.plan.type = 'singleton';
    }

    await finish({ status: 'done', module: parsed });
    res.json({ jobId });
  } catch (err) {
    await finish({ status: 'error', error: err.message || 'AI request failed' });
    res.json({ jobId });
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

  const job = await kvGet(`ai_job:${jobId}`);
  if (!job) {
    console.log(`[ai] poll miss — job ${jobId} not in KV (expired or never written)`);
    res.json({ status: 'unknown' });
    return;
  }
  res.json({ status: job.status, module: job.module, error: job.error, raw: job.raw, workerStartedAt: job.workerStartedAt });
});
