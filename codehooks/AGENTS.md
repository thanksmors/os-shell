# codehooks/ — Cloud Backend

## Purpose

Optional REST API backend for cross-device persistence. Deployed to Codehooks
(https://codehooks.io). The shell works fully offline without it — `shell/api.js`
falls back to localStorage automatically when `BACKEND_URL` is empty in
`shell/config.js`.

## Ownership

`codehooks/` is a standalone deploy unit. The only consumer is `shell/api.js`.
If route paths change, update both `codehooks/index.js` and the `fetch` calls in
`shell/api.js` in the same commit.

## Local Contracts

### Routes

All data routes are **workspace-scoped** under `/w/:workspaceId/` (see
`routes/data.js`). Records are keyed by `{ workspaceId, appId: id }`.

| Method | Path | Description |
|---|---|---|
| GET/PUT | `/w/:ws/instances` | Workspace's module instance list (`ws_instances`) |
| GET | `/w/:ws/changes` | Polling fallback change feed |
| POST | `/w/:ws/sse-listener` | Register an SSE listener on the `/sync` channel |
| GET | `/w/:ws/:collection/:id` | Generic read — backs every module collection |
| PUT | `/w/:ws/:collection/:id` | Generic write — **merges** via `mergeDoc` (see Concurrent-edit merge) |
| DELETE | `/w/:ws/:collection/:id` | Generic delete |

Adding a new module with persistent data requires **no new routes** — the generic
`/w/:ws/:collection/:id` handlers cover it. (For *collaborative* modules, still add
a `TOP_ARRAYS` entry in `lib/merge.js` — see Concurrent-edit merge below.)

**3-segment vs 4-segment rule:** dedicated routes like `/w/:ws/instances` and
`/w/:ws/ai-job` are 3-segment so they don't collide with the 4-segment generic
`/w/:ws/:collection/:id`. Never give a special route 4 segments.

**AI generation routes** (`codehooks/routes/ai.js`):

| Method | Path | Description |
|---|---|---|
| GET | `/ai/ping` | Deploy + worker probe — returns `{ build, hasKey, workerAlive, ok }`. Bump `AI_BUILD` string on every change to verify deploys. `workerAlive` enqueues `ping-worker` and checks a KV stamp 3s later — `false` means queue workers don't run on this plan/space. |
| POST | `/w/:workspaceId/ai-generate` | clarify/plan run inline; build/revise/consolidate enqueue to the worker and return `{ jobId }` instantly. `inline: true` in the body forces an inline build (highspeed model, 50s budget) — the frontend's queue-dead fallback. |
| GET | `/w/:workspaceId/ai-job?job=` | Poll job status. Returns `{ status, module, error, raw, workerStartedAt }`. |

**AI generation architecture (PRO plan, worker mode):**
- `clarify`/`plan` modes run **synchronously** in the POST handler on `MiniMax-M2.7-highspeed`, up to 2 attempts × 25s `AbortController` (two attempts stay under the frontend's 65s POST abort) — on invalid JSON or wrong shape the handler reprompts once with the bad reply plus a corrective instruction. Result written to the `ai_job:` KV before the POST returns. The clarify prompt channels model recommendations through a question's `recommended:true` option (never prose) — chat-style design questions from the user used to make the model break the JSON contract.
- `build`/`revise`/`consolidate` modes are **enqueued to the real worker** (`ai-generate-worker`, `{ timeout: 330000, workers: 1 }`). POST returns the jobId instantly; the frontend polls (`aiRequest` in `shell/api.js`, 360s cap). Timeout ordering contract: build budget < worker timeout (330s) < frontend poll deadline (360s) < job TTL (10min). Per the Codehooks docs, paid plans allow worker timeouts up to **10 minutes** — an earlier "PRO limit is 120s" belief here was wrong and made every nontrivial M3 build die at 110s.
- **Multi-file build (`buildModule`) — plan-split, every call bounded so none truncates:**
  1. **Architect** (`ARCHITECT_PROMPT`, M3): a **plan only, NO code** — `{ manifest, state, mainSpec, files:[{name,exports,spec}] }`. Tiny output → fast, so it's never the bottleneck (writing the whole module in one call was — for complex apps that call never returned). Decides single- vs multi-file — **single-file (`files:[]`) is the default/preferred**; it splits only for genuinely large apps. (Eval evidence: every multi-file app crashed on `host`-delegation, every single-file one ran — see reliability bullet below.) Builds ONLY the approved plan's core `features`; `deferred` features are skipped (added later via Revise).
  2. **Code** (`generateCode`, M3, **parallel**): `main.js` (`SYSTEM_PROMPT`) + every feature file (`FEATURE_PROMPT`) generated concurrently from the fixed plan — `Promise.all`, so wall-clock ≈ the slowest single file, not the sum. Feature functions take the module instance (`host`); **star topology** — features import only `/shell/`, never each other/main.
  3. **Lint + repair** (`lintAndRepair` → `lintModule` in `lib/lint-module.js`, pure/unit-tested): static contract checks on the generated code BEFORE CSS (so CSS styles the final classes). Catches the gotchas the model emits — own `connectedCallback`/no `_state` assignment (E3/E4), `windowId` as a key (E5), raw `localStorage` (E6), disallowed imports (E7), feature files defining the element or using relative imports (F1/F2, the star-topology rule), **feature calls that don't pass exactly `this` (D1 — the dominant multi-file crash: `fn()` → host undefined, `fn(this._state)` → host._state undefined)**, and **constructors that touch `this._state`/`_wrapper`/`_render()` before `_load()` (D2)**. On violation: if `repairBudget > 0` (worker path), **one targeted repair re-prompt per offending file** (`REPAIR_PROMPT`, fix-only-these) then re-lint; if still bad, or `repairBudget === 0` (inline path — too tight for an extra call), the build is **rejected** with the precise per-file messages (deterministic, not auto-retried). A clean module passes through untouched, so the pass can't regress a valid build.
  4. **CSS** (`STYLE_PROMPT`, fast model, max_tokens 4096): **one chunk per JS file, parallel** — entry chunk owns root/layout/theme, feature chunks style only their own classes — so CSS scales too. Per-chunk failure is non-fatal (ships that chunk unstyled).
  Result is `{ manifest, files:{...}, entryFile:'main.js', css }` (multi) or `{ manifest, js, css }` (single). Budgets are ceilings (worker plan 110s / code 230s / css 35s; inline 18/25/12). **Hard ceiling:** a single feature needing >~250s can't fit one M3 call in the 330s worker, and `Promise.all` makes it fail the whole build — which is why the **planner scopes** big apps (below). `result.error` (architect/code failure) surfaces verbatim; else `finishReason 'length'` → truncation message.
- **Scope-split (always for big apps):** `PLAN_PROMPT` aggressively puts only the essential, usable **core** in `plan.features` and everything else in `plan.deferred` (`[{title,desc}]`). The architect builds only the core; the frontend stores `deferred` on the module and shows one-tap **➕ Add** buttons that seed a scoped Revise (which moves the item into the core, rebuilds via multi-file, keeps appId/tag → data survives, and shrinks the roadmap).
- **Consolidate mode (`consolidate`):** rebuilds a Frankenstein'd app (grown by repeated additive Revises) into one coherent design from its spec. Reuses `buildModule` at the **same scope** as a Revise — every file regenerates on every build regardless, so consolidate is **not** a larger/riskier build. The only difference is the architect prompt: `CONSOLIDATE_SUFFIX` **drops** the revise "keep the existing file split" structural anchor (free redesign) while the existing code is still sent as a **behavioral reference** (preserve every feature) and the **data contract is frozen** (same `dataCollections` keys + field names → stored data still loads). POST attaches plan + existing for consolidate just like revise; the `EXISTING MODULE` framing label differs by mode. Keeps appId/tag; frontend auto-reinstalls and snapshots `prev` (Revert is the backstop).
- **Auto-retry on timeout is the frontend's job, not the worker's** — the 300s/260s budget leaves no room for a second attempt inside the 330s worker. `_processQueue` (`modules/builder/index.js`) re-queues a job **once** on a `took over` (timeout) error (`autoRetried` flag); truncation/invalid-JSON are deterministic and not retried.
- **Failure telemetry:** every build outcome bumps a durable KV counter via `bumpStat` — `ai_stat:{timeout|truncation|invalid_json|success}`, plus the lint pass's `ai_stat:{lint_caught|lint_repaired|lint_failed}` (no ttl, best-effort, races tolerated). Read with `coho` to see the real failure mix and how often lint catches/repairs/rejects.
- **Taught capabilities (gated):** `SYSTEM_PROMPT` has an "Optional capabilities" section the model uses ONLY when the plan calls for it (kept opt-in to protect the output/truncation budget): settings panel (`hasSettings` + the `os:toggle-settings` constructor listener), `api.updateInstance` icon/name rename, `showEmojiPicker`, `api.notify`, and live `sync`. **Instance-model scoped — important:** `updateInstance` rename and auto-`sync` are **generator-only** (auto-sync subscribes on `this._appId`, which equals the data key only for generators; sync also needs a `_collection()` override returning the dataCollections name). Singletons get neither. `ARCHITECT_PROMPT` sets `manifest.sync`/`hasSettings` accordingly. These patterns are verified to lint clean (rule 12 permits the settings constructor; lint E3 flags only `connectedCallback`). When you change a taught capability, keep the prompt, `lib/lint-module.js`, and the human docs in sync. Assessment + roadmap for further generator passes: `docs/builder-generator-roadmap.md`; empirical regression set (run before/after any prompt change — no headless harness): `docs/builder-eval-set.md`.
- **Reliability bias (eval-driven, Phase A):** the live eval run showed installs ≠ working apps — multi-file `host`-delegation was the #1 crash source. So: `ARCHITECT_PROMPT` now **prefers single-file** and only splits large apps (and, when it splits, requires `main` to call features with exactly `this`); `SYSTEM_PROMPT` forbids re-rendering on every keystroke (full `_render()` on `input` drops field focus); the D1/D2 lint rules above are the static backstop. Capability/archetype expansion is **deferred** until the eval set shows reliability is solid.
- **contextMenu labels carry no emoji:** generator right-click "New …" entries are plain text ("New Board", not "🗂️ New Board") across all modules; `ARCHITECT_PROMPT` teaches the generator the same. The desktop icon emoji comes from `manifest.icon`/`config.icon`, not the menu label.
- Worker payload is parsed defensively (`req.body?.payload ?? req.body`) — delivery shape varies. On pickup the worker writes `{ status: 'building', workerStartedAt }` BEFORE the LLM call, so polling distinguishes "worker never ran" (`pending` forever) from "LLM running/killed" (`building`). It writes `done`/`error` at the end and calls `res.end()`. There is deliberately NO liveness heartbeat — timers inside workers are unreliable (see gotcha 8) and a heartbeat-staleness check on the frontend aborted builds that were actually succeeding. A hung LLM call is bounded by the worker timeout; a silently-killed worker surfaces as the frontend's poll deadline. Because the worker's own abort `setTimeout` is unreliable (gotcha 8) — a hung MiniMax call can run to the 330s platform kill with no error written — `aiRequest` (`shell/api.js`) **fails fast**: if status stays `building` >340s it throws a clear "build too complex/timed out" error instead of waiting out the 360s deadline (no auto-retry — a too-big app would just hang again).
- **Logs are lossy and out-of-order.** `coho log` drops lines under load and interleaves timestamps; a missing `→ done` line does not mean the write didn't happen. The `ai_job:` KV record is the source of truth for job state, not the log stream.
- **Worker-health routing (queue-dead fallback):** every worker that runs stamps KV `worker_ping`. The POST handler checks the stamp: no stamp in 24h → queue workers don't fire on this plan → build/revise run **inline directly** (highspeed model, 50s budget) with no 20s discovery penalty. Self-healing: after a plan upgrade, one `GET /ai/ping` (its `ping-worker` stamps on success) restores the M3 worker path. The frontend's 20s `pending` → `inline: true` retry remains as a second safety net. `GET /ai/ping → workerAlive` tells you which world you're in. **Confirmed 2026-06-13: workerAlive=true — the M3 worker path is active.**
- The job/poll contract: `POST → { jobId }`, `GET /w/:ws/ai-job?job= → { status, module, error, raw, workerStartedAt }`.

**Route path rule:** AI routes use 3-segment paths (`/w/:ws/ai-generate`, `/w/:ws/ai-job`). A 4-segment path like `/w/:ws/ai/generate` collides with the generic data route `/w/:ws/:collection/:id` — never use 4 segments for AI routes.

**Models:** `MiniMax-M2.7-highspeed` for clarify/plan (max_tokens 1024/2048) and the separate CSS call (max_tokens 4096); `MiniMax-M3` for the architect plan call (max_tokens 8192 — plan only, no code) and the main/feature code calls (32768/16384) of build/revise — M3's `<think>` reasoning tokens count against max_tokens (~4k typical), so the cap must leave room for reasoning + code. Plan-split + scoping keep each call well under the cap. Runs in the worker, ~1–3min at ~120 tok/s; `extractModuleJson` strips the `<think>` blocks). No `response_format` param — it caused request hangs; JSON extraction is handled by `extractModuleJson` instead.

---

### Codehooks-specific rules

Breaking any of these causes silent failures in the browser.

**1. Auth — query param only**

Send the API key as `?apikey=TOKEN`. Never as a request header.

Custom headers trigger a CORS preflight (`OPTIONS` request). Codehooks' native
CORS does not include custom headers in `Access-Control-Allow-Headers`, so the
browser blocks the actual request silently. The `apikey` query param avoids
preflight entirely.

**2. No CORS middleware**

`codehooks-js` `res` is not Express `Response`. It has no:
- `res.header(name, value)` — throws `t.header is not a function`
- `res.sendStatus(code)` — throws
- `res.status(code).json(data)` — `.status()` does not return `res`; chaining crashes

Codehooks handles CORS natively. Adding Express-style CORS middleware breaks
every request and surfaces as "CORS request did not succeed, status null".

**3. `getOne` throws on miss — always catch**

```js
const data = await db.getOne(collection, { appId }).catch(() => null);
```

**4. `updateOne` upsert is a trap — use explicit get → insert/update**

Codehooks `updateOne(collection, query, document, options)` takes **four** args.
The pattern below passes `{}` as `options` (so upsert is OFF) and `{ upsert: true }`
as a silently-ignored 5th arg:

```js
// BROKEN — upsert never takes effect:
await db.updateOne(collection, { appId }, record, {}, { upsert: true });
```

With no upsert, `updateOne` throws **`5 NOT_FOUND`** when the query matches no
document — so every *first write* (new user in `bootstrapSession`, new workspace,
first save to a collection) blows up with an unhandled Codehook exception. Existing
users only hit update paths, so the bug hides until a brand-new account signs in.

`dbUpsert` in `lib/db.js` and the data PUT route now do an explicit get → branch:

```js
const existing = await db.getOne(collection, { appId }).catch(() => null);
if (existing) await db.updateOne(collection, { appId }, doc);
else          await db.insertOne(collection, doc);
```

One extra read, but it actually works. Do not "optimize" it back to upsert.

**5. `res.json(null)` sends empty body**

Return `res.json({})` for not-found cases. The frontend treats a zero-key object
as not-found and falls back to defaults. Sending `null` causes `JSON.parse` to
throw on the client.

**6. Endpoint format**

Use `https://test-tp2u.api.codehooks.io/dev`. The `crunchy-universe-a06e.codehooks.io`
alias does not work with the `/dev` path suffix.

**7. HTTP status codes for auth errors**

Permission errors must set the status code separately before calling `res.json()` (chaining crashes):
```js
res.status(403);
res.json({ error: 'Insufficient permissions' });
```
`sendUnauth` in `lib/session.js` already does this correctly for 401. Apply the same pattern for 403 in route handlers.

**8. Timers are hostile in this runtime — `setInterval` throws, worker `setTimeout` is unreliable**

`setInterval` throws `setInterval is disabled, use a cron job instead` — an
unhandled exception that kills the calling function (this crashed the AI worker
on its first heartbeat tick). In **HTTP route handlers** `setTimeout` works
(the `/ai/ping` 3s probe depends on it). In **queue workers** `setTimeout`
callbacks have been observed to silently never fire (a 15s heartbeat chain
never ticked once across a 153s run), so never build worker logic that DEPENDS
on a timer firing — treat the worker `timeout` option (platform kill) as the
only reliable time bound. For truly periodic background work use a cron job.

**9. KV store — ALWAYS go through `kvSet`/`kvGet`, never raw `db.set`/`db.get`**

⚠️ **The single worst gotcha in this backend.** Codehooks' raw KV `db.set(key, value)`
does **not** JSON-serialize objects — it coerces non-string values with `String()`,
so `db.set(key, { userId })` stores the literal string `"[object Object]"`. Reading
it back gives you that string, and **every property access returns `undefined`**.

This failed *silently and catastrophically*: sessions stored this way resolved to
`userId: undefined` on every request, so no user was ever recognized as owner or
member; invites, AI-job polling, and the changes feed were all broken the same way.
Nothing throws — the data just round-trips into garbage. It took an entire debugging
session (dumping the raw session record) to catch it.

**The rule:** all KV access goes through the helpers in `lib/db.js`, which
`JSON.stringify` on write and `JSON.parse` on read:

```js
import { kvSet, kvGet } from '../lib/db.js';
await kvSet(`session:${token}`, { sessionToken, userId }, { ttl: 30 * 24 * 60 * 60 });
const session = await kvGet(`session:${token}`);   // → real object, or null
```

Never call `conn.set(...)` / `conn.get(...)` directly for KV values. The only
legitimate raw read is a deliberate "dump exactly what's stored" diagnostic.
`kvGet` also returns `null` (not a throw) for missing/corrupt/legacy values, so
callers can fail closed — e.g. `getSessionUser` rejects any session without a
`userId`.

⚠️ TTL is in **MILLISECONDS**, not seconds (confirmed in `codehooks-js` types and
the official TTL tutorial); expired keys auto-delete. This doc previously said
"seconds" and that error propagated into every call site: `{ ttl: 600 }` meant AI
job records expired **0.6s** after each write, so polling always read `unknown`
and every Build App run "timed out after 4 minutes" — while sessions silently
lasted 43 minutes and invites 10 minutes. Always write TTLs as explicit
millisecond math, e.g. `{ ttl: 10 * 60 * 1000 }`. Current KV users (all via the
helpers): sessions (`lib/session.js`), invites (`routes/invites.js`), AI jobs
(`routes/ai.js`), changes feed (`lib/changes.js`).

Use KV (not a collection) for ephemeral/ TTL'd data — collections accumulate
stale records forever with no automatic cleanup.

---

### Role authority — `lib/roles.js`

`workspaces.ownerId` is the **authoritative** record of who owns a workspace. The
per-member role in the `ws_members` doc can drift out of sync (and historically
did, locking the real owner out). Never derive ownership from the members doc
alone.

- `effectiveRole(ws, membersDoc, userId)` — returns `'owner'` if `ws.ownerId`
  matches (or, as a safety net, if the workspace has no `ownerId` and the user is
  its sole member), otherwise the members-doc role. **Every owner/admin permission
  check must use this**, not a raw `membersDoc.members.find(...)`.
- `healOwnerRole(...)` — called in `GET /workspaces`; self-repairs a drifted
  members doc and back-fills a missing `ownerId` so the two records reconverge.

When adding a permission-gated route, import `effectiveRole` and gate on it.

### Concurrent-edit merge — `lib/merge.js`

`PUT /w/:ws/:collection/:id` does **not** blind-overwrite. It loads the current
doc, calls `mergeDoc(current, incoming, collection)`, and stores the union, so two
members saving at once don't clobber each other. `setData()` in `shell/api.js`
stamps `_ts: Date.now()` on every object payload; the merge uses it to pick the
newer doc on same-`id` conflicts (last-write-wins per field). Id-keyed array items
are unioned; `_del: true` tombstones drop deleted items.

**Adding a collaborative module:** if its data has top-level id-keyed arrays, add
the collection → field-names mapping to `TOP_ARRAYS` (and `NESTED` for nested
maps) in `lib/merge.js`. Without an entry, that collection falls back to plain
last-write-wins (whole-doc overwrite) and concurrent edits will be lost.

### Data shapes

All records include `appId` (lookup key) and Codehooks-internal `_id`.

**`meta` / `instances`:**
```json
{ "list": [{ "instanceId": "inst-...", "appId": "list", "name": "My Todo", "icon": "📋" }], "appId": "instances", "_id": "..." }
```

**`lists`:**
```json
{ "name": "My Todo", "items": [{ "id": "item-...", "text": "...", "checked": false, "fieldValues": {} }], "fields": [{ "id": "field-...", "name": "Priority", "type": "text" }], "appId": "inst-...", "_id": "..." }
```

**`boards`:**
```json
{ "name": "Sprint Board", "columns": [{ "id": "col-1", "name": "To Do" }], "cards": [{ "id": "card-...", "colId": "col-1", "text": "..." }], "appId": "inst-...", "_id": "..." }
```

---

### CLI reference

```bash
coho login                           # authenticate
coho info <project>                  # show spaces, tokens, endpoints
coho use <space> --projectname <p>   # set active space
coho deploy -p <project>             # deploy index.js
coho log -p <project> -s <space>     # tail logs
```

## Deploy discipline — verify the deploy actually landed

`coho deploy` ships the **local** `codehooks/` folder, not what's on GitHub. If
your local clone is behind, you deploy stale code and chase ghosts. Two failures
that wasted a lot of time here, both invisible without a probe:

1. **Forgetting to pull** — always `git pull origin main` before `coho deploy`.
2. **Deploy not landing / wrong space** — `coho deploy` targets whatever space the
   CLI is logged into; confirm with `coho info` that it resolves to the
   `test-tp2u` space the app's `BACKEND_URL` points at.

**Always verify with a build probe after deploying**, never assume. `routes/ai.js`
exposes `GET /ai/ping` returning `{ build }` (the `AI_BUILD` string) for exactly
this. Bump the marker when you change code, deploy, then hit the probe — if the
number is stale, the deploy didn't ship. A short-lived `/debug/version` route is a
fine throwaway probe for non-AI changes; remove it once confirmed (don't leave
debug routes that dump raw session data in prod).

## Verification

After deploy:
```bash
curl "https://test-tp2u.api.codehooks.io/dev/meta/instances?apikey=YOUR_TOKEN"
```

To test localStorage-only fallback: set `BACKEND_URL = ''` in `shell/config.js`,
reload, confirm full operation without network calls. Set back to the URL to
re-enable cloud.

## Child DOX Index

None.
