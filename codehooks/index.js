import { app, realtime } from 'codehooks-js';

// Realtime pub/sub channel — must be created at deploy time (before routes).
// Clients connect via EventSource: GET /sync/:clientID?apikey=...
// Server publishes on every data mutation via realtime.publishEvent('/sync', ...).
realtime.createChannel('/sync');

// Google's OAuth endpoints are hit by the *browser* (the login redirect) and by
// Google's servers (the callback), neither of which can carry the codehooks API
// key. Whitelist them so they're reachable without a key. Registered before the
// route modules so the middleware applies to them.
app.auth('/auth/google/*', (req, res, next) => next());

// Route modules register their handlers on the shared `app` singleton as a side
// effect of being imported.
import './routes/auth.js';
import './routes/workspaces.js';
import './routes/members.js';
import './routes/invites.js';
import './routes/data.js';
import './routes/ai.js';
import './routes/suggestions.js';

export default app.init();
