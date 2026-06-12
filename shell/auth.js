import { BACKEND_URL, API_KEY } from './config.js';

const SESSION_KEY = 'os-session';
const USER_KEY = 'os-user';

export function getSavedSession() {
  return localStorage.getItem(SESSION_KEY) || null;
}

export function getSavedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('os-workspace');
}

// ─── Server-side OAuth 2.0 Authorization Code flow ─────────────────────────────
// No Google library, no FedCM, no per-origin registration. We hand the browser
// off to our backend, which drives the whole Google handshake and redirects back
// with a session token. Google only ever sees our fixed backend redirect URI.

// Send the browser to the backend, which redirects on to Google. `return` tells
// the backend where to send the user back to once a session is minted. The full
// query string is preserved so params like ?invite= survive the OAuth round trip
// (the backend callback appends &session= when the URL already has a query).
export function startGoogleLogin() {
  const ret = window.location.origin + window.location.pathname + window.location.search;
  window.location.href = `${BACKEND_URL}/auth/google/login?return=${encodeURIComponent(ret)}`;
}

// On page load, pull a freshly-issued ?session= (and surface any ?auth_error=)
// from the backend redirect, then scrub them from the URL. Returns the session
// token if one was present.
export function consumeAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  const error = params.get('auth_error');

  if (session) localStorage.setItem(SESSION_KEY, session);

  if (session || error) {
    params.delete('session');
    params.delete('auth_error');
    const qs = params.toString();
    history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  return { session: session || null, error: error || null };
}

// Fetch the current user's profile using a session token.
export async function fetchMe(sessionToken) {
  const r = await fetch(`${BACKEND_URL}/me?apikey=${API_KEY}&session=${encodeURIComponent(sessionToken)}`);
  if (!r.ok) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
