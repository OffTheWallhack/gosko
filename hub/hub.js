/* Event hub: samostatná stránka so skate a board eventmi doma aj vo svete.
   Názov je zatiaľ pracovný: zmeníš ho tu v BRAND a všade sa prepíše. */
import { CONFIG, EVENTS } from '../data.js';

const BRAND = { name: 'EVENT HUB' };
const $ = s => document.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
  return n;
};
document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = BRAND.name; });

const CODES = { Slovensko: 'sk', Česko: 'cz', Rakúsko: 'at', Maďarsko: 'hu', Poľsko: 'pl', Nemecko: 'de', Francúzsko: 'fr', Španielsko: 'es', Taliansko: 'it', Portugalsko: 'pt',
  Fínsko: 'fi', Švédsko: 'se', Dánsko: 'dk', Holandsko: 'nl', Belgicko: 'be', Švajčiarsko: 'ch', Rumunsko: 'ro', Chorvátsko: 'hr', Slovinsko: 'si', 'Veľká Británia': 'gb',
  USA: 'us', Kanada: 'ca', Brazília: 'br', Austrália: 'au', Japonsko: 'jp', Čína: 'cn', Paraguaj: 'py' };
const EUROPE = new Set(['Rakúsko', 'Maďarsko', 'Poľsko', 'Nemecko', 'Francúzsko', 'Španielsko', 'Taliansko', 'Portugalsko', 'Fínsko', 'Švédsko', 'Dánsko', 'Holandsko', 'Belgicko', 'Švajčiarsko', 'Rumunsko', 'Chorvátsko', 'Slovinsko', 'Veľká Británia']);
const MON = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
const pd = d => { const [y, m, dd] = (d || '').split('-').map(Number); return y ? { y, m, d: dd } : null; };
const today = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
const days = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...a.split('-').map((x, i) => i === 1 ? x - 1 : +x))) / 864e5);
const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;
const last = e => e.end_date && e.end_date > e.date ? e.end_date : e.date;
const flag = c => CODES[c] ? h('img', { class: 'fl', src: `https://flagcdn.com/${CODES[c]}.svg`, alt: c, title: c, width: 28, height: 21, loading: 'lazy' }) : h('span', { class: 'fl globe', title: c || 'Svet' }, '🌍');
const safe = u => /^https?:\/\//i.test(String(u || '')) ? u : null;
const region = c => c === 'Slovensko' ? 'sk' : c === 'Česko' ? 'cz' : EUROPE.has(c) ? 'eu' : 'world';

let all = [], st = { q: '', region: 'all', time: 'up' };
try { Object.assign(st, JSON.parse(sessionStorage.getItem('hub:st') || '{}')); } catch {}
const save = () => { try { sessionStorage.setItem('hub:st', JSON.stringify(st)); } catch {} };

