/* Pridanie na plochu: service worker + banner. */
const KEY = 'gosko:install-dismissed';
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const dismissedRecently = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 14 * 864e5; } catch { return false; } };

export function initPwa() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (standalone() || dismissedRecently()) return;
  // ponuku ukážeme až pri druhej návšteve, po sprievodcovi a nie na stránkach s 3D (doska, stavebnica)
  let visits = 1;
  try { visits = Number(localStorage.getItem('gosko:visits') || 0) + 1; localStorage.setItem('gosko:visits', String(visits)); } catch { /* bez úložiska */ }
  if (visits < 2) return;
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; later(); });
  if (isIos()) later();
  function later(n = 0) {
    setTimeout(() => {
      const busy = document.querySelector('.onb, dialog[open]') || ['doska', 'parky'].includes(document.body.dataset.page) || scrollY < 200;
      if (busy) { if (n < 20) later(n + 1); return; }
      show();
    }, n ? 6000 : 8000);
  }

  function show() {
    if (document.querySelector('.install')) return;
    const bar = document.createElement('div');
    bar.className = 'install'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Pridať GOSko na plochu');
    bar.innerHTML = `<img src="icons/icon-192.png" alt="" width="44" height="44">
      <p><strong>Pridaj si GOSko na plochu.</strong> <span>${deferred ? 'Rebríček a eventy budeš mať po ruke ako appku.' : 'V Safari ťukni na Zdieľať a potom „Pridať na plochu“.'}</span></p>
      ${deferred ? '<button class="btn primary small" type="button" data-install>Pridať</button>' : ''}
      <button class="x" type="button" aria-label="Zavrieť" data-close>✕</button>`;
    bar.querySelector('[data-close]').addEventListener('click', () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} bar.remove(); });
    bar.querySelector('[data-install]')?.addEventListener('click', async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; bar.remove(); });
    document.body.append(bar);
  }
}
