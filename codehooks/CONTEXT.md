# codehooks/ — Cloud Backend

REST API backend deployed to Codehooks (https://codehooks.io). Provides
cross-device persistence for all module data and the desktop instance registry.

The shell works fully offline without this — `shell/api.js` falls back to
localStorage automatically when `BACKEND_URL` is empty in `shell/config.js`.

---

## Files

- `index.js` — Route handlers (deploy this)
- `package.json` — `codehooks-js` dependency
- `README.md` — Deploy instructions

---

## Routes

| Method | Path | Collection | Description |
|---|---|---|---|
| GET | `/lists/:appId` | `lists` | Fetch list data |
| PUT | `/lists/:appId` | `lists` | Save list data |
| GET | `/boards/:appId` | `boards` | Fetch kanban board |
| PUT | `/boards/:appId` | `boards` | Save kanban board |
| GET | `/:collection/:id` | any | Generic get (gantt, meta, etc.) |
| PUT | `/:collection/:id` | any | Generic upsert |

The generic catch-all routes back every collection the shell uses without
needing a specific route per module. Adding a new module that persists data
requires no backend changes.

---

## Deploy

```bash
cd codehooks/
npm install
coho login
coho use dev --projectname test-tp2u
coho deploy -p test-tp2u
```

Verify:
```bash
curl "https://test-tp2u.api.codehooks.io/dev/meta/instances?apikey=YOUR_TOKEN"
```

---

## Codehooks-specific learnings

### Authentication
The token must be sent as a **query parameter**, not a request header:
```
GET /dev/meta/instances?apikey=ef1c4edb-...
```

Using a custom `x-apikey` header triggers CORS preflight (`OPTIONS` request).
Codehooks' native CORS does not list custom headers in `Access-Control-Allow-Headers`,
so the browser blocks the actual request. The `apikey` query param bypasses
preflight entirely because `GET`/`PUT` with `Content-Type: application/json`
and no custom headers is a "simple request" from a CORS perspective.

### CORS middleware — do NOT add it
codehooks-js `res` is not an Express `Response`. It does not have:
- `res.header(name, value)` — throws `t.header is not a function`
- `res.sendStatus(code)` — throws
- `res.status(code).json(data)` — `.status()` does not return `res`, so chaining crashes

codehooks-js handles CORS natively. Adding Express-style CORS middleware breaks
every single request and surfaces as "CORS request did not succeed, status null"
in the browser with no obvious cause.

### res.json(null) sends empty body
When a record is not found, return `res.json({})` (empty object), not
`res.json(null)`. Codehooks sends an empty response body for `null`, which
causes `JSON.parse` to throw on the client.

The frontend treats `{}` (zero keys) as "not found" and falls back to defaults.

### getOne throws on miss
`db.getOne(collection, query)` throws when no record matches — it does not
return `null`. Always append `.catch(() => null)`:
```js
const data = await db.getOne('lists', { appId }).catch(() => null);
```

### upsertOne may not exist
Some codehooks-js versions don't have `upsertOne`. Use the explicit pattern:
```js
const existing = await db.getOne(collection, { appId }).catch(() => null);
if (existing) {
  await db.updateOne(collection, { appId }, record);
} else {
  await db.insertOne(collection, record);
}
```

### Space vs project
- **Project** (`test-tp2u`) — the top-level container, has a name and members
- **Space** (`dev`) — deployment environment within a project (dev/prod)
- API endpoint: `https://test-tp2u.api.codehooks.io/dev`
- The `crunchy-universe-a06e.codehooks.io` alias points to the same space but
  does NOT work with the `/dev` path suffix — use the `test-tp2u.api` form

### CLI reference
```bash
coho login                          # authenticate
coho info <project>                 # show spaces, tokens, endpoints
coho use <space> --projectname <p>  # set active space
coho deploy -p <project>            # deploy index.js
coho log -p <project> -s <space>    # tail logs
```

---

## Data shapes stored in Codehooks

All records include an `appId` field (used as the lookup key) and a Codehooks
internal `_id`.

**`meta` collection, id `instances`:**
```json
{
  "list": [
    { "instanceId": "inst-...", "appId": "list", "name": "My Todo", "icon": "📋" }
  ],
  "appId": "instances",
  "_id": "..."
}
```

**`lists` collection:**
```json
{
  "name": "My Todo",
  "items": [{ "id": "item-...", "text": "...", "checked": false, "fieldValues": {} }],
  "fields": [{ "id": "field-...", "name": "Priority", "type": "text" }],
  "appId": "inst-...",
  "_id": "..."
}
```

**`boards` collection:**
```json
{
  "name": "Sprint Board",
  "columns": [{ "id": "col-1", "name": "To Do" }],
  "cards": [{ "id": "card-...", "colId": "col-1", "text": "..." }],
  "appId": "inst-...",
  "_id": "..."
}
```

**`gantt` collection:**
```json
{
  "name": "Roadmap",
  "viewMonths": 12,
  "projects": [{ "id": "proj-...", "name": "Launch", "startDate": "2026-01-01", "endDate": "2026-03-31", "color": "#007aff" }],
  "appId": "inst-...",
  "_id": "..."
}
```
