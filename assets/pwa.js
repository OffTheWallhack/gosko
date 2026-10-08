/* Pridanie na plochu: service worker + banner. Na /hra (body.game-app) sa ponúka appka Ghoskate
   (app.js tam prepne <link rel="manifest"> na ghoskate.webmanifest), inde web GOSko. */
const KEY = 'gosko:install-dismissed';
const inGame = () => document.body.classList.contains('game-app');
const key = () => (inGame() ? KEY + ':hra' : KEY);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const dismissedRecently = () => { try { return Date.now() - Number(localStorage.getItem(key()) || 0) < 14 * 864e5; } catch { return false; } };

export function initPwa() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (standalone()) return;
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; show(); });
  if (isIos()) setTimeout(show, 3500);

  function show() {
    if (document.querySelector('.install') || dismissedRecently()) return;
    const game = inGame(), name = game ? 'Ghoskate' : 'GOSko';
    const bar = document.createElement('div');
    bar.className = 'install'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', `Pridať ${name} na plochu`);
    bar.innerHTML = `<img src="${game ? 'icons/ghoskate-192.png' : 'icons/icon-192.png'}" alt="" width="44" height="44">
      <p><strong>Pridaj si ${name} na plochu.</strong> <span>${deferred ? (game ? 'Hru budeš mať ako samostatnú appku.' : 'Rebríček a eventy budeš mať po ruke ako appku.') : 'V Safari ťukni na Zdieľať a potom „Pridať na plochu“.'}</span></p>
      ${deferred ? '<button class="btn primary small" type="button" data-install>Pridať</button>' : ''}
      <button class="x" type="button" aria-label="Zavrieť" data-close>✕</button>`;
    bar.querySelector('[data-close]').addEventListener('click', () => { try { localStorage.setItem(key(), String(Date.now())); } catch {} bar.remove(); });
    bar.querySelector('[data-install]')?.addEventListener('click', async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; bar.remove(); });
    document.body.append(bar);
  }
}
