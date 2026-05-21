const CACHE_NAME = 'bts-army-fixture-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/data.js',
  './js/app.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/bts-logo.png',
  './assets/bts-favicon.png',
  './assets/bts-bg.jpg'
];

// Install Event - Pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Serve cached assets when offline, network-first for remote files
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for GitHub raw data or API calls, so users get live scores if online
  if (url.hostname === 'raw.githubusercontent.com' || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response to store it in cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If offline, try fetching from cache
          return caches.match(event.request);
        })
    );
  } else {
    // Cache-first for static local files
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          // If it's a valid local request, cache it
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch((err) => {
          console.warn('[Service Worker] Falló la petición a la red para:', event.request.url, err);
          // Retornar una respuesta vacía o un error de red controlado para evitar que falle el service worker
          return new Response('Network error', { status: 408, statusText: 'Network Error' });
        });
      })
    );
  }
});
