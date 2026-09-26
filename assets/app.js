import { CONFIG, SITE, POINTS, CATEGORIES, EVENTS, PARTNERS, FACTS, PACKAGES, PRODUCTS } from '../data.js';
import { mountBoard, MAX_STICKERS } from './board.js';
import { mountBuilder, renderThumb, cleanLayout, slimLayout } from './park.js';
import { getStore, INBOX } from './store.js';

/* ---------- pomocníci ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k instanceof Node ? k : String(k)); }
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const put = (el, ...kids) => el.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
const go = hash => { location.hash = hash; };
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MONTHS = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];
const MON = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec'];
const parseDate = d => { const [y, m, dd] = (d || '').split('-').map(Number); return y ? { y, m, d: dd } : null; };
const fmtDate = d => { const p = parseDate(d); return p ? `${p.d}. ${MONTHS[p.m - 1]} ${p.y}` : ''; };
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;
const catName = id => CATEGORIES.find(c => c.id === id)?.name || id;
const pointsFor = place => POINTS.find(p => place <= p.upTo).points;
const igLink = handle => h('a', { href: `https://www.instagram.com/${handle}/`, target: '_blank', rel: 'noopener' }, '@' + handle);

/* ---------- výsledky, rebríček, jazdci ---------- */
function allResults() {
  const rows = [];
  for (const ev of EVENTS) for (const [cat, list] of Object.entries(ev.results || {})) list.forEach((name, i) => rows.push({ ev, cat, name, place: i + 1, slug: slug(name) }));
  return rows;
}
function standings(cat, eventId) {
  const m = new Map();
  for (const r of allResults()) {
    if (r.cat !== cat) continue;
    if (eventId ? r.ev.id !== eventId : r.ev.season !== SITE.season) continue;
    const o = m.get(r.slug) || { name: r.name, slug: r.slug, points: 0, wins: 0, best: 99, events: 0 };
    o.points += pointsFor(r.place); o.wins += r.place === 1 ? 1 : 0; o.best = Math.min(o.best, r.place); o.events++;
    m.set(r.slug, o);
  }
  return [...m.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best || a.name.localeCompare(b.name, 'sk'));
}
function riders() {
  const m = new Map();
  const get = name => { const s = slug(name); if (!m.has(s)) m.set(s, { name, slug: s, results: [], awards: [] }); return m.get(s); };
  for (const r of allResults()) get(r.name).results.push(r);
  for (const ev of EVENTS) for (const a of ev.awards || []) get(a.rider).awards.push({ ...a, ev });
  for (const r of m.values()) {
    r.points = r.results.filter(x => x.ev.season === SITE.season).reduce((s, x) => s + pointsFor(x.place), 0);
    r.cats = [...new Set(r.results.map(x => x.cat))];
    r.events = [...new Set([...r.results.map(x => x.ev), ...r.awards.map(x => x.ev)])];
  }
  return [...m.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'sk'));
}
const eventSticker = ev => ({ kind: ev.sticker, title: ev.city, sub: ev.stickerDate, link: '#/event/' + ev.id });
function riderStickers(r) {
  const out = [];
  for (const ev of [...r.events].sort((a, b) => (b.date || '').localeCompare(a.date || ''))) {
    out.push(eventSticker(ev));
    for (const x of r.results.filter(x => x.ev === ev && x.place <= 3)) out.push({ kind: 'medal', place: x.place, title: `${catName(x.cat)} ${ev.city}`, link: '#/event/' + ev.id });
    for (const a of r.awards.filter(x => x.ev === ev)) out.push({ kind: 'trick', title: ev.city, link: '#/event/' + ev.id });
  }
  return out.slice(0, MAX_STICKERS);
}

/* ---------- kalendár ---------- */
function downloadIcs({ title, date, place, url }) {
  const p = parseDate(date); if (!p) return;
  const d1 = date.replaceAll('-', '');
  const n = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  const d2 = `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, '0')}${String(n.getUTCDate()).padStart(2, '0')}`;
  const esc = s => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GOSko//SK', 'BEGIN:VEVENT', `UID:${d1}-${slug(title)}@gosko`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d1}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${esc(title)}`, place && `LOCATION:${esc(place)}`, url && `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `${slug(title)}.ics` });
  document.body.append(a); a.click(); a.remove();
}

