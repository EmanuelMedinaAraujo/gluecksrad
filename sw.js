'use strict';

// Bump this when you change any file so installed apps pick up the new version.
const CACHE = 'gluecksrad-v3';
const ASSETS = [
  './',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first, so the app starts instantly and works without any connection.
// When online, the cached copy is refreshed in the background for the next start.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // One cache entry per file: every page load maps to the start page and query strings are
    // dropped, so a link like "/?utm=x" can never pin an outdated copy.
    const url = new URL(req.url);
    url.search = '';
    url.hash = '';
    const key = req.mode === 'navigate' ? self.registration.scope : url.href;
    const cached = await cache.match(key);

    const refresh = fetch(req.mode === 'navigate' ? key : req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic' && !res.redirected) cache.put(key, res.clone());
        return res;
      })
      .catch(() => undefined);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    const res = await refresh;
    return res || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
