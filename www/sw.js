const CACHE_NAME = 'mm-drive-cache-v34';
const APP_BUILD = 34;
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.png',
  './tailwind.js',
  './jsmediatags.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function isAppShell(url, request) {
  const path = url.pathname;
  return (
    request.mode === 'navigate' ||
    path.endsWith('/') ||
    path.endsWith('index.html') ||
    path.endsWith('manifest.json') ||
    path.endsWith('sw.js') ||
    path.endsWith('app.js') ||
    path.endsWith('style.css')
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.protocol.startsWith('blob') || url.protocol.startsWith('data') || !url.protocol.startsWith('http')) {
    return;
  }

  // Always hit network for version stamp (installed app auto-update)
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() =>
        new Response(JSON.stringify({ build: APP_BUILD }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // App shell: network-first so Cài đặt / lối tắt nhận bản mới
  if (isAppShell(url, event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