/* ---------- formulárové okno ---------- */
function formDialog({ title, intro, fields, submit, onSubmit }) {
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const form = h('form', { class: 'dlg-body', novalidate: true },
    intro && h('p', {}, intro),
    fields.map(f => {
      if (f.type === 'checkbox') return h('label', { class: 'check', 'data-field': f.name }, h('input', { type: 'checkbox', name: f.name, required: f.required }), h('span', {}, f.label));
      const input = f.type === 'select'
        ? h('select', { name: f.name, required: f.required }, f.options.map(o => h('option', { value: o.value ?? o }, o.label ?? o)))
        : h('input', { name: f.name, type: f.type || 'text', required: f.required, maxlength: f.max, placeholder: f.placeholder, autocomplete: f.autocomplete || 'off' });
      if (f.value) input.value = f.value;
      return h('label', { class: 'field', 'data-field': f.name }, f.label, input, f.hint && h('span', {}, f.hint));
    }),
    msg,
    h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Zrušiť'), h('button', { class: 'btn primary', type: 'submit' }, submit)));
  const dlg = h('dialog', { 'aria-label': title },
    h('div', { class: 'dlg-head' }, h('h3', { class: 'wide' }, title), h('button', { class: 'x', type: 'button', 'aria-label': 'Zavrieť', onclick: () => dlg.close() }, '✕')), form);
  const values = () => Object.fromEntries(fields.map(f => [f.name, f.type === 'checkbox' ? form.elements[f.name].checked : form.elements[f.name].value.trim()]));
  const sync = () => {
    const v = values();
    for (const f of fields) if (f.showIf) {
      const on = f.showIf(v), wrap = form.querySelector(`[data-field="${f.name}"]`);
      wrap.hidden = !on; form.elements[f.name].required = on && !!f.requiredIfShown;
    }
  };
  form.addEventListener('change', sync); sync();
  form.addEventListener('submit', async e => {
    e.preventDefault(); msg.textContent = '';
    if (!form.checkValidity()) { msg.textContent = 'Vyplň povinné políčka.'; form.reportValidity(); return; }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const done = await onSubmit(values());
      if (done === false) return;
      form.replaceChildren(h('p', {}, done || 'Hotovo.'), h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => dlg.close() }, 'Zavrieť')));
    } catch (err) { console.error(err); msg.textContent = err.message && store.mode === 'demo' ? err.message : 'Nepodarilo sa odoslať. Skús to znova.'; }
    finally { btn.disabled = false; }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg); dlg.showModal();
  return dlg;
}
function loginDialog() {
  formDialog({
    title: 'Prihlásenie', submit: 'Poslať odkaz',
    intro: 'Pošleme ti e-mail s odkazom, heslo netreba. Jeden človek, jeden hlas.',
    fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email' }],
    onSubmit: async v => { await store.login(v.email); return 'Otvor e-mail a klikni na odkaz. Vrátiš sa sem prihlásený.'; },
  });
}
async function requireLogin() { if (await store.signedIn()) return true; loginDialog(); return false; }

function lightbox(photos, index) {
  let i = index;
  const img = h('img', { alt: '' });
  const show = () => { img.src = photos[i].src; img.alt = photos[i].alt; };
  const dlg = h('dialog', { class: 'lightbox', 'aria-label': 'Fotka' },
    img,
    h('div', { class: 'lb-bar' },
      h('button', { class: 'btn', type: 'button', onclick: () => { i = (i - 1 + photos.length) % photos.length; show(); } }, 'Predošlá'),
      h('button', { class: 'btn', type: 'button', onclick: () => { i = (i + 1) % photos.length; show(); } }, 'Ďalšia'),
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Zavrieť')));
  dlg.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { i = (i + 1) % photos.length; show(); } if (e.key === 'ArrowLeft') { i = (i - 1 + photos.length) % photos.length; show(); } });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  show(); document.body.append(dlg); dlg.showModal();
}

/* ---------- spoločné kúsky stránok ---------- */
const pageHead = (title, lead, ...extra) => h('div', { class: 'wrap page-head' }, h('h1', { class: 'wide' }, title), lead && h('p', { class: 'lead' }, lead), extra);
function bands() {
  return h('nav', { class: 'bands', 'aria-label': 'Eventy GOSko' }, EVENTS.filter(e => e.status === 'done' || e.status === 'next').map(ev =>
    h('a', { class: 'band' + (ev.status === 'next' ? ' next' : ''), href: '#/event/' + ev.id },
      h('span', { class: 'city wide' }, ev.city),
      h('span', { class: 'meta cond' }, ev.status === 'next' ? (ev.date ? `Ďalší stop, ${fmtDate(ev.date)}` : 'Ďalší stop, dátum čoskoro') : [ev.place, fmtDate(ev.date)].filter(Boolean).join(', ') || 'Odjazdené'))));
}
function standingsList(rows, { limit, eventMode } = {}) {
  if (!rows.length) return h('p', { class: 'empty' }, 'Výsledky doplníme.');
  return h('ol', { class: 'standings' }, rows.slice(0, limit || rows.length).map((r, i) =>
    h('li', {},
      h('span', { class: 'rank wide', 'aria-hidden': 'true' }, eventMode ? r.best : i + 1),
      h('a', { class: 'st-name', href: '#/jazdec/' + r.slug }, r.name),
      h('span', { class: 'st-meta' }, eventMode ? `${r.best}. miesto` : `${r.events} ${plural(r.events, 'event', 'eventy', 'eventov')}, najlepšie ${r.best}. miesto`),
      h('span', { class: 'st-pts cond' }, `${r.points} b.`))));
}
const scoringNote = () => h('p', { class: 'note' },
  `Body: 1. miesto ${pointsFor(1)}, 2. miesto ${pointsFor(2)}, 3. až 4. miesto ${pointsFor(3)}, 5. až 8. ${pointsFor(5)}, 9. až 16. ${pointsFor(9)}, účasť ${pointsFor(99)}. `,
  'Z prvých eventov poznáme len top 3, od ďalšieho zapisujeme celý pavúk. Best Trick je ocenenie, nie body.');
function photoGrid(photos, limit) {
  const list = limit ? photos.slice(0, limit) : photos;
  return h('div', { class: 'gallery' }, list.map((p, i) => h('button', { type: 'button', class: 'ph', onclick: () => lightbox(photos, i), 'aria-label': 'Zväčšiť: ' + p.alt },
    h('img', { src: p.src, alt: p.alt, loading: 'lazy', width: 1400, height: 933 }))));
}

/* =====================================================================
   STRÁNKY
   ===================================================================== */
