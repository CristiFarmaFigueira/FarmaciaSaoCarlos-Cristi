/* Farmácia São Carlos - Cristi — Service Worker (3 arquivos: index + config + sw) */
const CACHE_VERSION = 'farma-v21-20260831-voz';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const CDN_CACHE = CACHE_VERSION + '-cdn';
const IMG_CACHE = CACHE_VERSION + '-img';

/* Não cachear config.js de forma agressiva (pode mudar no PC da farmácia) */
const SHELL_URLS = [
  './',
  './index.html',
  './sw.js'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL_URLS).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('farma-') === 0 && k.indexOf(CACHE_VERSION) !== 0;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Navegação: network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Não interceptar config.js (sempre rede quando possível)
  if (url.pathname.indexOf('config.js') !== -1) {
    event.respondWith(
      fetch(req).catch(function () { return caches.match(req); })
    );
    return;
  }

  var isCdn = CDN_HOSTS.some(function (h) { return url.hostname.indexOf(h) !== -1; });
  var isImg = /\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(url.pathname) || url.hostname.indexOf('firebasestorage') !== -1;

  if (isCdn) {
    event.respondWith(
      caches.open(CDN_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var fetchP = fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || fetchP;
        });
      })
    );
    return;
  }

  if (isImg) {
    event.respondWith(
      caches.open(IMG_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
  }
});
