// Susak Peaks – Service Worker: macht die App installierbar und offline startbar.
// Strategie: erst Netzwerk (damit Updates sofort ankommen), ohne Verbindung aus dem Cache.
const CACHE = 'susak-peaks-v13';

const CORE = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/config.js',
  'js/engine.js',
  'js/sfx.js',
  'js/particles.js',
  'js/ui.js',
  'js/boot.js',
  'assets/bergretter.webp',
  'assets/king.webp',
  'assets/knife.webp',
  'assets/eagle.webp',
  'assets/snowcat.webp',
  'assets/sun.webp',
  'assets/snowflake.webp',
  'assets/helmet.webp',
  'assets/dealer-wait.webp',
  'assets/dealer-reveal-blank.webp',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  // Schriften ändern sich nie: aus dem Cache, sonst laden und merken
  if (isFont) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  // Eigene Dateien: Netzwerk zuerst, Kopie in den Cache; offline aus dem Cache (Versionsparameter ignorieren)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