function pageHome(root) {
  const canvas = h('canvas', { 'aria-label': '3D skateboard s nálepkami z eventov GOSko' });
  root.append(h('header', { class: 'hero' },
    h('div', { class: 'wrap hero-grid' },
      h('div', { class: 'hero-copy' },
        h('img', { class: 'logo', src: 'img/logo.webp', alt: 'GOSko', width: 640, height: 686 }),
        h('h1', { class: 'wide' }, 'Game of S.K.A.T.E. po Slovensku'),
        h('p', {}, 'Každý stop nechá na doske nálepku. Ťukni na nálepku a pozri, čo sa tam dialo.')),
      h('div', { class: 'board-stage' }, canvas, h('p', { class: 'hint cond' }, 'Potiahni do strany a dosku otočíš'))),
    bands()));

  const top = standings('open');
  root.append(h('section', { class: 'sec' }, h('div', { class: 'wrap' },
    h('h2', { class: 'wide' }, `Rebríček ${SITE.season}`),
    h('p', { class: 'lead' }, 'Kategória Open. Body zo všetkých zastávok sezóny.'),
    standingsList(top, { limit: 3 }),
    h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/rebricek' }, 'Celý rebríček')))));

  const last = EVENTS.filter(e => e.status === 'done' && e.photos?.length).at(-1);
  if (last) root.append(h('section', { class: 'sec light' }, h('div', { class: 'wrap' },
    h('h2', { class: 'wide red' }, last.name), h('p', { class: 'lead' }, [last.place, fmtDate(last.date)].filter(Boolean).join(', ')),
    photoGrid(last.photos, 6),
    h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/event/' + last.id }, 'Výsledky a všetky fotky')))));

  root.append(h('section', { class: 'cta-bands' },
    h('a', { class: 'band', href: '#/parky' }, h('span', { class: 'city wide' }, 'Postav si skatepark'), h('span', { class: 'meta cond' }, 'Najlepšie parky podľa hlasov idú do top 10')),
    h('a', { class: 'band next', href: '#/partneri/zavolaj' }, h('span', { class: 'city wide' }, 'Zavolaj si GOSko'), h('span', { class: 'meta cond' }, 'Pop-up v tvojom meste alebo skateparku'))));

  const stop = mountBoard(canvas, { stickers: EVENTS.map(eventSticker), onSticker: go });
  return () => stop.then(f => f());
}

function pageStandings(root) {
  let scope = 'season', cat = 'open';
  const doneEvents = EVENTS.filter(e => e.status === 'done');
  const body = h('div');
  const chips = (items, current, set) => h('div', { class: 'chips' }, items.map(([v, label]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === current), onclick: () => { set(v); render(); } }, label)));
  function render() {
    const ev = EVENTS.find(e => e.id === scope);
    body.replaceChildren(); put(body,
      h('div', { class: 'controls' },
        chips([['season', `Sezóna ${SITE.season}`], ...doneEvents.map(e => [e.id, e.city + (e.date ? ` ${parseDate(e.date).d}. ${parseDate(e.date).m}.` : '')])], scope, v => { scope = v; }),
        chips(CATEGORIES.map(c => [c.id, c.name]), cat, v => { cat = v; })),
      ev && ev.awards?.length ? h('p', { class: 'note' }, ev.awards.map(a => [`${a.name}: `, h('a', { href: '#/jazdec/' + slug(a.rider) }, a.rider), '. '])) : null,
      standingsList(standings(cat, scope === 'season' ? null : scope), { eventMode: scope !== 'season' }),
      scoringNote());
  }
  root.append(pageHead('Rebríček', 'Celá sezóna alebo jeden event. Vyber kategóriu.'), h('div', { class: 'wrap page-body' }, body));
  render();
}

async function pageEvents(root) {
  let filter = 'all';
  const list = h('div', { class: 'event-list' });
  const ours = EVENTS.map(e => ({ ...e, ours: true, country: 'Slovensko', title: e.name }));
  let community = [];
  try { community = (await store.listEvents()).map(e => ({ ...e, title: e.name, ours: false })); } catch (err) { console.error(err); }
  const today = todayStr();
  function row(e) {
    const p = parseDate(e.date);
    return h('li', { class: 'ev-row' + (e.ours ? ' ours' : '') },
      h('div', { class: 'ev-date', 'aria-hidden': 'true' }, p ? [h('span', { class: 'd wide' }, p.d), h('span', { class: 'm cond' }, MON[p.m - 1])] : h('span', { class: 'm cond' }, 'čoskoro')),
      h('div', { class: 'ev-info' },
        e.ours ? h('a', { class: 'ev-name', href: '#/event/' + e.id }, e.title) : h('span', { class: 'ev-name' }, e.title),
        h('span', { class: 'ev-meta' }, [e.place || e.city, e.ours ? null : e.city && e.place ? e.city : null, e.country !== 'Slovensko' ? e.country : null, fmtDate(e.date) || 'Dátum doplníme', e.ours ? 'GOSko' : e.kind].filter(Boolean).join(', ')),
        e.pending && h('span', { class: 'tag' }, 'Čaká na schválenie')),
      h('div', { class: 'ev-actions' },
        !e.ours && e.link && h('a', { class: 'btn small', href: e.link, target: '_blank', rel: 'noopener' }, 'Viac info'),
        e.date && e.date >= today && h('button', { class: 'btn small', type: 'button', onclick: () => downloadIcs({ title: e.title, date: e.date, place: [e.place, e.city].filter(Boolean).join(', '), url: e.link }) }, 'Do kalendára')));
  }
  function render() {
    const all = [...ours, ...community].filter(e =>
      filter === 'all' || (filter === 'gosko' && e.ours) || (filter === 'sk' && e.country === 'Slovensko') || (filter === 'abroad' && e.country !== 'Slovensko'));
    const upcoming = all.filter(e => e.status === 'next' || (!e.ours && (!e.date || e.date >= today))).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    const past = all.filter(e => !upcoming.includes(e)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    list.replaceChildren(
      h('h2', { class: 'wide sub' }, 'Najbližšie'), upcoming.length ? h('ul', { class: 'ev-list' }, upcoming.map(row)) : h('p', { class: 'empty' }, 'Zatiaľ nič. Poznáš event? Pridaj ho.'),
      h('h2', { class: 'wide sub' }, 'Odjazdené'), past.length ? h('ul', { class: 'ev-list' }, past.map(row)) : h('p', { class: 'empty' }, 'Zatiaľ nič.'));
  }
  const chips = h('div', { class: 'chips' }, [['all', 'Všetky'], ['gosko', 'GOSko'], ['sk', 'Slovensko'], ['abroad', 'Zahraničie']].map(([v, label]) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === filter), onclick: e => { filter = v; chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.currentTarget))); render(); } }, label)));
  root.append(pageHead('Eventy', 'Naše zastávky aj ďalšie skate eventy doma a v zahraničí. Poznáš event, ktorý tu chýba? Pridaj ho.',
    h('button', { class: 'btn primary', type: 'button', onclick: addEventDialog }, 'Pridať event')),
    h('div', { class: 'wrap page-body' }, h('div', { class: 'controls' }, chips), list));
  render();

  function addEventDialog() {
    formDialog({
      title: 'Pridať event', submit: 'Poslať event',
      intro: 'Event sa zobrazí v kalendári po schválení.',
      fields: [
        { name: 'name', label: 'Názov eventu', required: true, max: 80 },
        { name: 'date', label: 'Dátum', type: 'date', required: true },
        { name: 'city', label: 'Mesto', required: true, max: 40 },
        { name: 'place', label: 'Miesto', max: 60, placeholder: 'nepovinné, napr. názov skateparku' },
        { name: 'country', label: 'Krajina', type: 'select', options: ['Slovensko', 'Česko', 'Rakúsko', 'Maďarsko', 'Poľsko', 'Iná'] },
        { name: 'kind', label: 'Typ', type: 'select', options: ['Game of Skate', 'Contest', 'Jam alebo session', 'Iné'] },
        { name: 'link', label: 'Odkaz na event', type: 'url', max: 300, placeholder: 'https://…' },
        { name: 'organizer', label: 'Organizátor', max: 60 },
        { name: 'contact', label: 'Tvoj kontakt', type: 'email', max: 120, hint: 'Nezverejníme ho, len keby sme sa potrebovali niečo spýtať.' },
      ],
      onSubmit: async v => { await store.submitEvent({ ...v, place: v.place || null, link: v.link || null, organizer: v.organizer || null, contact: v.contact || null }); pageEventsRefresh(); return 'Ďakujeme! Event sa v kalendári zobrazí po schválení.'; },
    });
  }
  async function pageEventsRefresh() { try { community = (await store.listEvents()).map(e => ({ ...e, title: e.name, ours: false })); render(); } catch {} }
}