function ics(e) {
  const d = s => s.replace(/-/g, ''), endX = (() => { const t = new Date(last(e) + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); })();
  const esc = s => String(s || '').replace(/[,;\\]/g, m => '\\' + m);
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//eventhub//SK', 'BEGIN:VEVENT', `UID:${e.id}@eventhub`, `DTSTART;VALUE=DATE:${d(e.date)}`, `DTEND;VALUE=DATE:${d(endX)}`,
    `SUMMARY:${esc(e.name)}`, `LOCATION:${esc([e.place, e.city, e.country].filter(Boolean).join(', '))}`, e.link ? `URL:${e.link}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([body], { type: 'text/calendar' })), download: (e.name || 'event').replace(/[^\w-]+/g, '-') + '.ics' });
  document.body.append(a); a.click(); a.remove();
}
function badges(e) {
  const out = [], live = e.date <= today && last(e) >= today, n = days(today, e.date), len = days(e.date, last(e)) + 1;
  if (e.ours) out.push(h('span', { class: 'bd ours' }, 'GOSko'));
  if (live) out.push(h('span', { class: 'bd live' }, '● live'));
  else if (n > 0 && n <= 45) out.push(h('span', { class: 'bd soon' }, n === 1 ? 'zajtra' : `o ${n} ${plural(n, 'deň', 'dni', 'dní')}`));
  if (len > 1) out.push(h('span', { class: 'bd' }, `${len} ${plural(len, 'deň', 'dni', 'dní')}`));
  if (e.kind) out.push(h('span', { class: 'bd' }, e.kind));
  if (e.prize) out.push(h('span', { class: 'bd prize' }, '🏆 ' + e.prize));
  return out;
}
function row(e) {
  const p = pd(e.date), q = pd(last(e));
  const dd = !p ? '?' : q && (q.d !== p.d || q.m !== p.m) ? (q.m === p.m ? `${p.d}–${q.d}` : `${p.d}.–${q.d}.`) : String(p.d);
  const link = e.ours ? `../event/${e.gid}` : safe(e.link);
  return h('article', { class: 'ev' + (e.ours ? ' ours' : '') + (e.date <= today && last(e) >= today ? ' live' : '') + (last(e) < today ? ' past' : ''), id: 'e-' + e.id },
    h('div', { class: 'ev-d' }, h('b', { class: dd.length > 3 ? 'long' : '' }, dd), h('span', {}, p ? MON[p.m - 1] + (q && q.m !== p.m ? '–' + MON[q.m - 1] : '') : '')),
    h('div', { class: 'ev-f' }, flag(e.country)),
    h('div', { class: 'ev-m' },
      h('p', { class: 'ev-loc' }, [e.city, e.country].filter(Boolean).join(' · ')),
      h('h3', {}, e.name),
      h('p', { class: 'ev-sub' }, [e.place, e.organizer ? 'organizuje ' + e.organizer : null].filter(Boolean).join(' · ')),
      h('div', { class: 'ev-b' }, badges(e))),
    h('div', { class: 'ev-a' },
      link ? h('a', { class: 'hb-btn', href: link, target: e.ours ? null : '_blank', rel: 'noopener' }, e.ours ? 'Detail' : 'Info ↗') : null,
      e.date && last(e) >= today ? h('button', { class: 'hb-btn ghost', type: 'button', onclick: () => ics(e) }, '+ kalendár') : null));
}
function chips(el, items, key) {
  el.replaceChildren(...items.map(([v, l]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(st[key] === v), onclick: () => { st[key] = v; save(); render(); chips(el, items, key); } }, l)));
}
function render() {
  const q = st.q.trim().toLowerCase();
  let list = all.filter(e => (st.region === 'all' || region(e.country) === st.region || (st.region === 'home' && ['sk', 'cz'].includes(region(e.country))))
    && (!q || [e.name, e.city, e.country, e.organizer, e.place].join(' ').toLowerCase().includes(q)));
  if (st.time === 'up') list = list.filter(e => last(e) >= today);
  else if (st.time === 'live') list = list.filter(e => e.date <= today && last(e) >= today);
  else list = list.filter(e => last(e) < today).reverse();
  const box = $('#list'), months = $('#months');
  if (!list.length) { box.replaceChildren(h('p', { class: 'hb-empty' }, st.time === 'live' ? 'Práve teraz nič neprebieha.' : 'Nič sme nenašli. Skús iný filter.')); months.replaceChildren(); return; }
  const groups = new Map();
  for (const e of list) { const p = pd(e.date), k = p ? `${p.y}-${p.m}` : 'x'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  box.replaceChildren(...[...groups].map(([k, evs]) => { const [y, m] = k.split('-').map(Number);
    return h('section', { class: 'mo', id: 'm-' + k }, h('h2', {}, h('span', {}, MONTHS[m - 1] || 'Čoskoro'), h('small', {}, y || ''), h('i', {}, `${evs.length}`)), evs.map(row)); }));
  months.replaceChildren(...[...groups.keys()].map(k => { const [y, m] = k.split('-').map(Number); return h('a', { href: '#m-' + k, onclick: ev => { ev.preventDefault(); document.getElementById('m-' + k)?.scrollIntoView({ behavior: 'smooth' }); } }, `${MON[m - 1] || '?'} ${String(y).slice(2)}`); }));
}
function stats() {
  const up = all.filter(e => last(e) >= today), countries = new Set(up.map(e => e.country)).size;
  const nextE = up.find(e => e.date >= today), n = nextE ? days(today, nextE.date) : null, live = all.filter(e => e.date <= today && last(e) >= today).length;
  $('#stats').replaceChildren(
    h('li', {}, h('b', {}, String(up.length)), h('span', {}, plural(up.length, 'event pred nami', 'eventy pred nami', 'eventov pred nami'))),
    h('li', {}, h('b', {}, String(countries)), h('span', {}, plural(countries, 'krajina', 'krajiny', 'krajín'))),
    h('li', {}, h('b', {}, live ? String(live) : n === null ? '–' : n === 0 ? 'dnes' : String(n)), h('span', {}, live ? 'práve prebieha' : n === null ? 'nič v pláne' : n === 0 ? 'najbližší event' : `${plural(n, 'deň', 'dni', 'dní')} do najbližšieho`)));
}
function featured() {
  const n = EVENTS.filter(e => e.status === 'next').sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0];
  if (!n) return;
  const g = { gid: n.id, name: n.name, city: n.city, date: n.date };
  const el = $('#featured'); el.hidden = false;
  el.replaceChildren(h('a', { class: 'ft', href: `../event/${g.gid}` },
    h('span', { class: 'ft-k' }, 'Featured · domáca séria'), h('b', {}, g.name), h('span', {}, g.date ? `${g.city} · ${g.date}` : `${g.city} · coming soon`), h('span', { class: 'ft-go' }, 'Otvoriť →')));
}
async function load() {
  let community = [];
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/community_events_public?select=*&order=date.asc&limit=1000`, { headers: { apikey: CONFIG.SUPABASE_ANON_KEY } });
    if (r.ok) community = await r.json();
  } catch (err) { console.error(err); }
  const ours = EVENTS.map(e => ({ id: 'gosko-' + e.id, gid: e.id, ours: true, name: e.name, date: e.date || '', end_date: e.endDate || null, city: e.city, country: 'Slovensko', place: e.place, organizer: 'GOSko', kind: 'Game of S.K.A.T.E.', prize: e.prize || null }));
  all = [...ours.filter(e => e.date), ...community].filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
  stats(); featured();
  chips($('#region'), [['all', 'Všetko'], ['home', 'SK + CZ'], ['sk', 'Slovensko'], ['cz', 'Česko'], ['eu', 'Európa'], ['world', 'Svet']], 'region');
  chips($('#time'), [['up', 'Nadchádzajúce'], ['live', 'Práve teraz'], ['past', 'Odjazdené']], 'time');
  const qi = $('#q'); qi.value = st.q; qi.addEventListener('input', () => { st.q = qi.value; save(); render(); });
  render();
  const hash = location.hash.slice(1);
  if (hash.startsWith('e-')) { const el = document.getElementById(hash); if (el) { el.classList.add('hl'); el.scrollIntoView({ block: 'center' }); } }
}
load();
