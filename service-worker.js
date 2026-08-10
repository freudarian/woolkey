/**
 * service-worker.js
 * Caches static assets for offline support.
 * Does NOT cache generated passwords or any secrets.
 */

'use strict';

const CACHE_NAME = 'woolkey-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/privacy.html',
  '/security.html',
  '/offline.html',
  '/404.html',
  '/css/main.css',
  '/js/crypto-random.js',
  '/js/entropy.js',
  '/js/password-generator.js',
  '/js/passphrase-generator.js',
  '/js/clipboard.js',
  '/js/ui.js',
  '/js/app.js',
  '/data/words.js',
  '/manifest.webmanifest',
  '/assets/favicon.png',
  '/assets/logo.gif',
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
          return caches.match('/offline.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});
