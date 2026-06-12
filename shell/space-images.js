// Rotating space photography for the auth screen backdrop.
// Images are vendored in /shell/assets/ (originals: Wikimedia Commons / Unsplash).
// Each entry has an onerror fallback — a dead URL is simply hidden, the gradient shows instead.
export const SPACE_IMAGES = [
  { id: 'pillars',          name: 'Pillars of Creation',      credit: 'NASA/ESA/CSA/STScI · JWST',
    url: '/shell/assets/auth-pillars.jpg' },
  { id: 'aurora',           name: 'Aurora Borealis',          credit: 'Jonatan Pie · Unsplash',
    url: '/shell/assets/auth-aurora.jpg' },
];
