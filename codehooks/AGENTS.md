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

**AI generation architecture:**
- POST handler calls MiniMax **synchronously** inside the HTTP handler with a 55s `AbortController` (just under Codehooks' 60s HTTP limit).
- The job/poll pattern is preserved: result is written to the `ai_jobs` collection before the POST returns; the frontend polls and finds it done on the first check.
- Worker definition (`app.worker`) is a no-op stub — it exists to satisfy the `conn.enqueue` call shape but does nothing. The real work happens in the POST handler.
- **On Codehooks PRO plan** with the 120s worker timeout working: move the MiniMax call back into the worker body and call `conn.enqueue` from the POST route. This removes the 60s ceiling and enables MiniMax-M3 (the higher-quality reasoning model).

**Route path rule:** AI routes use 3-segment paths (`/w/:ws/ai-generate`, `/w/:ws/ai-job`). A 4-segment path like `/w/:ws/ai/generate` collides with the generic data route `/w/:ws/:collection/:id` — never use 4 segments for AI routes.

**Model:** `MiniMax-M2.7-highspeed` with `response_format: { type: 'json_object' }` and `max_tokens: 16384`. `response_format` is required — without it the model replies conversationally instead of emitting JSON. MiniMax-M3 is higher quality but takes 40–90s and only works reliably on the PRO plan (120s worker timeout).

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

**4. `upsertOne` may not exist**

Use the explicit get → insert/update pattern:

```js
const existing = await db.getOne(collection, { appId }).catch(() => null);
if (existing) {
  await db.updateOne(collection, { appId }, record);
} else {
  await db.insertOne(collection, record);
}
```

**5. `res.json(null)` sends empty body**

Return `res.json({})` for not-found cases. The frontend treats a zero-key object
as not-found and falls back to defaults. Sending `null` causes `JSON.parse` to
throw on the client.

**6. Endpoint format**

Use `https://test-tp2u.api.codehooks.io/dev`. The `crunchy-universe-a06e.codehooks.io`
alias does not work with the `/dev` path suffix.

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
