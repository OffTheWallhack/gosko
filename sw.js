/* GOSko service worker: web funguje aj offline a dá sa pridať na plochu.
   Pri zmene webu zvýš číslo verzie. */
const VERSION = 'gosko-v9';
const SHELL = ['./', 'index.html', 'data.js', 'assets/style.css', 'assets/app.js', 'assets/ranking.js', 'assets/util.js', 'assets/board.js', 'assets/park.js',
  'assets/store.js', 'assets/api.js', 'assets/register.js', 'assets/pages.js', 'assets/deco.js', 'assets/badges.js', 'assets/card.js', 'assets/qr.js', 'assets/map.js', 'assets/pwa.js', 'assets/bracket.js', 'assets/crt.js',
  'assets/vendor/supabase-2.117.2.js', 'assets/vendor/qrcode-generator-1.4.4.js',
  'img/logo.webp', 'img/sticker-cut.webp', 'icons/icon-192.png', 'manifest.webmanifest'];
/* cudzie zdroje, ktoré sa smú cachovať (knižnice a fonty s verziou v adrese) */
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const keep = (req, res) => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); };

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  // API (passy, registrácie) ide vždy na server a nikdy do cache
  if (sameOrigin && url.pathname.startsWith('/api/')) return;
  const isImage = req.destination === 'image';
  if (sameOrigin && !isImage) {
    // kód a dáta: najprv sieť (aby bola vždy čerstvá verzia), offline z cache; chybové odpovede (404, 500) sa necachujú
    e.respondWith(fetch(req).then(res => { if (res.ok) keep(req, res); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else if (sameOrigin || isImage || CDN.includes(url.hostname)) {
    // obrázky, fonty, knižnice: najprv cache (OpenStreetMap, YouTube, Supabase a iné API sem nejdú)
    if (/(^|\.)(supabase\.co|openstreetmap\.org|youtube\.com|youtube-nocookie\.com|ytimg\.com)$/.test(url.hostname)) return;
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || (res.type === 'opaque' && isImage)) keep(req, res);
      return res;
    })));
  }
});
