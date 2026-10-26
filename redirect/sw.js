/* Starý GOSko service worker na GitHub Pages sa týmto vypne: odregistruje sa, zmaže svoju cache
   a otvorené okná načíta znova, aby sa spustilo presmerovanie z index.html na novú doménu.
   localStorage (QR passy) ostáva, ten prenesie index.html. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
  })());
});