function registerDialog(ev) {
  formDialog({
    title: 'Chcem jazdiť', submit: 'Zaregistrovať sa',
    intro: `${ev.name}${ev.date ? ', ' + fmtDate(ev.date) : ''}. Keď zverejníme dátum a miesto, ozveme sa ti.`,
    fields: [
      { name: 'name', label: 'Meno alebo prezývka', required: true, max: 40, autocomplete: 'name' },
      { name: 'instagram', label: 'Instagram', max: 40, placeholder: '@tvojmeno' },
      { name: 'city', label: 'Mesto', max: 40 },
      { name: 'category', label: 'Kategória', type: 'select', options: CATEGORIES.map(c => ({ value: c.id, label: c.name + (c.note ? ` (${c.note})` : '') })) },
      { name: 'contact', label: 'E-mail alebo telefón', required: true, max: 120 },
      { name: 'parent_consent', label: 'Mám súhlas rodiča s účasťou a so zverejnením výsledkov.', type: 'checkbox', showIf: v => v.category === 'u16', requiredIfShown: true },
      { name: 'gdpr', label: 'Súhlasím, že GOSko použije moje údaje na organizáciu eventu.', type: 'checkbox', required: true },
    ],
    onSubmit: async v => {
      await store.send('registrations', { event_id: ev.id, name: v.name, instagram: v.instagram, city: v.city, category: v.category, contact: v.contact, parent_consent: !!v.parent_consent });
      return 'Si zaregistrovaný. Ozveme sa, keď zverejníme detaily.';
    },
  });
}

function pageEvent(root, id) {
  const ev = EVENTS.find(e => e.id === id);
  if (!ev) return pageNotFound(root);
  const meta = [ev.place, fmtDate(ev.date)].filter(Boolean).join(', ') || (ev.status === 'next' ? 'Dátum a miesto čoskoro' : '');
  root.append(h('header', { class: 'ev-hero' }, h('div', { class: 'wrap' },
    h('a', { class: 'back', href: '#/eventy' }, 'Všetky eventy'),
    h('h1', { class: 'wide' }, ev.name), meta && h('p', { class: 'cond ev-hero-meta' }, meta))));
  const body = h('div', { class: 'wrap page-body' }, h('p', { class: 'lead' }, ev.about));
  if (ev.status === 'next') put(body, h('div', { class: 'actions' },
    ev.registration && h('button', { class: 'btn primary', type: 'button', onclick: () => registerDialog(ev) }, 'Chcem jazdiť'),
    ev.date && h('button', { class: 'btn', type: 'button', onclick: () => downloadIcs({ title: ev.name, date: ev.date, place: ev.place }) }, 'Do kalendára'),
    h('a', { class: 'btn', href: `https://www.instagram.com/${SITE.instagram}/`, target: '_blank', rel: 'noopener' }, 'Sleduj Instagram')));
  const cats = CATEGORIES.filter(c => ev.results?.[c.id]?.length);
  if (ev.status === 'done') {
    put(body, h('h2', { class: 'wide sub' }, 'Výsledky'));
    if (!cats.length) put(body, h('p', { class: 'empty' }, 'Výsledky doplníme.'));
    else put(body, h('div', { class: 'podiums' }, cats.map(c => h('div', { class: 'podium' },
      h('h3', {}, c.name, c.note && h('span', { class: 'cond' }, ` ${c.note}`)),
      h('ol', {}, ev.results[c.id].map((name, i) => h('li', {}, h('span', { class: 'rank wide' }, i + 1), h('a', { href: '#/jazdec/' + slug(name) }, name), h('span', { class: 'cond' }, `${pointsFor(i + 1)} b.`))))))));
    if (ev.awards?.length) put(body, h('p', { class: 'note' }, ev.awards.map(a => [`${a.name}: `, h('a', { href: '#/jazdec/' + slug(a.rider) }, a.rider), '. '])));
  }
  if (ev.photos?.length) put(body, h('h2', { class: 'wide sub' }, 'Fotky'), photoGrid(ev.photos), SITE.photoCredit ? h('p', { class: 'note' }, `Foto: ${SITE.photoCredit}`) : null);
  if (ev.partners?.length) put(body, h('h2', { class: 'wide sub' }, 'Partneri'),
    h('ul', { class: 'partner-list' }, ev.partners.map(p => PARTNERS[p]).filter(Boolean).map(p => h('li', {}, h('span', { class: 'p-name' }, p.name), igLink(p.instagram)))));
  root.append(body);
}

