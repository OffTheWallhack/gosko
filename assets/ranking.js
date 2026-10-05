/* GOSko Ranking: čisté funkcie rebríčka, bez DOM a bez importov.
   Dáta (eventy s výsledkami) a konfigurácia (body, pravidlá sezóny) prichádzajú ako argumenty,
   takže rebríček beží rovnako nad data.js aj nad databázou a dá sa testovať v Node.

   cfg = { points: POINTS, rules: SEASON_RULES, season: SITE.season, catName?: id => názov, max?: MAX_STICKERS }
   Výsledok jazdca v evente: { name, place, rider_id? }. Ak má rider_id (z databázy), jazdec sa
   identifikuje podľa neho, inak podľa slugu mena. */

export const MAX_STICKERS = 8;   // toľko miest na nálepky má 3D doska (board.js SLOTS)

/* Krátky stabilný hash (FNV-1a 32 bit) v base36. */
export function hash36(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    h ^= c & 0xff; h = Math.imul(h, 0x01000193);
    if (c > 0xff) { h ^= c >>> 8; h = Math.imul(h, 0x01000193); }
    if (c > 0xffff) { h ^= c >>> 16; h = Math.imul(h, 0x01000193); }
  }
  return (h >>> 0).toString(36);
}

/* Písmená, ktoré sa rozkladom diakritiky (NFD) neodstránia. */
const TRANSLIT = { 'ł': 'l', 'đ': 'd', 'ø': 'o', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ð': 'd', 'ı': 'i' };

/* Slug mena do URL. Latinské mená ostávajú ako doteraz („Lukáš Ďuraj“ → „lukas-duraj“).
   Meno s písmenami mimo latinky (azbuka, grécke písmo…) dostane navyše krátky hash,
   aby slug nebol prázdny a dve rôzne mená sa nezliali do jedného. */
export function slug(s) {
  const src = String(s ?? '');
  const flat = src.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[łđøßæœþðı]/g, c => TRANSLIT[c]);
  const base = flat.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const foreign = /[^a-z0-9]/.test(flat.replace(/[^\p{L}\p{N}]/gu, ''));
  const key = src.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!foreign && (base || !key)) return base;
  const tag = hash36(key);
  return base ? `${base}-${tag}` : `r-${tag}`;
}

/* Kľúč jazdca: rider_id z databázy, inak slug mena. */
export const riderKey = x => (x && x.rider_id != null && x.rider_id !== '' ? String(x.rider_id) : slug(x ? x.name : ''));

