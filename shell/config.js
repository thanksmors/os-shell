// Set BACKEND_URL to your Codehooks space URL to enable cloud persistence.
// Leave empty to use localStorage (works offline, no setup needed).
//
// Codehooks serves your REST API under the space name (default: "dev"),
// so the URL includes the "/dev" suffix.
export const BACKEND_URL = 'https://crunchy-universe-a06e.codehooks.io/dev';

// Your Codehooks API key (only needed when BACKEND_URL is set).
// Sent as the "x-apikey" header on every request.
export const API_KEY = 'ef1c4edb-8fc0-4e94-8bb8-3467b3633043';