function pageRiders(root) {
  const list = riders();
  root.append(pageHead('Jazdci', 'Každý jazdec má svoju dosku. Za každý event, umiestnenie a ocenenie pribudne nálepka.'),
    h('div', { class: 'wrap page-body' }, h('ul', { class: 'rider-grid' }, list.map(r =>
      h('li', {}, h('a', { href: '#/jazdec/' + r.slug },
        h('span', { class: 'r-name wide' }, r.name),
        h('span', { class: 'r-meta' }, r.cats.map(catName).join(', ') || 'Ocenenie'),
        h('span', { class: 'r-pts cond' }, `${r.points} b., ${riderStickers(r).length} ${plural(riderStickers(r).length, 'nálepka', 'nálepky', 'nálepiek')}`)))))));
}

function pageRider(root, s) {
  const r = riders().find(x => x.slug === s);
  if (!r) return pageNotFound(root);
  const canvas = h('canvas', { 'aria-label': `Doska jazdca ${r.name} s nálepkami` });
  const rankIn = r.cats.map(c => { const st = standings(c); const i = st.findIndex(x => x.slug === r.slug); return i >= 0 ? `${i + 1}. v rebríčku ${catName(c)}` : null; }).filter(Boolean);
  root.append(h('header', { class: 'hero rider-hero' }, h('div', { class: 'wrap hero-grid' },
    h('div', {},
      h('a', { class: 'back', href: '#/jazdci' }, 'Všetci jazdci'),
      h('h1', { class: 'wide' }, r.name),
      h('p', { class: 'cond big-meta' }, `${r.points} bodov v sezóne ${SITE.season}`),
      rankIn.length ? h('p', {}, rankIn.join(', ') + '.') : null,
      h('h2', { class: 'sub' }, 'Výsledky'),
      h('ul', { class: 'r-results' },
        r.results.map(x => h('li', {}, h('a', { href: '#/event/' + x.ev.id }, x.ev.name), ` ${x.place}. miesto, ${catName(x.cat)}, ${pointsFor(x.place)} b.`)),
        r.awards.map(a => h('li', {}, h('a', { href: '#/event/' + a.ev.id }, a.ev.name), ` ${a.name}`))),
      h('p', { class: 'note' }, 'Si to ty? Napíš nám na Instagram a doplníme tvoj profil.')),
    h('div', { class: 'board-stage' }, canvas, h('p', { class: 'hint cond' }, 'Ťukni na nálepku a otvorí sa event')))));
  const stop = mountBoard(canvas, { stickers: riderStickers(r), onSticker: go });
  return () => stop.then(f => f());
}

