import { app, datastore } from 'codehooks-js';

// NOTE: codehooks-js handles CORS natively (it returns the correct
// Access-Control-* headers on its own). Do NOT add an Express-style CORS
// middleware here — codehooks-js Response has no `.header()` / `.sendStatus()`
// methods, so such middleware throws on every request and surfaces in the
// browser as "CORS request did not succeed, status null".

app.get('/lists/:appId', async (req, res) => {
  const db = await datastore.open();
  const data = await db.getOne('lists', { appId: req.params.appId }).catch(() => null);
  if (!data) { res.status(404).json({}); return; }
  res.json(data);
});

app.put('/lists/:appId', async (req, res) => {
  const db = await datastore.open();
  const record = { ...req.body, appId: req.params.appId };
  const existing = await db.getOne('lists', { appId: req.params.appId }).catch(() => null);
  if (existing) {
    await db.updateOne('lists', { appId: req.params.appId }, record);
  } else {
    await db.insertOne('lists', record);
  }
  res.json(record);
});

// ─── Boards (Kanban) ──────────────────────────────────────────────────────

app.get('/boards/:appId', async (req, res) => {
  const db = await datastore.open();
  const data = await db.getOne('boards', { appId: req.params.appId }).catch(() => null);
  if (!data) { res.status(404).json({}); return; }
  res.json(data);
});

app.put('/boards/:appId', async (req, res) => {
  const db = await datastore.open();
  const record = { ...req.body, appId: req.params.appId };
  const existing = await db.getOne('boards', { appId: req.params.appId }).catch(() => null);
  if (existing) {
    await db.updateOne('boards', { appId: req.params.appId }, record);
  } else {
    await db.insertOne('boards', record);
  }
  res.json(record);
});

// ─── Generic collection store ─────────────────────────────────────────────
// Backs gantt, meta/instances, and any future modules.

app.get('/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  const db = await datastore.open();
  const data = await db.getOne(collection, { appId: id }).catch(() => null);
  if (!data) { res.status(404).json({}); return; }
  res.json(data);
});

app.put('/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  const db = await datastore.open();
  const record = { ...req.body, appId: id };
  const existing = await db.getOne(collection, { appId: id }).catch(() => null);
  if (existing) {
    await db.updateOne(collection, { appId: id }, record);
  } else {
    await db.insertOne(collection, record);
  }
  res.json(record);
});

export default app.init();
