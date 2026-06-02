import { app, datastore } from 'codehooks-js';

// ─── Lists ────────────────────────────────────────────────────────────────

app.get('/lists/:appId', async (req, res) => {
  const db = await datastore.open();
  const data = await db.getOne('lists', { appId: req.params.appId }).catch(() => null);
  res.json(data || { name: 'My List', items: [] });
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
  res.json(data || {
    name: 'My Board',
    columns: [
      { id: 'col-1', name: 'To Do' },
      { id: 'col-2', name: 'In Progress' },
      { id: 'col-3', name: 'Done' },
    ],
    cards: [],
  });
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
  res.json(data || null);
});

app.put('/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  const db = await datastore.open();
  const record = { ...req.body, appId: id };
  await db.upsertOne(collection, { appId: id }, record);
  res.json(record);
});

export default app.init();
