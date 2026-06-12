/* Puglia Green Census — Service Worker per il funzionamento offline */
const CACHE = 'pgc-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/db.js',
  './js/export.js',
  './js/map.js',
  './js/app.js',
  './manifest.webmanifest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js',
  'https://unpkg.com/@mapbox/shp-write@0.4.3/shpwrite.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Tile della mappa: cache-first opportunistico (consente la mappa offline nelle aree già viste).
  const isTile = /tile\.openstreetmap|server\.arcgisonline/.test(url.href);

  // Le richieste cross-origin no-cors (tile, CDN) producono risposte "opache"
  // con status 0: vanno salvate comunque, altrimenti l'offline non funziona.
  const cacheable = (res) => res && (res.ok || res.type === 'opaque');

  if (isTile) {
    e.respondWith(
      caches.open(CACHE).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (cacheable(res)) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
    return;
  }

  // App shell e librerie: cache-first con fallback rete.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (cacheable(res) && (url.origin === location.origin || /unpkg\.com/.test(url.href))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
