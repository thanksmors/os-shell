import { app } from 'codehooks-js';
import { kvSet } from '../lib/db.js';

app.post('/suggestions', async (req, res) => {
  const { text, email } = req.body || {};
  if (!text?.trim()) return res.json({ error: 'text required' }, 400);
  const key = `suggestion:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await kvSet(key, { key, text: text.trim(), email: email || 'anonymous', createdAt: new Date().toISOString() });
  res.json({ ok: true });
});
