/* GOSko service worker: web funguje aj offline a dá sa pridať na plochu.
   Pri zmene webu zvýš číslo verzie. */
const VERSION = 'gosko-v3';
const SHELL = ['./', 'index.html', 'data.js', 'assets/style.css', 'assets/app.js', 'assets/board.js', 'assets/park.js',
  'assets/store.js', 'assets/deco.js', 'assets/badges.js', 'assets/card.js', 'assets/qr.js', 'assets/map.js', 'assets/pwa.js',
  'img/logo.webp', 'img/sticker-cut.webp', 'icons/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.includes('youtube') || url.hostname.includes('ytimg') || url.hostname.includes('openstreetmap')) return;
  const sameOrigin = url.origin === self.location.origin;
  const isImage = req.destination === 'image';
  if (sameOrigin && !isImage) {
    // kód a dáta: najprv sieť (aby bola vždy čerstvá verzia), offline z cache
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else {
    // obrázky, fonty, knižnice: najprv cache
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
