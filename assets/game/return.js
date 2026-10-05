/* Návrat do hry po prihlásení odkazom z e-mailu (odkaz otvorí úvod webu). Bez závislostí, aby ho
   app.js mohol načítať hneď a zvyšok hry až na herných stránkach. */
const RETURN_KEY = 'gosko:game-return';
const RETURN_TTL = 30 * 60_000;

/* Web má skutočné adresy (/mapa, /spot/…) pod <base href>; starý tvar #/mapa platí tiež. */
export const appBase = () => (typeof document !== 'undefined' ? new URL(document.baseURI).pathname.replace(/[^/]*$/, '') : '/');
/* Aktuálna stránka v tvare '#/…' (tak ju pozná router v app.js). */
export function currentRoute(loc = location, base = appBase()) {
  if (loc.hash.startsWith('#/')) return loc.hash;
  const p = loc.pathname.startsWith(base) ? loc.pathname.slice(base.length) : '';
  return '#/' + decodeURI(p).replace(/\/$/, '');
}
/* '#/spot/x' -> '/spot/x' (pre history.replaceState) */
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
