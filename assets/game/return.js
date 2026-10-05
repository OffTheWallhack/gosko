/* Návrat do hry po prihlásení odkazom z e-mailu (odkaz otvorí úvod webu). Bez závislostí, aby ho
   app.js mohol načítať hneď a zvyšok hry až na herných stránkach. */
const RETURN_KEY = 'gosko:game-return';
const RETURN_TTL = 30 * 60_000;

/* Zapamätá si hernú stránku pred prihlásením. */
export function rememberReturn(hash = location.hash) {
  try { localStorage.setItem(RETURN_KEY, JSON.stringify({ hash, at: Date.now() })); } catch { /* bez úložiska */ }
}

/* Raz po prihlásení: kam sa vrátiť ('' = nikam). Starší záznam ako 30 min sa zahodí. */
export function consumeReturn(now = Date.now(), storage = globalThis.localStorage) {
  let v = null;
  try { v = JSON.parse(storage.getItem(RETURN_KEY) || 'null'); storage.removeItem(RETURN_KEY); } catch { return ''; }
  if (!v || typeof v.hash !== 'string' || !/^#\/[\w\-/]*$/.test(v.hash) || !(now - v.at <= RETURN_TTL)) return '';
  return v.hash;
}
