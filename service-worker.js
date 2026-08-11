/**
 * service-worker.js
 * Caches static assets for offline support.
 * Does NOT cache generated passwords or any secrets.
 */

'use strict';

// Bump on every deploy. The fetch handler is cache-first with no revalidation,
// so a returning visitor keeps serving the old bundle until this string
// changes: that is what triggers the browser to install a new worker, populate
// a fresh cache, and drop the previous one in activate.
const CACHE_NAME = 'woolkey-v12';
const BASE_PATH = self.location.pathname.replace(/[^/]+$/, '');
function assetPath(path) {
  return BASE_PATH + path;
}
// The ?v=4 tokens are a one-off flush for browsers that cached these files
// under the old 7-day expiry. CSS and JS now carry Cache-Control: no-cache, so
// they revalidate on their own — the token does not need bumping again, but it
// must stay identical to the HTML references or the page and this cache will
// ask for two different URLs.
const STATIC_ASSETS = [
  assetPath(''),
  assetPath('index.html'),
  assetPath('privacy.html'),
  assetPath('security.html'),
  assetPath('api.html'),
  assetPath('offline.html'),
  assetPath('404.html'),
  assetPath('403.html'),
  assetPath('css/main.css?v=4'),
  assetPath('css/fireflies.css?v=4'),
  assetPath('js/site.js?v=4'),
  assetPath('js/fireflies.js?v=4'),
  assetPath('js/crypto-random.js?v=4'),
  assetPath('js/user-entropy.js?v=4'),
  assetPath('js/entropy.js?v=4'),
  assetPath('js/password-generator.js?v=4'),
  assetPath('js/passphrase-generator.js?v=4'),
  assetPath('js/agent-api.js?v=4'),
  assetPath('js/api-doc.js?v=4'),
  assetPath('js/clipboard.js?v=4'),
  assetPath('js/ui.js?v=4'),
  assetPath('js/app.js?v=4'),
  assetPath('data/words.js?v=4'),
  assetPath('manifest.webmanifest'),
  assetPath('assets/favicon.png'),
  assetPath('assets/logo.gif'),
  assetPath('assets/postman-icon.svg'),
  assetPath('assets/Inter-Variable.woff2'),
  // Both background photos, so the offline page still gets its scene and a
  // theme switch made offline still has something to fade to. WebP only:
  // the JPGs are a fallback for browsers that predate it, and those predate
  // service workers too.
  assetPath('assets/herd-of-sheep-day.webp'),
  assetPath('assets/herd-of-sheep-night.webp'),
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