async function pageParks(root) {
  const tools = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Prekážky' });
  const section = h('section', { class: 'builder light' }, h('div', { class: 'wrap' },
    h('h1', { class: 'wide red' }, 'Postav si skatepark'),
    h('p', { class: 'lead' }, 'Vyber prekážku a ťukni na plochu. Keď je park hotový, pošli ho. Najlepšie parky podľa hlasov budú v top 10.'),
    h('div', { class: 'viewing', hidden: true }, h('p', { class: 'viewing-text' }), h('button', { class: 'btn viewing-exit', type: 'button' }, 'Späť na môj park')),
    h('div', { class: 'builder-stage' }, h('canvas', { class: 'park-canvas', 'aria-label': 'Stavebná plocha skateparku' }),
      h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'view' }, 'Otočiť pohľad')),
    tools,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', 'data-act': 'rotate' }, 'Otočiť prekážku'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'delete', disabled: true }, 'Zmazať'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'clear' }, 'Vyčistiť plochu'),
      h('button', { class: 'btn primary push', type: 'button', 'data-act': 'send' }, 'Poslať park')),
    h('p', { class: 'status', role: 'status', 'aria-live': 'polite' })));
  const title = h('h2', { class: 'wide' }, 'Top 10 parkov');
  const note = h('p', { class: 'note' }), ol = h('ol', { class: 'ranking' }), empty = h('p', { class: 'empty', hidden: true }, 'Zatiaľ tu nie je žiadny park. Postav prvý.');
  const L = { parks: [], voted: new Set(), sort: 'top', loc: 'all' };
  const chipRow = (label, key, items) => h('div', { class: 'chips', role: 'group', 'aria-label': label }, items.map(([v, t]) =>
    h('button', { type: 'button', class: 'chip', 'data-k': key, 'aria-pressed': String(L[key] === v), onclick: e => { L[key] = v; e.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.currentTarget))); renderList(); } }, t)));
  root.append(section, h('section', { class: 'sec' }, h('div', { class: 'wrap' }, title,
    h('div', { class: 'controls' }, chipRow('Zoradenie', 'sort', [['top', 'Top 10'], ['new', 'Najnovšie']]), chipRow('Lokalita', 'loc', [['all', 'Všetky'], ['Bratislava', 'Bratislava'], ['Slovensko', 'Slovensko'], ['Česko', 'Česko']])),
    note, ol, empty)));

  let builder;
  try { builder = mountBuilder(section); } catch (err) { console.error(err); $('.status', section).textContent = 'Tvoj prehliadač nevie zobraziť 3D. Skús iný prehliadač.'; }

  $('[data-act=send]', section).addEventListener('click', async () => {
    const items = builder?.items() || [];
    if (items.length < 3) { builder?.say('Pridaj aspoň 3 prekážky, potom môžeš park poslať.'); return; }
    if (!(await requireLogin())) return;
    formDialog({
      title: 'Poslať park', submit: 'Poslať park',
      fields: [
        { name: 'name', label: 'Názov parku', required: true, max: 40, placeholder: 'napr. Street plaza Petržalka' },
        { name: 'author', label: 'Tvoje meno alebo Instagram', required: true, max: 30, placeholder: '@tvojmeno', hint: 'Zobrazí sa pri parku.' },
        { name: 'location', label: 'Kde by mal park stáť', type: 'select', options: [{ value: 'Bratislava', label: 'Bratislava' }, { value: 'Slovensko', label: 'Iné mesto na Slovensku' }, { value: 'Česko', label: 'Česko' }] },
        { name: 'place', label: 'Konkrétne miesto', max: 60, placeholder: 'nepovinné, napr. pod Mostom SNP' },
      ],
      onSubmit: async v => {
        const res = await store.submitPark({ ...v, layout: slimLayout(items), thumb: renderThumb(items) });
        refresh();
        return res.pending ? 'Ďakujeme! Park sa zobrazí v zozname po schválení.' : 'Park je v zozname. V ukážkovom režime ho vidíš len ty.';
      },
    });
  });

  async function refresh() {
    try { L.parks = await store.listParks(); L.voted = await store.myVotes(); }
    catch (err) { console.error(err); note.textContent = 'Parky sa nepodarilo načítať. Skús obnoviť stránku.'; }
    renderList(); renderNote();
  }
  async function renderNote() {
    note.replaceChildren();
    if (store.mode === 'demo') { note.textContent = 'Ukážkový režim: parky a hlasy sa zatiaľ ukladajú len v tomto prehliadači.'; return; }
    const email = await store.email();
    if (email) note.append(`Prihlásený ako ${email}. `, h('button', { type: 'button', class: 'linklike', onclick: async () => { await store.logout(); refresh(); } }, 'Odhlásiť'));
    else note.textContent = 'Na hlasovanie sa prihlás e-mailom. Jeden človek, jeden hlas na park.';
  }
  function renderList() {
    let arr = L.parks.filter(p => L.loc === 'all' || p.location === L.loc);
    arr = [...arr].sort(L.sort === 'top' ? (a, b) => b.votes - a.votes || b.created - a.created : (a, b) => b.created - a.created).slice(0, L.sort === 'top' ? 10 : 20);
    title.textContent = L.sort === 'top' ? 'Top 10 parkov' : 'Najnovšie parky';
    empty.hidden = arr.length > 0;
    ol.replaceChildren(...arr.map((p, i) => {
      let src = p.thumb; if (!src) { try { src = renderThumb(cleanLayout(p.layout), p.id); } catch { src = ''; } }
      const on = L.voted.has(p.id);
      return h('li', { class: 'park' },
        h('span', { class: 'rank wide', 'aria-hidden': 'true' }, L.sort === 'top' ? i + 1 : ''),
        h('img', { class: 'thumb', alt: '', src: src || null, width: 160, height: 100 }),
        h('div', {}, h('p', { class: 'park-name' }, p.name), h('p', { class: 'park-meta' }, `od ${p.author}, ${p.location}${p.place ? `, ${p.place}` : ''}`)),
        h('div', { class: 'park-actions' },
          h('span', { class: 'votes cond' }, `${p.votes} ${plural(p.votes, 'hlas', 'hlasy', 'hlasov')}`),
          h('button', { type: 'button', class: 'btn vote', 'aria-pressed': String(on), onclick: () => toggleVote(p) }, on ? 'Zahlasované' : 'Hlasovať'),
          h('button', { type: 'button', class: 'btn', onclick: () => { builder?.setViewing(p); section.scrollIntoView(); } }, 'Pozrieť v 3D')));
    }));
  }
  async function toggleVote(p) {
    if (!(await requireLogin())) return;
    const on = !L.voted.has(p.id);
    on ? L.voted.add(p.id) : L.voted.delete(p.id); p.votes += on ? 1 : -1; renderList();
    try { await store.vote(p.id, on); }
    catch (err) { console.error(err); on ? L.voted.delete(p.id) : L.voted.add(p.id); p.votes -= on ? 1 : -1; renderList(); note.textContent = 'Hlas sa nepodarilo uložiť. Skús to znova.'; }
  }
  onAuthChange = refresh;
  refresh();
  return () => { builder?.destroy(); onAuthChange = null; };
}

