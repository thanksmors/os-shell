import { app } from 'codehooks-js';
import { kvSet, kvGet } from '../lib/db.js';

// ─── Debug routes (TEMPORARY — remove after the issue is fixed) ───────────────
// Captures the most recent unhandled exception into KV so we can read it from
// the browser. Pattern matches prior debug routes (a3194de, de866a8, a26a195).

const KV_KEY = 'last_error';

// Why process.on, not app.use((err, req, res, next) => ...):
// The suspect failure is async — `realtime.createListener` is awaited inside a
// route handler. Even in a fully-Express-compatible framework, async rejections
// do not auto-route to error middleware; they become unhandled promise
// rejections unless the handler explicitly calls next(err). So Express-style
// error middleware would miss the very class of error we're trying to catch.
// Node's process-level listeners are the only capture guaranteed to fire.
process.on('unhandledRejection', (err) => {
  capture('unhandledRejection', err, null);
});
process.on('uncaughtException', (err) => {
  capture('uncaughtException', err, null);
});

function capture(source, err, req) {
  const payload = {
    source,
    method: req?.method,
    path: req?.path,
    query: req?.query,
    message: err?.message,
    stack: err?.stack,
    ts: Date.now(),
  };
  kvSet(KV_KEY, payload).catch(() => {});
  console.error(`[debug] ${source}:`, payload);
}

app.get('/debug/last-error', async (req, res) => {
  const last = await kvGet(KV_KEY);
  res.json(last || { error: 'none' });
});
