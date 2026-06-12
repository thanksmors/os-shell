import { app } from 'codehooks-js';
import { kvSet, kvGet } from '../lib/db.js';

// ─── Debug routes (TEMPORARY — remove after the issue is fixed) ───────────────
// Captures the most recent unhandled exception into KV so we can read it from
// the browser. Pattern matches prior debug routes (a3194de, de866a8, a26a195).

const KV_KEY = 'last_error';

// Express-style error middleware. Codehooks-js supports `app.use((err, req, res, next) => ...)`
// — any unhandled throw inside a route handler passes through here. We log to
// console.error (visible in coho log if it surfaces) AND persist to KV
// (reliable even if coho log truncates async errors).
app.use(async (err, req, res, next) => {
  try {
    const payload = {
      method: req?.method,
      path: req?.path,
      query: req?.query,
      message: err?.message,
      stack: err?.stack,
      ts: Date.now(),
    };
    await kvSet(KV_KEY, payload);
    console.error('[debug] captured unhandled error:', payload);
  } catch {}
  // Let Codehooks' default handler return the generic 500 to the client.
  next(err);
});

app.get('/debug/last-error', async (req, res) => {
  const last = await kvGet(KV_KEY);
  res.json(last || { error: 'none' });
});
