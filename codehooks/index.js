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

// Record a change timestamp for cross-client sync polling
async function recordChange(collection, id) {
  try {
    const db = await datastore.open();
    const feed = await db.getOne('_changes', { appId: 'feed' }).catch(() => null);
    const changes = feed?.changes || {};
    changes[`${collection}:${id}`] = Date.now();
    if (feed) {
      await db.updateOne('_changes', { appId: 'feed' }, { appId: 'feed', changes });
    } else {
      await db.insertOne('_changes', { appId: 'feed', changes });
    }
  } catch {}
}

// ─── Changes feed (for cross-client polling) ──────────────────────────────

app.get('/changes', async (req, res) => {
  const db = await datastore.open();
  const feed = await db.getOne('_changes', { appId: 'feed' }).catch(() => null);
  res.json(feed?.changes || {});
});

// ─── Lists ────────────────────────────────────────────────────────────────

app.get('/lists/:appId', async (req, res) => {
  const data = await getOne('lists', req.params.appId);
  res.json(data || {});
});

app.put('/lists/:appId', async (req, res) => {
  const record = await upsert('lists', req.params.appId, { ...req.body, appId: req.params.appId });
  await recordChange('lists', req.params.appId);
  res.json(record);
});

// ─── Boards ───────────────────────────────────────────────────────────────

app.get('/boards/:appId', async (req, res) => {
  const data = await getOne('boards', req.params.appId);
  res.json(data || {});
});

app.put('/boards/:appId', async (req, res) => {
  const record = await upsert('boards', req.params.appId, { ...req.body, appId: req.params.appId });
  await recordChange('boards', req.params.appId);
  res.json(record);
});

// ─── Generic (gantt, meta/instances, future modules) ──────────────────────

app.get('/:collection/:id', async (req, res) => {
  const data = await getOne(req.params.collection, req.params.id);
  res.json(data || {});
});

app.put('/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  const record = await upsert(collection, id, { ...req.body, appId: id });
  await recordChange(collection, id);
  res.json(record);
});

export default app.init();
