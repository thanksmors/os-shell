// Shared configuration constants for the backend.

export const GOOGLE_CLIENT_ID = '424699749757-82n32i85givjhrlnoqgisjc85sk530mk.apps.googleusercontent.com';

// Secret lives in a codehooks environment variable, never in source. Set it with:
//   coho set-env GOOGLE_CLIENT_SECRET '<your-secret>' --space dev
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// This space's own public base URL. Google redirects here after sign-in, so it
// must exactly match an Authorized redirect URI in the Google Cloud console:
//   https://test-tp2u.api.codehooks.io/dev/auth/google/callback
export const SELF_URL = 'https://test-tp2u.api.codehooks.io/dev';

export const REDIRECT_URI = `${SELF_URL}/auth/google/callback`;
