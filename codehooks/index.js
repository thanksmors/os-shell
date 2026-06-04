import { app } from 'codehooks-js';

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

export default app.init();
