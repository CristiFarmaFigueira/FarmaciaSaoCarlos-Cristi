/* Farmácia São Carlos - Cristi — Service Worker */
const CACHE_VERSION = 'farma-v9-20260811';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const CDN_CACHE = CACHE_VERSION + '-cdn';
const IMG_CACHE = CACHE_VERSION + '-img';

/* NÃO incluir config.js — contém ADMIN_CODE e API_KEY */
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

const IMG_HOSTS = [
  'images.unsplash.com'
];

function isConfig(url) {
  return /\/config(\.example)?\.js$/i.test(url.pathname);
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      return cache.addAll(SHELL_URLS).catch(function() {
        return Promise.resolve();
      });
    }).then(function() {
      return self.skipWaiting();
    })
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
    }).then(function() {
      return self.clients.claim();
    })
  );
});

function isCDN(url) {
  return CDN_HOSTS.some(function(h) { return url.hostname === h; });
}
function isImg(url) {
  return IMG_HOSTS.some(function(h) { return url.hostname === h; }) ||
    /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url.pathname);
}
function isAPI(url) {
  // Host exato (ou subdomínio) — evita falso positivo CodeQL de substring
  var h = (url.hostname || '').toLowerCase();
  return h === 'jsonbin.io' || h === 'api.jsonbin.io' || h.endsWith('.jsonbin.io');
}

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // config.js / config.example.js: NUNCA cachear (segredos admin)
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

  // API JSONBin: sempre rede (nunca cachear dados dinâmicos)
  if (isAPI(url)) {
    event.respondWith(
      fetch(req).catch(function() {
        return new Response(JSON.stringify({ message: 'offline', record: null }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Imagens: cache-first
  if (isImg(url)) {
    event.respondWith(
      caches.open(IMG_CACHE).then(function(cache) {
        return cache.match(req).then(function(hit) {
          if (hit) return hit;
          return fetch(req).then(function(res) {
            if (res && res.ok) {
              try { cache.put(req, res.clone()); } catch (e) {}
            }
            return res;
          });
        });
      }).catch(function() { return fetch(req); })
    );
    return;
  }

  // CDN: stale-while-revalidate
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

  // Mesmo origin: network-first (exceto config, já tratado)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(function(res) {
        if (res && res.ok && !isConfig(url)) {
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
  }
});
