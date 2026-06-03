import { BACKEND_URL, API_KEY, GOOGLE_CLIENT_ID } from './config.js';

const SESSION_KEY = 'os-session';
const USER_KEY = 'os-user';

export function getSavedSession() {
  return localStorage.getItem(SESSION_KEY) || null;
}

export function getSavedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export function saveSession(token, user) {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('os-workspace');
}

export async function exchangeGoogleToken(idToken) {
  const r = await fetch(`${BACKEND_URL}/auth/me?apikey=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!r.ok) throw new Error('Auth failed');
  const data = await r.json();
  saveSession(data.sessionToken, {
    userId: data.userId,
    email: data.email,
    name: data.name,
    picture: data.picture,
  });
  return data;
}

export function initGoogleSignIn(callback) {
  if (!window.google?.accounts?.id) {
    console.warn('Google Identity Services not loaded');
    return;
  }
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response) => {
      try {
        const data = await exchangeGoogleToken(response.credential);
        callback(null, data);
      } catch (e) {
        callback(e, null);
      }
    },
  });
}

export function renderGoogleButton(el) {
  window.google?.accounts?.id?.renderButton(el, {
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    width: 280,
  });
}
