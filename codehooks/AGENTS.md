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
| POST | `/w/:workspaceId/ai-generate` | clarify/plan run inline; build/revise enqueue to the worker and return `{ jobId }` instantly. `inline: true` in the body forces build/revise inline (highspeed model, 50s budget) — the frontend's queue-dead fallback. |
| GET | `/w/:workspaceId/ai-job?job=` | Poll job status. Returns `{ status, module, error, raw, workerStartedAt }`. |

**AI generation architecture (PRO plan, worker mode):**
- `clarify`/`plan` modes run **synchronously** in the POST handler on `MiniMax-M2.7-highspeed` with a 55s `AbortController` — fast interactive modes, result written to the `ai_job:` KV before the POST returns.
- `build`/`revise` modes are **enqueued to the real worker** (`ai-generate-worker`, `{ timeout: 120000, workers: 1 }`) which runs `MiniMax-M3` with a 110s `AbortController`. POST returns the jobId instantly; the frontend polls (`aiRequest` in `shell/api.js`, 240s cap).
- Worker payload is parsed defensively (`req.body?.payload ?? req.body`) — delivery shape varies. On pickup the worker writes `{ status: 'building', workerStartedAt }` BEFORE the LLM call, so polling distinguishes "worker never ran" (`pending` forever) from "LLM slow/killed" (`building`, then nothing). It writes `done`/`error` at the end and calls `res.end()`.
- **Worker-health routing (queue-dead fallback):** every worker that runs stamps KV `worker_ping`. The POST handler checks the stamp: no stamp in 24h → queue workers don't fire on this plan → build/revise run **inline directly** (highspeed model, 50s budget) with no 20s discovery penalty. Self-healing: after a plan upgrade, one `GET /ai/ping` (its `ping-worker` stamps on success) restores the M3 worker path. The frontend's 20s `pending` → `inline: true` retry remains as a second safety net. `GET /ai/ping → workerAlive` tells you which world you're in. **Confirmed 2026-06-13: workerAlive=true — the M3 worker path is active.**
- The job/poll contract: `POST → { jobId }`, `GET /w/:ws/ai-job?job= → { status, module, error, raw, workerStartedAt }`.

**Route path rule:** AI routes use 3-segment paths (`/w/:ws/ai-generate`, `/w/:ws/ai-job`). A 4-segment path like `/w/:ws/ai/generate` collides with the generic data route `/w/:ws/:collection/:id` — never use 4 segments for AI routes.

**Models:** `MiniMax-M2.7-highspeed` for clarify/plan (max_tokens 1024/2048); `MiniMax-M3` for build/revise (max_tokens 16384, runs in the worker — M3 takes 40–90s and emits `<think>` blocks, which `extractModuleJson` strips). No `response_format` param — it caused request hangs; JSON extraction is handled by `extractModuleJson` instead.

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

**8. KV store — ALWAYS go through `kvSet`/`kvGet`, never raw `db.set`/`db.get`**

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

TTL is in **seconds**; expired keys auto-delete. Current KV users (all via the
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
