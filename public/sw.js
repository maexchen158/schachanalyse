// Service Worker: macht die App installierbar und startet sie auch offline.
//
// - App-Dateien: erst aus dem Netz (damit Updates sofort ankommen), ohne Netz aus dem Speicher.
// - Bibliotheken unter vendor/ (u. a. die ~95 MB große Engine): aus dem Speicher,
//   nur beim ersten Mal aus dem Netz. Ihre Dateinamen enthalten die Version.
// - Fremde Adressen (Lichess, Chess.com) laufen unverändert am Speicher vorbei.

const CACHE = 'schachanalyse-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  const isVendor = url.pathname.includes('/vendor/');
  event.respondWith(isVendor ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
