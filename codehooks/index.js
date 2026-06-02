import { app, datastore } from 'codehooks-js';

// codehooks-js handles CORS natively. Do not add Express-style middleware.
// res.status() does NOT chain — call it separately before res.json().

async function getOne(collection, appId) {
  const db = await datastore.open();
  return db.getOne(collection, { appId }).catch(() => null);
}

async function upsert(collection, appId, record) {
  const db = await datastore.open();
  const existing = await db.getOne(collection, { appId }).catch(() => null);
  if (existing) {
    await db.updateOne(collection, { appId }, record);
  } else {
    await db.insertOne(collection, record);
  }
  return record;
}

// ─── Lists ────────────────────────────────────────────────────────────────

app.get('/lists/:appId', async (req, res) => {
  const data = await getOne('lists', req.params.appId);
  res.json(data || {});
});

app.put('/lists/:appId', async (req, res) => {
  const record = await upsert('lists', req.params.appId, { ...req.body, appId: req.params.appId });
  res.json(record);
});

// ─── Boards ───────────────────────────────────────────────────────────────

app.get('/boards/:appId', async (req, res) => {
  const data = await getOne('boards', req.params.appId);
  res.json(data || {});
});

app.put('/boards/:appId', async (req, res) => {
  const record = await upsert('boards', req.params.appId, { ...req.body, appId: req.params.appId });
  res.json(record);
});

// ─── Generic (gantt, meta/instances, future modules) ──────────────────────

app.get('/:collection/:id', async (req, res) => {
  const data = await getOne(req.params.collection, req.params.id);
  res.json(data || {});
});

app.put('/:collection/:id', async (req, res) => {
  const record = await upsert(req.params.collection, req.params.id, { ...req.body, appId: req.params.id });
  res.json(record);
});

export default app.init();
