# Alpine OS Shell — Codehooks Backend

This is the cloud persistence layer. It stores list, board, gantt, instance,
and desktop-layout data so the shell syncs across devices instead of living in
`localStorage`.

## What it serves

| Route                    | Used by                          |
|--------------------------|----------------------------------|
| `GET/PUT /lists/:appId`  | List module                      |
| `GET/PUT /boards/:appId` | Kanban module                    |
| `GET/PUT /gantt/:appId`  | Gantt module (generic route)     |
| `GET/PUT /meta/instances`| Desktop generator instances      |
| `GET/PUT /desktop-layout`| Reserved for window layout sync  |
| `GET/PUT /:collection/:id` | Generic fallback for any module |

## Deploy

From this `codehooks/` directory:

```bash
npm install -g codehooks                 # one-time: install the CLI
npm install                              # install codehooks-js
coho login                               # authenticate
coho deploy                              # deploy index.js to your space
```

Your space is `crunchy-universe-a06e`, so the REST API will be live at:

```
https://crunchy-universe-a06e.codehooks.io/dev
```

(`/dev` is the default space name — `coho deploy` shows the exact URL.)

## Connect the frontend

`shell/config.js` is already wired to this space:

```js
export const BACKEND_URL = 'https://crunchy-universe-a06e.codehooks.io/dev';
export const API_KEY = 'ef1c4edb-...';
```

To go back to offline/localStorage mode, set `BACKEND_URL = ''`.

## Auth note

The API key in `shell/config.js` ships to the browser — it is **not secret**.
Anyone who loads the app can read it and call your space. For a personal tool
that's fine. If you later make this public, create a read/write-scoped token
(not your admin key) and consider Codehooks' row-level auth.
