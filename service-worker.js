/**
 * service-worker.js
 * Caches static assets for offline support.
 * Does NOT cache generated passwords or any secrets.
 */

'use strict';

const CACHE_NAME = 'woolkey-v2';
const BASE_PATH = self.location.pathname.replace(/[^/]+$/, '');
function assetPath(path) {
  return BASE_PATH + path;
}
const STATIC_ASSETS = [
  assetPath(''),
  assetPath('index.html'),
  assetPath('privacy.html'),
  assetPath('security.html'),
  assetPath('offline.html'),
  assetPath('404.html'),
  assetPath('css/main.css'),
  assetPath('js/site.js'),
  assetPath('js/crypto-random.js'),
  assetPath('js/entropy.js'),
  assetPath('js/password-generator.js'),
  assetPath('js/passphrase-generator.js'),
  assetPath('js/clipboard.js'),
  assetPath('js/ui.js'),
  assetPath('js/app.js'),
  assetPath('data/words.js'),
  assetPath('manifest.webmanifest'),
  assetPath('assets/favicon.png'),
  assetPath('assets/logo.gif'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin navigation/assets
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache valid same-origin responses
        if (
          response.ok &&
          response.type === 'basic' &&
          new URL(event.request.url).origin === self.location.origin
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match(assetPath('offline.html'));
        }
        return new Response('', { status: 503 });
      });
    })
  );
});
