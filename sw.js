const CACHE_NAME = 'nexson-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/runtime-config.js',
  './assets/js/config.js',
  './assets/js/store.js',
  './assets/js/auth.js',
  './assets/js/api.js',
  './assets/js/player.js',
  './assets/js/playlists.js',
  './assets/js/views.js',
  './assets/js/search.js',
  './assets/js/ui.js',
  './assets/js/router.js',
  './assets/js/app.js',
  './assets/css/nexson-ui.css',
  './assets/css/nexson-nowplaying.css',
  './assets/js/nexson-ui.js',
  './assets/icons/nexson.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
