import { app } from 'codehooks-js';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SELF_URL, REDIRECT_URI } from '../lib/config.js';
import { dbGet } from '../lib/db.js';
import { getSessionUser, sendUnauth, bootstrapSession, verifyGoogleIdToken } from '../lib/session.js';

// ─── Server-side OAuth 2.0 Authorization Code flow ─────────────────────────────
// The browser is sent to /auth/google/login, which redirects to Google. Google
// authenticates the user and redirects back to /auth/google/callback (a fixed,
// pre-registered URL) with a code. We exchange the code for an id_token using the
// client secret, mint a session, and redirect the browser back to the frontend
// with ?session=<token>. The frontend origin is never validated by Google, so
// this works on any port/domain without per-origin registration.

// GET /auth/google/login?return=<frontend-url>
app.get('/auth/google/login', async (req, res) => {
  const ret = req.query?.return || SELF_URL;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: ret,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /auth/google/callback?code=...&state=<frontend-url>
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query?.code;
  const ret = req.query?.state || SELF_URL;
  const back = (err, session) => {
    const sep = ret.includes('?') ? '&' : '?';
    res.redirect(err ? `${ret}${sep}auth_error=${err}` : `${ret}${sep}session=${session}`);
  };

  if (!code) { back('nocode'); return; }

  // Exchange the authorization code for tokens (needs the client secret).
  let tokens;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    tokens = await tokenRes.json().catch(() => null);
  } catch { back('exchange'); return; }
  if (!tokens?.id_token) { back('exchange'); return; }

  const gData = await verifyGoogleIdToken(tokens.id_token);
  if (!gData) { back('verify'); return; }

  let sessionToken;
  try {
    ({ sessionToken } = await bootstrapSession(gData));
  } catch(e) {
    console.error('[auth/callback] bootstrapSession failed:', e);
    back('session_error');
    return;
  }
  back(null, sessionToken);
});

// GET /me — current user profile from session (used by the frontend after the
// callback redirect, to populate name/email/avatar).
app.get('/me', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const user = await dbGet('users', authUser.userId);
  res.json(user || {});
});

// POST /auth/me — legacy GSI token-exchange path (kept for compatibility).
// Body: { idToken } — a Google ID token obtained client-side.
app.post('/auth/me', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) { res.status(400); res.json({ error: 'Missing idToken' }); return; }
  const gData = await verifyGoogleIdToken(idToken);
  if (!gData) { res.status(401); res.json({ error: 'Invalid token' }); return; }
  const payload = await bootstrapSession(gData);
  res.json(payload);
});
