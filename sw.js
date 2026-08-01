/* Farmácia São Carlos - Cristi — Service Worker (cache dinâmico v4) */
const CACHE_VERSION = 'farma-v4-20260801';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const CDN_CACHE = CACHE_VERSION + '-cdn';
const IMG_CACHE = CACHE_VERSION + '-img';
const DYNAMIC_CACHE = CACHE_VERSION + '-dynamic';

const MAX_IMG_ENTRIES = 80;
const MAX_DYNAMIC_ENTRIES = 40;

/* NÃO incluir config.js — segredos admin */
const SHELL_URLS = [
  './',
  './index.html',
  './app.js',
  './app.css',
  './manifest.webmanifest',
  './sw.js'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

const IMG_HOSTS = ['images.unsplash.com'];

function isConfig(url) {
  return /\/config(\.example)?\.js$/i.test(url.pathname);
}
function isCDN(url) {
  return CDN_HOSTS.some(function(h) { return url.hostname === h; });
}
function isImg(url) {
  return IMG_HOSTS.some(function(h) { return url.hostname === h; }) ||
    /\.(png|jpg|jpeg|webp|gif|svg|avif|ico)(\?|$)/i.test(url.pathname);
}
function isAPI(url) {
  // Hostname exato (evita falso positivo tipo evil-jsonbin.io.attacker.com)
  var host = (url.hostname || '').toLowerCase();
  return host === 'api.jsonbin.io' || host === 'jsonbin.io';
}

/** Limita tamanho do cache (FIFO aproximado — remove entradas mais antigas) */
function trimCache(cacheName, max) {
  return caches.open(cacheName).then(function(cache) {
    return cache.keys().then(function(keys) {
      if (keys.length <= max) return;
      var excess = keys.length - max;
      return Promise.all(keys.slice(0, excess).map(function(req) {
        return cache.delete(req);
      }));
    });
  });
}

function putAndTrim(cacheName, request, response, max) {
  if (!response || !response.ok) return Promise.resolve(response);
  var copy = response.clone();
  return caches.open(cacheName).then(function(cache) {
    return cache.put(request, copy).then(function() {
      return trimCache(cacheName, max);
    });
  }).then(function() { return response; }).catch(function() { return response; });
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      return cache.addAll(SHELL_URLS).catch(function() { return Promise.resolve(); });
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key.indexOf('farma-') === 0 && key.indexOf(CACHE_VERSION) !== 0) {
          return caches.delete(key);
        }
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

/** Mensagens do cliente (ex.: limpar caches, métricas) */
self.addEventListener('message', function(event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(k) {
          return k.indexOf('farma-') === 0;
        }).map(function(k) { return caches.delete(k); }));
      })
    );
  }
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 1) config.js — nunca cachear
  if (isConfig(url)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(function() {
        return new Response('/* config offline */', {
          headers: { 'Content-Type': 'application/javascript' }
        });
      })
    );
    return;
  }

  // 2) API JSONBin — só rede (dados frescos)
  if (isAPI(url)) {
    event.respondWith(
      fetch(req).catch(function() { return caches.match(req); })
    );
    return;
  }

  // 3) Imagens — cache-first + limite dinâmico
  if (isImg(url)) {
    event.respondWith(
      caches.open(IMG_CACHE).then(function(cache) {
        return cache.match(req).then(function(hit) {
          if (hit) return hit;
          return fetch(req).then(function(res) {
            return putAndTrim(IMG_CACHE, req, res, MAX_IMG_ENTRIES);
          });
        });
      }).catch(function() { return fetch(req); })
    );
    return;
  }

  // 4) CDN — stale-while-revalidate
  if (isCDN(url)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(req).then(function(hit) {
          var net = fetch(req).then(function(res) {
            if (res && res.ok) {
              try { cache.put(req, res.clone()); } catch (e) {}
            }
            return res;
          }).catch(function() { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // 5) Mesma origem (shell) — network-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(function(res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function(cache) {
            try { cache.put(req, copy); } catch (e) {}
          });
        }
        return res;
      }).catch(function() {
        return caches.match(req).then(function(hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // 6) Cache dinâmico — outros GETs de terceiros (runtime)
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then(function(cache) {
      return cache.match(req).then(function(hit) {
        var net = fetch(req).then(function(res) {
          if (res && res.ok && res.type === 'basic') {
            return putAndTrim(DYNAMIC_CACHE, req, res, MAX_DYNAMIC_ENTRIES);
          }
          // opaque cross-origin: guarda se útil
          if (res && res.type === 'opaque') {
            try { cache.put(req, res.clone()); } catch (e) {}
            trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_ENTRIES);
          }
          return res;
        }).catch(function() { return hit; });
        return hit || net;
      });
    }).catch(function() { return fetch(req); })
  );
});
