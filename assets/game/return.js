/* Návrat do hry po prihlásení odkazom z e-mailu (odkaz otvorí úvod webu). Bez závislostí, aby ho
   app.js mohol načítať hneď a zvyšok hry až na herných stránkach. */
const RETURN_KEY = 'gosko:game-return';
const RETURN_TTL = 30 * 60_000;

/* Hra Ghoskate je appka na /hra (/hra/spot/…, /hra/profil…) pod <base href>; starý tvar #/hra platí tiež. */
export const appBase = () => (typeof document !== 'undefined' ? new URL(document.baseURI).pathname.replace(/[^/]*$/, '') : '/');
/* Aktuálna stránka v tvare '#/…' (tak ju pozná router v app.js). */
export function currentRoute(loc = location, base = appBase()) {
  if (loc.hash.startsWith('#/')) return loc.hash;
  const p = loc.pathname.startsWith(base) ? loc.pathname.slice(base.length) : '';
  return '#/' + decodeURI(p).replace(/\/$/, '');
}
/* '#/hra/spot/x' -> '/hra/spot/x' (pre history.replaceState) */
export const routeUrl = (hash, base = appBase()) => base + String(hash).replace(/^#\//, '');

/* Zapamätá si hernú stránku pred prihlásením. */
export function rememberReturn(hash = currentRoute()) {
  try { localStorage.setItem(RETURN_KEY, JSON.stringify({ hash, at: Date.now() })); } catch { /* bez úložiska */ }
}

/* Raz po prihlásení: kam sa vrátiť ('' = nikam). Starší záznam ako 30 min sa zahodí. */
export function consumeReturn(now = Date.now(), storage = globalThis.localStorage) {
  let v = null;
  try { v = JSON.parse(storage.getItem(RETURN_KEY) || 'null'); storage.removeItem(RETURN_KEY); } catch { return ''; }
  if (!v || typeof v.hash !== 'string' || !/^#\/[\w\-/]*$/.test(v.hash) || !(now - v.at <= RETURN_TTL)) return '';
  return v.hash;
}

/* Staré herné adresy ('#/mapa', '#/spot/x', '#/feed', '#/loadout') -> nová pod '#/hra', inak null.
   Cestu presmeruje už Vercel (vercel.json redirects); toto pokryje hash z e-mailov a zapamätaný návrat. */
export function legacyGameRoute(hash) {
  const m = /^#\/(?:(mapa)|spot\/([\w-]+)|(feed|loadout))$/.exec(hash);
  if (!m) return null;
  return m[1] ? '#/hra' : m[2] ? `#/hra/spot/${m[2]}` : `#/hra/${m[3]}`;
}
/* Herná appka: '#/hra' a všetko pod ňou. */
export const isGameRoute = hash => /^#\/hra(?:\/|$)/.test(hash);
/* Čo patrí do <head> v hre a mimo nej: manifest (inštalácia), názov na ploche iPhonu, farba lišty, ikona. */
export const appHead = game => (game
  ? { manifest: 'ghoskate.webmanifest', title: 'Ghoskate', theme: '#14111C', icon: 'icons/ghoskate-apple-touch.png' }
  : { manifest: 'manifest.webmanifest', title: 'GOSko', theme: '#0e0d0c', icon: 'icons/apple-touch-icon.png' });
