import { app, datastore } from 'codehooks-js';
import { dbGet, dbUpsert } from '../lib/db.js';
import { getSessionUser, sendUnauth } from '../lib/session.js';
import { recordChange } from '../lib/changes.js';

// ─── Workspace-scoped data routes ────────────────────────────────────────────

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
  res.json(record);
});

app.get('/w/:workspaceId/changes', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const data = await dbGet('_changes', `ws:${req.params.workspaceId}:changes`);
  res.json(data?.changes || {});
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
  const record = { ...req.body, workspaceId, appId: id };
  await db.updateOne(collection, { workspaceId, appId: id }, record, {}, { upsert: true });
  await recordChange(workspaceId, collection, id);
  res.json(record);
});
