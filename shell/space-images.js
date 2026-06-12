// Rotating space photography for the auth screen backdrop.
// Wikimedia Special:FilePath URLs are stable redirects that support hotlinking.
// Unsplash CDN supports hotlinking under the Unsplash license.
// Each entry has an onerror fallback — a dead URL is simply hidden, the gradient shows instead.
export const SPACE_IMAGES = [
  { id: 'saturn-equinox',   name: 'Saturn at Equinox',       credit: 'NASA/JPL-Caltech/SSI · Cassini',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Saturn_during_Equinox.jpg?width=2560' },
  { id: 'pillars',          name: 'Pillars of Creation',      credit: 'NASA/ESA/CSA/STScI · JWST',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pillars_of_Creation_(NIRCam_Image).jpg?width=2560' },
  { id: 'carina',           name: 'Cosmic Cliffs, Carina',    credit: 'NASA/ESA/CSA/STScI · JWST',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Carina_Nebula_(NIRCam_Image)_(weic2205a).jpg?width=2560' },
  { id: 'milkyway',         name: 'Milky Way',                credit: 'Vincentiu Solomon · Unsplash',
    url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=2560&q=85&fm=jpg&fit=crop' },
  { id: 'aurora',           name: 'Aurora Borealis',          credit: 'Jonatan Pie · Unsplash',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=2560&q=85&fm=jpg&fit=crop' },
  { id: 'starry-mountains', name: 'Stars over the Mountains', credit: 'Kym Ellis · Unsplash',
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=2560&q=85&fm=jpg&fit=crop' },
  { id: 'deep-sky',         name: 'Deep Sky',                 credit: 'Greg Rakozy · Unsplash',
    url: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=2560&q=85&fm=jpg&fit=crop' },
];