/* Skrátené meno („Marek K.“), ak si to jazdec alebo rodič vyžiadal v RIDER_PRIVACY. */
export function displayName(name, privacy = {}) {
  if (privacy[slug(name)] !== 'initial') return name;
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase('sk')}.` : parts[0];
}

export const pointsFor = (place, points) => points.find(p => place <= p.upTo)?.points ?? 0;

export function bestPoints(list, countBest) {
  const s = [...list].sort((a, b) => b - a);
  return (countBest ? s.slice(0, countBest) : s).reduce((x, y) => x + y, 0);
}

const byPlace = (a, b) => a.place - b.place || a.name.localeCompare(b.name, 'sk');

/* Zloží výsledky jedného eventu z data.js (base) a z databázy (remote). Databáza má prednosť
   pri tej istej kategórii eventu. remote = { results: [{event_id, category, rider_name, place, rider_id?}],
   awards: [{event_id, name, rider_name, rider_id?}], brackets: [{event_id, category, data}] }.
   Vráti polia, ktoré app.js priradí do eventu. */
export function mergeEvent(id, base, remote = {}, privacy = {}) {
  const show = x => ({ ...x, name: displayName(x.name, privacy) });
  const results = {};
  for (const [cat, list] of Object.entries(base.results || {})) results[cat] = list.map((x, i) => (typeof x === 'string' ? { name: x, place: i + 1 } : { ...x }));
  const rr = (remote.results || []).filter(r => r.event_id === id);
  for (const cat of new Set(rr.map(r => r.category)))
    results[cat] = rr.filter(r => r.category === cat).map(r => ({ name: r.rider_name, place: r.place, ...(r.rider_id ? { rider_id: r.rider_id } : {}) })).sort(byPlace);
  for (const cat of Object.keys(results)) results[cat] = results[cat].map(show);
  const ra = (remote.awards || []).filter(a => a.event_id === id);
  const rawAwards = ra.length ? ra.map(a => ({ name: a.name, rider: a.rider_name, ...(a.rider_id ? { rider_id: a.rider_id } : {}) })) : (base.awards || []).map(a => ({ ...a }));
  const awards = rawAwards.map(a => ({ ...a, rider: displayName(a.rider, privacy) }));
  const brackets = Object.fromEntries((remote.brackets || []).filter(x => x.event_id === id).map(x => [x.category, x.data]));
  const has = Object.values(results).some(l => l.length);
  const status = base.status === 'next' && has ? 'done' : base.status;
  const sticker = base.sticker === 'next' && status === 'done' ? 'band' : base.sticker;
  return { results, rawAwards, awards, brackets, status, sticker };
}

/* Všetky výsledky zo všetkých eventov ako ploché riadky. */
export function allResults(events) {
  const rows = [];
  for (const ev of events) for (const [cat, list] of Object.entries(ev.results || {})) for (const x of list)
    rows.push({ ev, cat, name: x.name, place: x.place, slug: riderKey(x), rider_id: x.rider_id ?? null });
  return rows;
}

const byStanding = (a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best || a.name.localeCompare(b.name, 'sk');

/* Rebríček kategórie: celá sezóna (eventId = null) alebo jeden event.
   Pri rovnosti bodov rozhodujú výhry, potom najlepšie umiestnenie, potom abeceda. */
export function standings(events, cat, eventId, season, cfg) {
  const m = new Map();
  for (const r of allResults(events)) {
    if (r.cat !== cat) continue;
    if (eventId ? r.ev.id !== eventId : r.ev.season !== season) continue;
    const o = m.get(r.slug) || { name: r.name, slug: r.slug, rider_id: r.rider_id, list: [], wins: 0, best: 99, events: 0 };
    o.list.push(pointsFor(r.place, cfg.points)); o.wins += r.place === 1 ? 1 : 0; o.best = Math.min(o.best, r.place); o.events++;
    m.set(r.slug, o);
  }
  return [...m.values()].map(o => ({ ...o, points: eventId ? o.list[0] : bestPoints(o.list, cfg.rules?.countBest) })).sort(byStanding);
}

/* Jazdci so všetkými výsledkami a oceneniami.
   points = body v sezóne cfg.season v kategórii, kde má jazdec najviac (rovnaké číslo ako v rebríčku tej kategórie);
   pointsByCat = body v sezóne po kategóriách. Body z rôznych kategórií sa nesčítavajú. */
export function riders(events, cfg) {
  const m = new Map();
  const get = x => { const s = riderKey(x); if (!m.has(s)) m.set(s, { name: x.name, slug: s, rider_id: x.rider_id ?? null, results: [], awards: [] }); return m.get(s); };
  for (const r of allResults(events)) get(r).results.push(r);
  for (const ev of events) for (const a of ev.awards || []) get({ name: a.rider, rider_id: a.rider_id }).awards.push({ ...a, ev });
  for (const r of m.values()) {
    const season = r.results.filter(x => x.ev.season === cfg.season);
    r.pointsByCat = {};
    for (const cat of new Set(season.map(x => x.cat)))
      r.pointsByCat[cat] = bestPoints(season.filter(x => x.cat === cat).map(x => pointsFor(x.place, cfg.points)), cfg.rules?.countBest);
    r.points = Math.max(0, ...Object.values(r.pointsByCat));
    r.cats = [...new Set(r.results.map(x => x.cat))];
    r.events = [...new Set([...r.results.map(x => x.ev), ...r.awards.map(x => x.ev)])];
  }
  return [...m.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'sk'));
}

/* Nálepky na 3D dosku. */
export const eventSticker = ev => ({ kind: ev.sticker, title: ev.city, sub: ev.stickerDate, link: '#/event/' + ev.id });
export function riderStickers(r, cfg = {}) {
  const catName = cfg.catName || (id => id), max = cfg.max ?? MAX_STICKERS;
  const out = [];
  for (const ev of [...r.events].sort((a, b) => (b.date || '').localeCompare(a.date || ''))) {
    out.push(eventSticker(ev));
    for (const x of r.results.filter(x => x.ev === ev && x.place <= 3)) out.push({ kind: 'medal', place: x.place, title: `${catName(x.cat)} ${ev.city}`, link: '#/event/' + ev.id });
    for (const a of r.awards.filter(x => x.ev === ev)) out.push({ kind: 'trick', title: ev.city, link: '#/event/' + ev.id });
  }
  return out.slice(0, max);
}

/* Cesta do finále: kto postupuje, kto ešte môže a kto je mimo hry. null, ak finále nie je nastavené. */
export function finaleTable(events, cat, season, cfg) {
  const F = cfg.rules?.finale;
  if (!F || season !== cfg.season) return null;
  const st = standings(events, cat, null, season, cfg);
  if (!st.length) return null;
  const left = F.eventsLeft ?? events.filter(e => e.status === 'next' && e.season === season).length;
  const gain = left * pointsFor(1, cfg.points), cut = st[F.slots - 1]?.points ?? 0;
  const rows = st.map((r, i) => {
    const rivals = st.filter((o, j) => j !== i && o.points + gain >= r.points).length;
    const state = rivals < F.slots ? 'secure' : i < F.slots ? 'in' : r.points + gain >= cut ? 'alive' : 'out';
    return { ...r, rank: i + 1, state, gap: Math.max(0, cut - r.points) };
  });
  return { F, rows, left };
}
