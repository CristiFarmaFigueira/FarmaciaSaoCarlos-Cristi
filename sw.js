/* Farmácia São Carlos - Cristi — Service Worker */
const CACHE_VERSION = 'farma-v1-20260801';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const CDN_CACHE = CACHE_VERSION + '-cdn';
const IMG_CACHE = CACHE_VERSION + '-img';

const SHELL_URLS = [
  './',
  './index.html',
  './config.js'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

const IMG_HOSTS = [
  'images.unsplash.com'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      return cache.addAll(SHELL_URLS).catch(function() {
        // Alguns arquivos podem falhar offline na instalação; segue mesmo assim
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
  return url.hostname.indexOf('jsonbin.io') !== -1 ||
    url.hostname.indexOf('api.') === 0;
}

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // API JSONBin: sempre rede (dados frescos); fallback cache se offline
  if (isAPI(url)) {
    event.respondWith(
      fetch(req).then(function(res) {
        return res;
      }).catch(function() {
        return caches.match(req);
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

  // CDN (Tailwind, FontAwesome, fonts): stale-while-revalidate
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

  // Mesmo origin (HTML/JS): network-first, fallback cache
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
  }
});
