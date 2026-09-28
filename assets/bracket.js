/* Vyraďovací pavúk: losovanie, postup, opravy a prepočet umiestnení.
   Čistá logika bez DOM, aby sa dala testovať samostatne.

   bracket = { v: 1, riders: [...], size: 8, current: null | { r, m },
               rounds: [ [ { a, b, w, bye? }, ... ], ... ] }
   a, b = mená jazdcov (null = ešte nie je známy), w = víťaz súboja. */

export const MAX_RIDERS = 64;

export function roundName(matchCount) {
  return { 1: 'Finále', 2: 'Semifinále', 4: 'Štvrťfinále', 8: '1/8 finále', 16: '1/16 finále', 32: '1/32 finále' }[matchCount] || 'Kolo';
}

/* Poradie nasadenia: 1 vs posledný, aby sa najlepšie nasadení stretli čo najneskôr. */
function seedOrder(size) {
  let o = [1, 2];
  while (o.length < size) { const sum = o.length * 2 + 1; o = o.flatMap(s => [s, sum - s]); }
  return o;
}

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const slot = m => (m % 2 === 0 ? 'a' : 'b');

function feed(b, r, m, name) {
  if (r + 1 < b.rounds.length) b.rounds[r + 1][m >> 1][slot(m)] = name;
}

export function cleanNames(names) {
  const seen = new Set(), out = [];
  for (const raw of names) {
    const n = String(raw).replace(/\s+/g, ' ').trim();
    if (!n) continue;
    const key = n.toLocaleLowerCase('sk');
    if (seen.has(key)) throw new Error(`Meno sa opakuje: ${n}`);
    seen.add(key); out.push(n);
  }
  return out;
}

export function makeBracket(names, { shuffle = true, rng = Math.random } = {}) {
  const list = cleanNames(names);
  if (list.length < 2) throw new Error('Na pavúk treba aspoň 2 jazdcov.');
  if (list.length > MAX_RIDERS) throw new Error(`Na pavúk je najviac ${MAX_RIDERS} jazdcov.`);
  const riders = shuffle ? shuffled(list, rng) : list;
  const size = 2 ** Math.ceil(Math.log2(riders.length));
  const order = seedOrder(size);
  const person = seed => (seed <= riders.length ? riders[seed - 1] : null);
  const first = [];
  for (let k = 0; k < size / 2; k++) first.push({ a: person(order[2 * k]), b: person(order[2 * k + 1]), w: null });
  const rounds = [first];
  for (let m = size / 4; m >= 1; m /= 2) rounds.push(Array.from({ length: m }, () => ({ a: null, b: null, w: null })));
  const b = { v: 1, riders, size, rounds, current: null };
  first.forEach((mt, i) => { if (!mt.a || !mt.b) { mt.bye = true; mt.w = mt.a || mt.b; feed(b, 0, i, mt.w); } });
  return b;
}

export function clearWinner(b, r, m) {
  const mt = b.rounds[r][m];
  if (mt.bye || !mt.w) return b;
  mt.w = null;
  if (r + 1 < b.rounds.length) {
    const nm = b.rounds[r + 1][m >> 1];
    nm[slot(m)] = null;
    if (nm.w) clearWinner(b, r + 1, m >> 1);
    if (b.current && b.current.r === r + 1 && b.current.m === (m >> 1)) b.current = null;
  }
  return b;
}

export function setWinner(b, r, m, name) {
  const mt = b.rounds[r][m];
  if (mt.bye) throw new Error('Tento súboj je voľný postup.');
  if (!mt.a || !mt.b) throw new Error('Súboj ešte nemá oboch jazdcov.');
  if (name !== mt.a && name !== mt.b) throw new Error('Tento jazdec v súboji nie je.');
  if (mt.w === name) return b;
  if (mt.w) clearWinner(b, r, m);
  mt.w = name;
  feed(b, r, m, name);
  if (b.current && b.current.r === r && b.current.m === m) b.current = null;
  return b;
}

/* Označí súboj, ktorý práve prebieha (na TV sa zvýrazní). Opakované ťuknutie zruší. */
export function toggleCurrent(b, r, m) {
  const mt = b.rounds[r][m];
  if (b.current && b.current.r === r && b.current.m === m) { b.current = null; return b; }
  if (mt.bye || !mt.a || !mt.b || mt.w) throw new Error('Tento súboj sa teraz nedá označiť.');
  b.current = { r, m };
  return b;
}

export const isComplete = b => !!b.rounds[b.rounds.length - 1][0].w;

export function progress(b) {
  let done = 0, total = 0;
  for (const round of b.rounds) for (const mt of round) if (!mt.bye) { total++; if (mt.w) done++; }
  return { done, total };
}

/* Umiestnenia z pavúka. Víťaz = 1., finalista = 2., porazení v semifinále = 3. (spoločne 3.-4.),
   vo štvrťfinále 5., v 1/8 finále 9., atď. Sedí to presne na pásma bodovania. */
export function placements(b) {
  const out = [];
  const fin = b.rounds[b.rounds.length - 1][0];
  if (fin.w) out.push({ name: fin.w, place: 1 });
  for (const round of b.rounds) {
    const M = round.length;
    for (const mt of round) {
      if (mt.bye || !mt.w || !mt.a || !mt.b) continue;
      out.push({ name: mt.a === mt.w ? mt.b : mt.a, place: M + 1 });
    }
  }
  return out.sort((x, y) => x.place - y.place || x.name.localeCompare(y.name, 'sk'));
}

/* Hlavný súboj, ktorý sa má hrať ako ďalší (pre TV a admina). */
export function nextMatch(b, { skipCurrent = false } = {}) {
  for (let r = 0; r < b.rounds.length; r++)
    for (let m = 0; m < b.rounds[r].length; m++) {
      const mt = b.rounds[r][m];
      if (skipCurrent && b.current && b.current.r === r && b.current.m === m) continue;
      if (!mt.bye && mt.a && mt.b && !mt.w) return { r, m, match: mt };
    }
  return null;
}
