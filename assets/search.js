/* Vyhľadávanie po celom webe: čistá logika bez DOM (testy: tests/unit/search.test.js).
   Index poskladá app.js z data.js (eventy, jazdci, crew, partneri, parky, triky, stránky). */
import { norm } from './tricks.js';

export const KINDS = { page: 'Stránka', event: 'Event', rider: 'Jazdec', crew: 'Crew', partner: 'Partner', park: 'Skatepark', trick: 'Trik', news: 'Novinka' };

/* položka: { kind, title, sub?, href, keys? }; keys = dodatočné slová, podľa ktorých sa má dať nájsť */
export function buildIndex(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    if (!it || !it.title || !it.href) continue;
    const key = it.kind + '|' + it.href + '|' + norm(it.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, _t: norm(it.title), _h: norm([it.title, it.sub, it.keys].filter(Boolean).join(' ')) });
  }
  return out;
}

/* všetky slová z dotazu musia byť v texte; vyššie skóre = začiatok názvu, potom názov, potom zvyšok */
export function search(index, query, limit = 12) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const it of index || []) {
    if (!words.every(w => it._h.includes(w))) continue;
    let s = 0;
    for (const w of words) s += it._t.startsWith(w) ? 4 : it._t.split(/[\s-]+/).some(p => p.startsWith(w)) ? 3 : it._t.includes(w) ? 2 : 1;
    if (it._t === words.join(' ')) s += 5;
    scored.push([s, it]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title, 'sk')).slice(0, limit).map(([, it]) => it);
}
