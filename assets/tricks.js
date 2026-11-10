/* Triky: čistá logika bez DOM (testy: tests/unit/tricks.test.js).
   Obsah (zoznam trikov, úrovne, texty) je v data.js. */

/* text bez diakritiky a malými písmenami, na hľadanie */
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* poradové číslo dňa podľa miestneho dátumu (polnoc mení trik dňa u návštevníka) */
export function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

/* Trik dňa. Číslo 7919 je prvočíslo, takže pre zoznam kratší ako 7919 sa prejdú všetky triky,
   kým sa nejaký zopakuje, a poradie nie je abecedné. Pri zmene zoznamu sa trik dňa preskupí. */
export function trickOfDay(list, date = new Date()) {
  const n = Array.isArray(list) ? list.length : 0;
  if (!n) return null;
  return list[(dayNumber(date) * 7919) % n];
}

/* filter podľa úrovne a hľadaného textu (názov + popis) */
export function filterTricks(list, { level = '', q = '' } = {}) {
  const needle = norm(q);
  return (list || []).filter(t => (!level || t.level === level) && (!needle || norm(`${t.name} ${t.how} ${t.tip || ''}`).includes(needle)));
}

/* náhodný trik (z danej úrovne), nezopakuje práve vytiahnutý, ak je z čoho vyberať */
export function pickTrick(list, { level = '', exclude = null, rnd = Math.random } = {}) {
  let pool = (list || []).filter(t => !level || t.level === level);
  if (exclude && pool.length > 1) pool = pool.filter(t => t.name !== exclude.name);
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

/* ---------- Game of S.K.A.T.E.: počítadlo písmen pre dvoch a viac hráčov ---------- */
export const GOS_WORD = 'SKATE';

export function newGos(names) {
  const players = (names || []).map(n => String(n || '').trim()).filter(Boolean).slice(0, 6).map(name => ({ name, letters: 0 }));
  return { players, turn: 0 };
}

/* hráč na ťahu je vyradený, keď má všetky písmená */
export const gosOut = p => p.letters >= GOS_WORD.length;
export const gosLetters = p => GOS_WORD.slice(0, Math.min(p.letters, GOS_WORD.length));

/* kto ešte hrá; víťaz je posledný, kto nemá všetky písmená (pri dvoch hráčoch hneď, ako jeden prehrá) */
export function gosAlive(g) { return g.players.map((p, i) => [p, i]).filter(([p]) => !gosOut(p)).map(([, i]) => i); }
export function gosWinner(g) {
  if (g.players.length < 2) return null;
  const alive = gosAlive(g);
  return alive.length === 1 ? alive[0] : null;
}

function nextTurn(g, from) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (!gosOut(g.players[i])) return i; }
  return from;
}

/* hráč na ťahu trik nedal: dostane písmeno a ťah ide ďalej */
export function gosMiss(g) {
  if (gosWinner(g) !== null || gosOut(g.players[g.turn])) return g;
  const players = g.players.map((p, i) => i === g.turn ? { ...p, letters: p.letters + 1 } : p);
  const next = { players, turn: g.turn };
  return { ...next, turn: nextTurn(next, g.turn) };
}
/* hráč na ťahu trik dal: ťah ide ďalej */
export function gosLand(g) {
  if (gosWinner(g) !== null) return g;
  return { ...g, turn: nextTurn(g, g.turn) };
}
