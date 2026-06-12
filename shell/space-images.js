// Rotating space photography for the auth screen backdrop.
// Wikimedia Special:FilePath URLs are stable redirects that support hotlinking.
// Unsplash CDN supports hotlinking under the Unsplash license.
// Each entry has an onerror fallback — a dead URL is simply hidden, the gradient shows instead.
export const SPACE_IMAGES = [
  { id: 'pillars',          name: 'Pillars of Creation',      credit: 'NASA/ESA/CSA/STScI · JWST',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pillars_of_Creation_(NIRCam_Image).jpg?width=2560' },
  { id: 'aurora',           name: 'Aurora Borealis',          credit: 'Jonatan Pie · Unsplash',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=2560&q=85&fm=jpg&fit=crop' },
];
