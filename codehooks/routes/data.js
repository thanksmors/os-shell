import { app, datastore, realtime } from 'codehooks-js';
import { dbGet, dbUpsert, kvGet } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';
import { recordChange } from '../lib/changes.js';
import { mergeDoc } from '../lib/merge.js';

// Publish a change event to all workspace listeners via SSE.
// clientId is the tab that made the write — used by that tab to suppress its own echo.
async function publishChange(workspaceId, collection, id, clientId) {
  try {
    await realtime.publishEvent(
      '/sync',
      { workspaceId, collection, id, ts: Date.now(), clientId: clientId || null },
      { workspaceId }
    );
  } catch {}
}

// ─── SSE listener registration ────────────────────────────────────────────────
// 3-segment path (4 segments would collide with the generic data route below).

app.post('/w/:workspaceId/sse-listener', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const listener = await realtime.createListener('/sync', { workspaceId: req.params.workspaceId });
  res.json({ listenerId: listener._id });
});

// ─── Workspace-scoped data routes ─────────────────────────────────────────────

app.get('/w/:workspaceId/instances', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const data = await dbGet('ws_instances', req.params.workspaceId);
  res.json(data || {});
});

app.put('/w/:workspaceId/instances', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const record = await dbUpsert('ws_instances', req.params.workspaceId, req.body);
  await recordChange(req.params.workspaceId, 'instances', 'instances');
  await publishChange(req.params.workspaceId, 'meta', 'instances', req.query.client);
  res.json(record);
});

app.get('/w/:workspaceId/changes', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  // Read the same KV feed `recordChange` writes to. (Previously read a `_changes`
  // collection that nothing wrote — the polling fallback got nothing back.)
  const feed = await kvGet(`changes:${req.params.workspaceId}`);
  res.json(feed || {});
});

app.get('/w/:workspaceId/:collection/:id', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const { workspaceId, collection, id } = req.params;
  const db = await datastore.open();
  const data = await db.getOne(collection, { workspaceId, appId: id }).catch(() => null);
  res.json(data || {});
});

app.put('/w/:workspaceId/:collection/:id', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const { workspaceId, collection, id } = req.params;
  const db = await datastore.open();
  const current = await db.getOne(collection, { workspaceId, appId: id }).catch(() => null);
  const merged  = mergeDoc(current, req.body, collection);
  const record  = { ...merged, workspaceId, appId: id };
  await db.updateOne(collection, { workspaceId, appId: id }, record, {}, { upsert: true });
  await recordChange(workspaceId, collection, id);
  await publishChange(workspaceId, collection, id, req.query.client);
  res.json(record);
});

app.delete('/w/:workspaceId/:collection/:id', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const { workspaceId, collection, id } = req.params;
  const db = await datastore.open();
  await db.removeOne(collection, { workspaceId, appId: id }).catch(() => {});
  await recordChange(workspaceId, collection, id);
  await publishChange(workspaceId, collection, id, req.query.client);
  res.json({});
});
