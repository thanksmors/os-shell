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

| Method | Path | Collection | Description |
|---|---|---|---|
| GET/PUT | `/lists/:appId` | `lists` | List module data |
| GET/PUT | `/boards/:appId` | `boards` | Kanban board |
| GET/PUT | `/:collection/:id` | any | Generic catch-all — backs all other collections without dedicated routes |

Adding a new module with persistent data requires **no backend changes**. The
generic `/:collection/:id` route handles it automatically.

**AI generation routes** (`codehooks/routes/ai.js`):

| Method | Path | Description |
|---|---|---|
| GET | `/ai/ping` | Deploy probe — returns `{ build, hasKey, ok }`. Bump `AI_BUILD` string on every change to verify deploys. |
| POST | `/w/:workspaceId/ai-generate` | Runs MiniMax synchronously, writes result to `ai_jobs`, returns `{ jobId }`. Blocks until done (~10–55s). |
| GET | `/w/:workspaceId/ai-job?job=` | Poll job status. Returns `{ status, module, error, raw }`. |

**AI generation architecture (PRO plan, worker mode):**
- `clarify`/`plan` modes run **synchronously** in the POST handler on `MiniMax-M2.7-highspeed` with a 55s `AbortController` — fast interactive modes, result written to the `ai_job:` KV before the POST returns.
- `build`/`revise` modes are **enqueued to the real worker** (`ai-generate-worker`, `{ timeout: 120000, workers: 1 }`) which runs `MiniMax-M3` with a 110s `AbortController`. POST returns the jobId instantly; the frontend polls (`aiRequest` in `shell/api.js`, 150s cap).
- Worker payload: `{ jobId, workspaceId, mode, convo, planType, maxTokens, model }` read from `req.body.payload`. The worker writes `done`/`error` to `ai_job:{jobId}` and calls `res.end()`.
- The job/poll contract is unchanged: `POST → { jobId }`, `GET /w/:ws/ai-job?job= → { status, module, error, raw }`.

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

**4. `updateOne` with `{ upsert: true }` — use instead of get + insert/update**

`dbUpsert` in `lib/db.js` now uses this pattern — one round-trip instead of two:

```js
await db.updateOne(collection, { appId }, record, {}, { upsert: true });
```

The old get → insert/update pattern still works but wastes a read. Do not reintroduce it.

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

**8. KV store — use for ephemeral keys with TTL**

Codehooks exposes `db.set(key, value, { ttl })` / `db.get(key)` on an opened datastore connection. TTL is in **seconds**. Expired keys auto-delete — no cleanup jobs needed.

Use KV (not a collection) for:
- **Sessions** (`lib/session.js`): `db.set(`session:${token}`, { userId }, { ttl: 30 * 24 * 60 * 60 })`
- **Invites** (`routes/invites.js`): `db.set(`invite:${id}`, payload, { ttl: 7 * 24 * 60 * 60 })`
- **AI jobs** (`routes/ai.js`): `db.set(`ai_job:${id}`, payload, { ttl: 10 * 60 })`
- **Changes feed** (`lib/changes.js`): `db.set(`changes:${workspaceId}`, feed)` (no TTL — long-lived)

Do NOT store these in collections — they accumulate stale records forever with no automatic cleanup.

---

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

**`gantt`:**
```json
{ "name": "Roadmap", "viewMonths": 12, "projects": [{ "id": "proj-...", "name": "Launch", "startDate": "2026-01-01", "endDate": "2026-03-31", "color": "#007aff" }], "appId": "inst-...", "_id": "..." }
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