function mockSvg(kind) {
  const logo = '<image href="img/logo.webp" x="{x}" y="{y}" width="{w}" height="{h}"/>';
  const L = (x, y, w) => logo.replace('{x}', x).replace('{y}', y).replace('{w}', w).replace('{h}', w * 1.07);
  if (kind === 'deck') return `<svg viewBox="0 0 200 200" aria-hidden="true"><rect x="70" y="8" width="60" height="184" rx="30" fill="#A01D21"/><rect x="70" y="40" width="60" height="10" fill="#F3EBDD"/><rect x="70" y="150" width="60" height="10" fill="#F3EBDD"/>${L(76, 68, 48)}</svg>`;
  const tee = 'M60 30 L85 20 Q100 32 115 20 L140 30 L170 60 L150 78 L140 70 L140 185 L60 185 L60 70 L50 78 L30 60 Z';
  const hood = 'M60 38 Q70 12 100 10 Q130 12 140 38 L172 70 L160 175 L145 175 L142 90 L142 188 L58 188 L58 90 L55 175 L40 175 L28 70 Z';
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><path d="${kind === 'hoodie' ? hood : tee}" fill="#111" stroke="#2E2B28" stroke-width="2"/>${L(72, 62, 56)}</svg>`;
}
function pageShop(root) {
  root.append(pageHead('Shop', 'Shop ešte nepredáva. Daj vedieť, čo by si chcel, a podľa záujmu dáme veci vyrobiť.'),
    h('div', { class: 'wrap page-body' }, h('ul', { class: 'cards' }, PRODUCTS.map(p => h('li', { class: 'card product' },
      p.img ? h('img', { src: p.img, alt: p.name, loading: 'lazy', width: 800, height: 800 }) : h('div', { class: 'mock', html: mockSvg(p.mock) }),
      h('div', { class: 'card-body' },
        h('h2', { class: 'card-title' }, p.name), h('p', {}, p.note),
        h('p', { class: 'price cond' }, p.mock ? 'Ukážka dizajnu, cena čoskoro' : 'Cena čoskoro'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => interestDialog(p) }, 'Mám záujem')))))));
}
function interestDialog(p) {
  formDialog({
    title: p.name, submit: 'Mám záujem',
    intro: 'Keď to bude v predaji, ozveme sa ti ako prvému.',
    fields: [
      p.sizes.length ? { name: 'size', label: 'Veľkosť', type: 'select', options: p.sizes } : { name: 'size', label: 'Počet kusov', type: 'number', value: '1', max: 3 },
      { name: 'contact', label: 'E-mail alebo Instagram', required: true, max: 120 },
    ],
    onSubmit: async v => { await store.send('shop_interest', { product: p.id, size: v.size, contact: v.contact }); return 'Zapísané. Ozveme sa, keď to bude v predaji.'; },
  });
}

function pagePartners(root, sub) {
  const form = h('div', { class: 'book', id: 'zavolaj' });
  root.append(pageHead('Pre partnerov', 'GOSko je komunitná séria Game of S.K.A.T.E. súťaží. Hľadáme partnerov, ktorí chcú byť tam, kde sa mladí naozaj stretávajú.'),
    h('section', { class: 'facts' }, FACTS.map(f => h('div', { class: 'band fact' }, h('span', { class: 'city wide' }, f.num), h('span', { class: 'meta cond' }, f.label)))),
    h('section', { class: 'sec' }, h('div', { class: 'wrap split' },
      h('img', { src: 'img/stage-dj.webp', alt: 'DJ na mobilnej stage v aute Red Bull', loading: 'lazy', width: 1400, height: 933 }),
      h('div', {}, h('h2', { class: 'wide' }, 'Pop-up kdekoľvek'),
        h('p', {}, 'Jazdíme s autami, ktoré majú vlastný zvuk a DJ stage. GOSko vieme postaviť za pár hodín na hocijakom skateparku alebo spote.'),
        h('p', {}, 'Každý event vyrobí fotky, videá a výsledky, ktoré komunita zdieľa ešte týždne potom.')))),
    h('section', { class: 'sec light' }, h('div', { class: 'wrap' },
      h('h2', { class: 'wide red' }, 'Ako sa zapojiť'),
      h('ul', { class: 'cards' }, PACKAGES.map(p => h('li', { class: 'card pack' }, h('div', { class: 'card-body' },
        h('h3', { class: 'card-title wide' }, p.name), h('p', {}, p.text), h('ul', { class: 'gets' }, p.gets.map(g => h('li', {}, g))))))),
      h('p', { class: 'note dark' }, 'Cenu a detaily pošleme na požiadanie. Napíš cez formulár nižšie.'))),
    h('section', { class: 'sec' }, h('div', { class: 'wrap' },
      h('h2', { class: 'wide' }, 'S nami na prvom evente'),
      h('ul', { class: 'partner-list' }, Object.values(PARTNERS).map(p => h('li', {}, h('span', { class: 'p-name' }, p.name), igLink(p.instagram)))))),
    h('section', { class: 'sec light' }, h('div', { class: 'wrap' }, form)));

  form.append(h('h2', { class: 'wide red' }, 'Zavolaj si GOSko'),
    h('p', { class: 'lead' }, 'Mesto, skatepark, škola alebo firma? Napíš, čo máš v hlave, a ozveme sa.'),
    h('button', { class: 'btn primary', type: 'button', onclick: bookDialog }, 'Napísať nám'),
    SITE.email ? h('p', { class: 'note dark' }, 'Alebo priamo na ', h('a', { href: 'mailto:' + SITE.email }, SITE.email), '.') : h('p', { class: 'note dark' }, 'Alebo nám napíš na Instagram ', igLink(SITE.instagram), '.'));
  if (sub === 'zavolaj') requestAnimationFrame(() => form.scrollIntoView());
}
function bookDialog() {
  formDialog({
    title: 'Zavolaj si GOSko', submit: 'Odoslať',
    fields: [
      { name: 'org_type', label: 'Kto ste', type: 'select', options: ['Mesto alebo obec', 'Skatepark alebo priestor', 'Firma alebo značka', 'Škola', 'Iné'] },
      { name: 'org_name', label: 'Názov', required: true, max: 80 },
      { name: 'city', label: 'Mesto', required: true, max: 40 },
      { name: 'what', label: 'Čo chcete', type: 'select', options: ['Pop-up na pár hodín', 'Celý GOSko event', 'Partnerstvo série', 'Ešte neviem'] },
      { name: 'when_text', label: 'Kedy približne', max: 60, placeholder: 'napr. jún 2027' },
      { name: 'contact', label: 'E-mail alebo telefón', required: true, max: 120 },
      { name: 'message', label: 'Správa', max: 600, placeholder: 'nepovinné' },
    ],
    onSubmit: async v => { await store.send('bookings', v); return 'Ďakujeme! Ozveme sa čo najskôr.'; },
  });
}

async function pageAdmin(root) {
  root.append(pageHead('Admin', store.mode === 'demo' ? 'Ukážkový režim: vidíš len to, čo sa uložilo v tomto prehliadači.' : 'Schvaľovanie a doručené formuláre.'));
  const body = h('div', { class: 'wrap page-body' }); root.append(body);
  if (store.mode === 'live' && !(await store.signedIn())) { put(body, h('button', { class: 'btn primary', type: 'button', onclick: loginDialog }, 'Prihlásiť sa')); return; }
  if (!(await store.isAdmin())) { put(body, h('p', {}, 'Tento účet nemá prístup do adminu.')); return; }
  const section = (t, ...kids) => h('section', { class: 'admin-sec' }, h('h2', { class: 'wide sub' }, t), kids);
  const [parks, events] = await Promise.all([store.pendingParks().catch(() => []), store.pendingEvents().catch(() => [])]);
  put(body, section('Parky na schválenie', parks.length ? h('ul', { class: 'admin-list' }, parks.map(p => h('li', {},
    p.thumb && h('img', { class: 'thumb', src: p.thumb, alt: '' }), h('span', {}, `${p.name}, od ${p.author}, ${p.location}`),
    h('button', { class: 'btn small', type: 'button', onclick: async e => { await store.approve('parks', p.id); e.currentTarget.closest('li').remove(); } }, 'Schváliť')))) : h('p', { class: 'empty' }, 'Nič nečaká.')));
  put(body, section('Eventy na schválenie', events.length ? h('ul', { class: 'admin-list' }, events.map(e => h('li', {},
    h('span', {}, `${e.name}, ${fmtDate(e.date)}, ${e.city}, ${e.country}`), e.link && h('a', { href: e.link, target: '_blank', rel: 'noopener' }, 'odkaz'),
    h('button', { class: 'btn small', type: 'button', onclick: async ev => { await store.approve('events', e.id); ev.currentTarget.closest('li').remove(); } }, 'Schváliť')))) : h('p', { class: 'empty' }, 'Nič nečaká.')));
  for (const [table, label] of Object.entries(INBOX)) {
    const rows = await store.inbox(table).catch(() => []);
    const keys = rows.length ? Object.keys(rows[0]).filter(k => !['id', 'created_at', 'created'].includes(k)) : [];
    const csv = () => {
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const text = [keys.join(';'), ...rows.map(r => keys.map(k => q(r[k])).join(';'))].join('\n');
      const a = h('a', { href: URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' })), download: `${table}.csv` }); document.body.append(a); a.click(); a.remove();
    };
    put(body, section(`${label} (${rows.length})`, rows.length ? [
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, keys.map(k => h('th', {}, k)))), h('tbody', {}, rows.map(r => h('tr', {}, keys.map(k => h('td', {}, String(r[k] ?? '')))))))),
      h('button', { class: 'btn small', type: 'button', onclick: csv }, 'Stiahnuť CSV')] : h('p', { class: 'empty' }, 'Zatiaľ nič.')));
  }
}

function pageNotFound(root) {
  root.append(pageHead('Tu nič nie je', 'Stránka neexistuje alebo sa presunula.'), h('div', { class: 'wrap page-body' }, h('a', { class: 'btn', href: '#/' }, 'Na úvod')));
}

/* =====================================================================
   ROUTER
   ===================================================================== */
const ROUTES = [
  [/^#?\/?$/, pageHome, ''],
  [/^#\/rebricek$/, pageStandings, 'rebricek'],
  [/^#\/eventy$/, pageEvents, 'eventy'],
  [/^#\/event\/([\w-]+)$/, pageEvent, 'eventy'],
  [/^#\/jazdci$/, pageRiders, 'jazdci'],
  [/^#\/jazdec\/([\w-]+)$/, pageRider, 'jazdci'],
  [/^#\/parky$/, pageParks, 'parky'],
  [/^#\/shop$/, pageShop, 'shop'],
  [/^#\/partneri(?:\/(\w+))?$/, pagePartners, 'partneri'],
  [/^#\/admin$/, pageAdmin, ''],
];
let store, cleanup = null, onAuthChange = null, renderId = 0;
async function route() {
  const id = ++renderId;
  if (cleanup) { try { await cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  const hash = location.hash || '#/';
  const [re, page, nav] = ROUTES.find(([re]) => re.test(hash)) || [null, pageNotFound, ''];
  const args = re ? hash.match(re).slice(1) : [];
  const main = $('#main'); main.replaceChildren(); window.scrollTo(0, 0);
  document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === nav && !!nav));
  const res = await page(main, ...args);
  if (id !== renderId) { if (typeof res === 'function') res(); return; }
  cleanup = typeof res === 'function' ? res : null;
  main.focus({ preventScroll: true });
}

(async function start() {
  const menu = $('#menu');
  $('#menu-open').addEventListener('click', () => menu.showModal());
  menu.addEventListener('click', e => { if (e.target === menu || e.target.closest('a,[data-close]')) menu.close(); });
  store = await getStore(CONFIG);
  store.onAuth(() => onAuthChange && onAuthChange());
  window.addEventListener('hashchange', route);
  route();
})();
