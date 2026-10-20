import { CONFIG, SITE, POINTS, CATEGORIES, EVENTS, PARTNERS, FACTS, PACKAGES, PRODUCTS, SEASONS, SEASON_RULES, RULES, FAQ, RIDER_PRIVACY, RIDERS, PLAN, SKATEPARKS, CREWS, AWARD_POINTS, EVENT_MEDIA } from '../data.js';
import { tvScene } from './crt.js';
import { makeBracket, setWinner, clearWinner, toggleCurrent, isComplete, progress, placements, nextMatch, roundName, cleanNames } from './bracket.js';
import { mountBoard, MAX_STICKERS, DECKS, GRIPS, WHEELS, TRUCKS, DEFAULT_LOOK, SCENES, stickerCanvas, loadLogo, renderBoardImage,
  DECK_COLORS, GRIP_COLORS, WHEEL_COLORS, TRUCK_COLORS, PIXEL_LEVELS, isHex, lookName, setDeckPhoto, hasDeckPhoto, deckPhoto, photoToPixelArt } from './board.js';
import { mountBuilder, renderThumb, cleanLayout, slimLayout } from './park.js';
import { getStore, INBOX, newToken, isEmail } from './store.js';
import { badgesFor, badgeSvg } from './badges.js';
import { riderCard, canvasToFile } from './card.js';
import { qrCanvas, startScanner } from './qr.js';
import { mountMap, mountPicker, navLink } from './map.js';
import { initPwa } from './pwa.js';
import { deco } from './deco.js';
import { ITEMS, lootStickers, cacheProfile, cachedProfile, cachedInventory, localGhost, localLoadout, ghostSvg, cacheGhost, ghostOf, unlockedGhost } from './profile.js';
import { ghostLevel, LEVELS, LEVEL_XP, XP_RULES, xpOf, levelOfXp, STYLES } from './ghost.js';

/* ---------- pomocníci ---------- */
/* Skutočné adresy: web žije pod BASE (napr. /gosko/), vnútorné odkazy píšeme ako '#/eventy' a menia sa na /gosko/eventy. */
const APP_BASE = new URL(document.baseURI).pathname.replace(/[^/]*$/, '');
const toPath = r => (typeof r === 'string' && r.startsWith('#/') ? APP_BASE + r.slice(2) : r);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'href') el.setAttribute(k, toPath(v));
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k instanceof Node ? k : String(k)); }
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
/* ikona zo sady v index.html (cesty sa skopírujú, <use> s <base> nefunguje všade) */
function icon(id) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = document.getElementById('i-' + id)?.innerHTML || '';
  return s;
}
const put = (el, ...kids) => el.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
/* hĺbka navigácie v rámci webu: tlačidlo Späť vie, či je kam ísť späť, alebo má ísť o úroveň vyššie */
const navDepth = () => history.state?.n || 0;
const pushNav = p => history.pushState({ n: navDepth() + 1 }, '', p);
const go = r => { const p = toPath(r); if (p !== location.pathname + location.search) pushNav(p); route(); };
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MONTHS = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];
const MON = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec'];
const parseDate = d => { const [y, m, dd] = (d || '').split('-').map(Number); return y ? { y, m, d: dd } : null; };
const fmtDate = d => { const p = parseDate(d); return p ? `${p.d}. ${MONTHS[p.m - 1]} ${p.y}` : ''; };
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;
const catName = id => id === 'award' ? 'Best Trick' : (CATEGORIES.find(c => c.id === id)?.name || id);
const pointsFor = place => POINTS.find(p => place <= p.upTo).points;
const igLink = handle => h('a', { href: `https://www.instagram.com/${handle}/`, target: '_blank', rel: 'noopener' }, '@' + handle);

/* ---------- súkromie a výsledky (data.js + databáza) ---------- */
class UserError extends Error {}
function displayName(name) {
  if (RIDER_PRIVACY[slug(name)] !== 'initial') return name;
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase('sk')}.` : parts[0];
}
const BASE = new Map(EVENTS.map(ev => [ev.id, { status: ev.status, sticker: ev.sticker, results: ev.results || {}, awards: ev.awards || [] }]));
let REMOTE = { results: [], awards: [], brackets: [] };
const byPlace = (a, b) => a.place - b.place || a.name.localeCompare(b.name, 'sk');
/* Zloží výsledky z data.js a z databázy (databáza má prednosť pri tej istej kategórii eventu). */
function applyData() {
  for (const ev of EVENTS) {
    const base = BASE.get(ev.id), results = {};
    for (const [cat, list] of Object.entries(base.results)) results[cat] = list.map((x, i) => (typeof x === 'string' ? { name: x, place: i + 1 } : { ...x }));
    const remote = REMOTE.results.filter(r => r.event_id === ev.id);
    for (const cat of new Set(remote.map(r => r.category)))
      results[cat] = remote.filter(r => r.category === cat).map(r => ({ name: r.rider_name, place: r.place })).sort(byPlace);
    for (const cat of Object.keys(results)) results[cat] = results[cat].map(x => ({ ...x, name: displayName(x.name) }));
    ev.results = results;
    const ra = REMOTE.awards.filter(a => a.event_id === ev.id);
    ev.rawAwards = ra.length ? ra.map(a => ({ name: a.name, rider: a.rider_name })) : base.awards.map(a => ({ ...a }));
    ev.awards = ev.rawAwards.map(a => ({ ...a, rider: displayName(a.rider) }));
    ev.brackets = Object.fromEntries(REMOTE.brackets.filter(x => x.event_id === ev.id).map(x => [x.category, x.data]));
    const has = Object.values(results).some(l => l.length);
    ev.status = base.status === 'next' && has ? 'done' : base.status;
    ev.sticker = base.sticker === 'next' && ev.status === 'done' ? 'band' : base.sticker;
  }
}
async function refreshRemote() {
  try {
    const [results, awards, brackets] = await Promise.all([store.listResults(), store.listAwards(), store.listBrackets()]);
    REMOTE = { results, awards, brackets };
  } catch (err) { console.error(err); }
  applyData();
}

/* ---------- výsledky, rebríček, jazdci ---------- */
function allResults() {
  const rows = [];
  for (const ev of EVENTS) for (const [cat, list] of Object.entries(ev.results || {})) for (const x of list) rows.push({ ev, cat, name: x.name, place: x.place, slug: slug(x.name) });
  return rows;
}
const seasonYears = () => [...new Set(EVENTS.map(e => e.season))].sort((a, b) => b - a);
const bestPoints = list => {
  const s = [...list].sort((a, b) => b - a);
  return (SEASON_RULES.countBest ? s.slice(0, SEASON_RULES.countBest) : s).reduce((x, y) => x + y, 0);
};
/* Pri rovnakých bodoch má prednosť skorší event (GOSko 1 pred GOSko 2 …). */
const firstDate = o => o.first || '9999';
const awardPoints = name => AWARD_POINTS[name] || 0;
/* Ocenenia (Best Trick) ako vlastná kategória rebríčka: cat = 'award' */
const CAT_ORDER = ['open', 'u16', 'women', 'award'];
function standings(cat, eventId, season = SITE.season) {
  const m = new Map();
  if (cat === 'award') {
    for (const ev of EVENTS) {
      if (eventId ? ev.id !== eventId : ev.season !== season) continue;
      for (const a of ev.awards || []) {
        const sl = slug(a.rider), o = m.get(sl) || { name: a.rider, slug: sl, list: [], wins: 0, best: 1, events: 0, first: '9999', award: a.name };
        o.list.push(awardPoints(a.name)); o.wins++; o.events++; o.first = ev.date && ev.date < o.first ? ev.date : o.first; m.set(sl, o);
      }
    }
  } else {
    for (const r of allResults()) {
      if (r.cat !== cat) continue;
      if (eventId ? r.ev.id !== eventId : r.ev.season !== season) continue;
      const o = m.get(r.slug) || { name: r.name, slug: r.slug, list: [], wins: 0, best: 99, events: 0, first: '9999' };
      o.list.push(pointsFor(r.place)); o.wins += r.place === 1 ? 1 : 0; o.best = Math.min(o.best, r.place); o.events++;
      if (r.ev.date && r.ev.date < o.first) o.first = r.ev.date;
      m.set(r.slug, o);
    }
  }
  return [...m.values()].map(o => ({ ...o, points: eventId ? o.list[0] : bestPoints(o.list) }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best || firstDate(a).localeCompare(firstDate(b)) || a.name.localeCompare(b.name, 'sk'));
}
function riders() {
  const m = new Map();
  const get = name => { const s = slug(name); if (!m.has(s)) m.set(s, { name, slug: s, results: [], awards: [] }); return m.get(s); };
  for (const r of allResults()) get(r.name).results.push(r);
  for (const ev of EVENTS) for (const a of ev.awards || []) get(a.rider).awards.push({ ...a, ev });
  for (const r of m.values()) {
    const season = r.results.filter(x => x.ev.season === SITE.season);
    /* body zo súťaže + body za ocenenia (Best Trick) v tejto sezóne */
    r.points = bestPoints(season.map(x => pointsFor(x.place))) + r.awards.filter(a => a.ev.season === SITE.season).reduce((t, a) => t + awardPoints(a.name), 0);
    r.cats = [...new Set(r.results.map(x => x.cat))];
    r.events = [...new Set([...r.results.map(x => x.ev), ...r.awards.map(x => x.ev)])];
    r.catRank = Math.min(...r.cats.map(c => CAT_ORDER.indexOf(c)).filter(i => i >= 0), r.awards.length ? CAT_ORDER.indexOf('award') : 99);
    r.first = [...r.results, ...r.awards].map(x => x.ev.date || '9999').sort()[0] || '9999';
  }
  /* rovnaké body: Open pred U16 pred Babskou pred ocenením, potom skorší event, potom meno */
  return [...m.values()].sort((a, b) => b.points - a.points || a.catRank - b.catRank || a.first.localeCompare(b.first) || a.name.localeCompare(b.name, 'sk'));
}
const seasonEvents = () => EVENTS.filter(e => e.status === 'done' && e.season === SITE.season && Object.values(e.results || {}).some(l => l.length));
const riderBadges = r => badgesFor(r, { seasonEvents: seasonEvents() });
const LSX = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const eventSticker = ev => ({ kind: 'event', num: (String(ev.name || '').match(/\d+/) || [''])[0], title: ev.city, link: '#/event/' + ev.id });
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
function downloadIcs({ title, date, end, place, url }) {
  const p = parseDate(date); if (!p) return;
  const d1 = date.replaceAll('-', '');
  const e = parseDate(end) || p;
  const n = new Date(Date.UTC(e.y, e.m - 1, e.d + 1));
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
function formDialog({ title, intro, fields, submit, onSubmit, onClose }) {
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const custom = {};
  const form = h('form', { class: 'dlg-body', novalidate: true },
    intro && h('p', {}, intro),
    fields.map(f => {
      if (f.type === 'checkbox') return h('label', { class: 'check', 'data-field': f.name }, h('input', { type: 'checkbox', name: f.name, required: f.required, checked: f.checked || f.value }), h('span', {}, f.label));
      if (f.type === 'custom') { const c = f.render(); custom[f.name] = c; return h('div', { class: 'field', 'data-field': f.name }, f.label, c.el, f.hint && h('span', {}, f.hint)); }
      if (f.type === 'textarea') { const ta = h('textarea', { name: f.name, required: f.required, maxlength: f.max, placeholder: f.placeholder, rows: f.rows || 3 }); if (f.value) ta.value = f.value; return h('label', { class: 'field', 'data-field': f.name }, f.label, ta, f.hint && h('span', {}, f.hint)); }
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
  const values = () => Object.fromEntries(fields.map(f => [f.name, f.type === 'custom' ? custom[f.name].value() : f.type === 'checkbox' ? !!form.elements[f.name]?.checked : (form.elements[f.name]?.value || '').trim()]));
  const sync = () => {
    const v = values();
    for (const f of fields) if (f.showIf) {
      const on = f.showIf(v), wrap = form.querySelector(`[data-field="${f.name}"]`);
      if (!wrap || !form.elements[f.name]) continue;
      wrap.hidden = !on; form.elements[f.name].required = on && !!f.requiredIfShown;
    }
  };
  form.addEventListener('change', sync); sync();
  form.addEventListener('submit', async e => {
    e.preventDefault(); msg.textContent = '';
    if (!form.checkValidity()) { msg.textContent = 'Vyplň povinné políčka.'; form.reportValidity(); return; }
    for (const f of fields) if (f.type === 'custom' && custom[f.name].validate) { const err = custom[f.name].validate(); if (err) { msg.textContent = err; return; } }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const done = await onSubmit(values());
      if (done === false) return;
      Object.values(custom).forEach(c => c.destroy && c.destroy());
      form.replaceChildren(done instanceof Node ? done : h('p', {}, done || 'Hotovo.'), h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => dlg.close() }, 'Zavrieť')));
    } catch (err) { if (!(err instanceof UserError)) console.error(err); msg.textContent = err instanceof UserError || (err.message && store.mode === 'demo') ? err.message : 'Nepodarilo sa odoslať. Skús to znova.'; }
    finally { btn.disabled = false; }
  });
  dlg.addEventListener('close', () => { Object.values(custom).forEach(c => c.destroy && c.destroy()); dlg.remove(); onClose && onClose(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg); dlg.showModal();
  return dlg;
}
const authErr = err => {
  const m = String(err?.code || err?.message || '');
  if (/rate|429|over_email/i.test(m) || err?.status === 429) return 'Poslali sme už priveľa e-mailov. Skús to o chvíľu, alebo sa prihlás heslom.';
  if (/invalid.*credentials|invalid_grant/i.test(m)) return 'E-mail alebo heslo nesedí. Heslo si nastavíš v profile po prvom prihlásení cez e-mail.';
  if (m === 'code') return 'Zadaj 6-miestny kód z e-mailu.';
  if (m === 'link') return 'Toto nie je odkaz z prihlasovacieho e-mailu. Skopíruj celú adresu.';
  if (/expired|not found|invalid/i.test(m)) return 'Kód alebo odkaz už vypršal. Pošli si nový e-mail.';
  return 'Nepodarilo sa prihlásiť. Skús to znova.';
};
function loginDialog(after) {
  const done = () => { toast('Si prihlásený. Vitaj na GOSku!'); updateAccount(); after && after(); };
  formDialog({
    title: 'Prihlásenie', submit: 'Pokračovať',
    intro: 'Zadaj e-mail. Ak máš nastavené heslo, napíš ho. Inak ti pošleme e-mail s prihlasovacím odkazom.',
    fields: [
      { name: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email' },
      { name: 'password', label: 'Heslo (nepovinné)', type: 'password', autocomplete: 'current-password', hint: 'Heslo si nastavíš v profile po prvom prihlásení.' },
    ],
    onSubmit: async v => {
      if (v.password) {
        try { await store.loginPassword(v.email, v.password); } catch (err) { throw new UserError(authErr(err)); }
        done(); return 'Si prihlásený.';
      }
      try { await store.login(v.email); } catch (err) { throw new UserError(authErr(err)); }
      const msg = h('p', { class: 'form-msg', role: 'alert' });
      const code = h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, placeholder: '123456', class: 'code-input' });
      const link = h('textarea', { name: 'link', rows: 3, placeholder: 'https://…' });
      const wrap = h('div', { class: 'login-step' });
      const run = async (btn, fn) => {
        msg.textContent = ''; btn.disabled = true;
        try { await fn(); wrap.replaceChildren(h('p', { class: 'login-ok' }, 'Si prihlásený. ', h('a', { href: '#/profil' }, 'Otvoriť profil'))); done(); }
        catch (err) { msg.textContent = authErr(err); }
        finally { btn.disabled = false; }
      };
      wrap.append(
        h('p', {}, h('strong', {}, `Poslali sme e-mail na ${v.email}.`), ' Otvor ho v tomto zariadení a klikni na odkaz. Ak je v ňom 6-miestny kód, zadaj ho sem.'),
        h('label', { class: 'field' }, 'Kód z e-mailu', code),
        h('button', { class: 'btn primary', type: 'button', onclick: e => run(e.currentTarget, () => store.verifyCode(v.email, code.value)) }, 'Prihlásiť kódom'),
        h('details', { class: 'login-help' },
          h('summary', {}, 'Odkaz ťa hodil na stránku, ktorá sa nenačítala?'),
          h('p', {}, 'Skopíruj celú adresu z prehliadača (alebo odkaz z e-mailu) a vlož ju sem.'),
          link,
          h('button', { class: 'btn', type: 'button', onclick: e => run(e.currentTarget, () => store.verifyLink(link.value)) }, 'Prihlásiť odkazom')),
        msg);
      return wrap;
    },
  });
}
async function requireLogin(after) { if (await store.signedIn()) return true; loginDialog(after); return false; }

function lightbox(photos, index) {
  let i = index;
  const img = h('img', { alt: '' });
  const cnt = h('span', { class: 'lb-count mono' });
  const show = () => { img.src = photos[i].src; img.alt = photos[i].alt; cnt.textContent = photos.length > 1 ? `${i + 1} / ${photos.length}` : ''; };
  // potiahnutie prstom doľava/doprava prepína fotky
  let sx = null;
  img.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', e => { if (sx === null) return; const d = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(d) > 50) { i = (i + (d < 0 ? 1 : -1) + photos.length) % photos.length; show(); } }, { passive: true });
  const dlg = h('dialog', { class: 'lightbox', 'aria-label': 'Fotka' },
    img,
    h('div', { class: 'lb-bar' }, cnt,
      h('button', { class: 'btn', type: 'button', onclick: () => { i = (i - 1 + photos.length) % photos.length; show(); } }, 'Predošlá'),
      h('button', { class: 'btn', type: 'button', onclick: () => { i = (i + 1) % photos.length; show(); } }, 'Ďalšia'),
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Zavrieť')));
  dlg.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { i = (i + 1) % photos.length; show(); } if (e.key === 'ArrowLeft') { i = (i - 1 + photos.length) % photos.length; show(); } });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  show(); document.body.append(dlg); dlg.showModal();
}

/* ---------- spoločné kúsky stránok ---------- */
const ghostTag = () => h('img', { class: 'ghost-tag', src: 'img/ghost-cream.svg', alt: '', width: 92, height: 104, 'aria-hidden': 'true' });
const pageHead = (title, lead, ...extra) => h('div', { class: 'wrap page-head' }, h('div', { class: 'ph-row' }, h('h1', { class: 'wide' }, title)), lead && h('p', { class: 'lead' }, lead), extra);
function bands() {
  return h('nav', { class: 'bands', 'aria-label': 'Eventy GOSko' }, EVENTS.filter(e => e.status === 'done' || e.status === 'next').map(ev =>
    h('a', { class: 'band' + (ev.status === 'next' ? ' next' : ''), href: '#/event/' + ev.id },
      h('span', { class: 'city wide' }, ev.city),
      h('span', { class: 'meta cond' }, ev.status === 'next' ? (ev.date ? `Ďalší stop, ${fmtDate(ev.date)}` : `Ďalší stop, ${soonDate(ev)}`) : [ev.place, fmtDate(ev.date)].filter(Boolean).join(', ') || 'Odjazdené'),
      h('span', { class: 'arr', 'aria-hidden': 'true' }, '→'))));
}
function standingsListPlain(rows, { limit, eventMode } = {}) {
  if (!rows.length) return h('p', { class: 'empty' }, 'Výsledky doplníme.');
  return h('ol', { class: 'standings' }, rows.slice(0, limit || rows.length).map((r, i) =>
    h('li', {},
      h('span', { class: 'rank wide', 'aria-hidden': 'true' }, eventMode ? r.best : i + 1, i === 0 ? deco('circle', 'd-circle') : null),
      h('a', { class: 'st-name', href: '#/jazdec/' + r.slug }, r.name),
      h('span', { class: 'st-meta' }, eventMode ? `${r.best}. miesto` : `${r.events} ${plural(r.events, 'event', 'eventy', 'eventov')}, najlepšie ${r.best}. miesto`),
      h('span', { class: 'st-pts cond' }, `${r.points} b.`))));
}
/* ---------- avatary a 2D dosky jazdcov ---------- */
const AV_TONES = ['#2b2420', '#1f2522', '#2d1c1c', '#25212c', '#2a2924'];
const hashStr = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = n => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('sk');
function avatarEl(name, s, { rank } = {}) {
  const info = RIDERS[s] || {};
  const cls = 'avatar' + (rank && rank <= 3 ? ' r' + rank : '');
  if (info.photo) return h('span', { class: cls }, h('img', { src: info.photo, alt: '', loading: 'lazy', width: 120, height: 120 }));
  return h('span', { class: cls + ' gen', style: `--av:${AV_TONES[hashStr(s) % AV_TONES.length]}`, 'aria-hidden': 'true' }, h('span', {}, initials(name)));
}
/* vzhľad dosky jazdca: z data.js, inak sa odvodí z mena, aby každý mal inú */
function riderLook(s) {
  const mine = RIDERS[s]?.extra?.loadout;   // doska, ktorú si jazdec postavil v editore
  if (mine && typeof mine === 'object') return { ...DEFAULT_LOOK, ...mine };
  if (RIDERS[s]?.look) return { ...DEFAULT_LOOK, ...RIDERS[s].look };
  const n = hashStr(s), pick = (o, k) => Object.keys(o)[Math.floor(n / k) % Object.keys(o).length];
  return { deck: pick(DECKS, 1), grip: pick(GRIPS, 5), wheels: pick(WHEELS, 15), trucks: pick(TRUCKS, 45) };
}
const boardImgCache = new Map();
let boardQueue = Promise.resolve(), boardIO = null;
function boardImg(r, cls = '') {
  const img = h('img', { class: 'board-img ' + cls, alt: `Doska jazdcu ${r.name}`, width: 150, height: 210, decoding: 'async' });
  const key = r.slug + JSON.stringify(RIDERS[r.slug]?.extra?.loadout || '');
  if (boardImgCache.has(key)) { img.src = boardImgCache.get(key); return img; }
  img.classList.add('loading');
  img._load = () => {
    boardQueue = boardQueue.then(async () => {
      if (!boardImgCache.has(key)) {
        const c = await renderBoardImage(riderStickers(r), { width: 300, height: 420, tilt: -.3, turn: -.55, look: riderLook(r.slug) });
        boardImgCache.set(key, c.toDataURL('image/png'));
      }
      img.src = boardImgCache.get(key); img.classList.remove('loading');
    }).catch(err => console.error(err));
  };
  if (!('IntersectionObserver' in window)) { img._load(); return img; }
  boardIO ||= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { boardIO.unobserve(e.target); e.target._load(); } }), { rootMargin: '300px' });
  boardIO.observe(img);
  return img;
}
const riderMap = () => new Map(riders().map(r => [r.slug, r]));
function standingsList(rows, { limit, eventMode, from = 0 } = {}) {
  if (!rows.length) return h('p', { class: 'empty' }, 'Výsledky doplníme.');
  const R = riderMap(), max = Math.max(1, ...rows.map(r => r.points));
  const list = rows.slice(from, limit || rows.length);
  if (!list.length) return null;
  return h('ol', { class: 'standings v2', start: String(from + 1) }, list.map((r, k) => {
    const i = from + k, rd = R.get(r.slug);
    return h('li', { class: i < 3 ? 'top' : '' },
      h('span', { class: 'rank', 'aria-hidden': 'true' }, eventMode ? r.best : i + 1),
      avatarEl(r.name, r.slug, { rank: i + 1 }),
      h('span', { class: 'st-main' },
        h('a', { class: 'st-name', href: '#/jazdec/' + r.slug }, r.name),
        h('span', { class: 'st-meta' }, eventMode ? `${r.best}. miesto` : `${r.events} ${plural(r.events, 'event', 'eventy', 'eventov')} · najlepšie ${r.best}. miesto`),
        h('span', { class: 'st-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.max(4, Math.round(r.points / max * 100))}%` }))),
      h('span', { class: 'st-pts' }, String(r.points), h('small', {}, ' b.')),
      rd ? boardImg(rd, 'st-board') : null);
  }));
}
function podiumEl(rows) {
  if (!rows.length) return null;
  const R = riderMap();
  return h('div', { class: 'podium3' + (rows.length < 3 ? ' few' : '') }, [1, 0, 2].filter(i => rows[i]).map(i => {
    const r = rows[i], rd = R.get(r.slug);
    return h('a', { class: `pod pod-${i + 1}`, href: '#/jazdec/' + r.slug },
      h('span', { class: 'pod-art' }, rd ? boardImg(rd, 'pod-board') : null, avatarEl(r.name, r.slug, { rank: i + 1 })),
      h('span', { class: 'pod-name' }, r.name),
      h('span', { class: 'pod-pts' }, `${r.points} b.`),
      h('span', { class: 'pod-step' }, h('span', {}, String(i + 1))));
  }));
}
const scoringNote = () => h('p', { class: 'note' },
  `Body: 1. miesto ${pointsFor(1)}, 2. miesto ${pointsFor(2)}, 3. až 4. miesto ${pointsFor(3)}, 5. až 8. ${pointsFor(5)}, 9. až 16. ${pointsFor(9)}, účasť ${pointsFor(99)}. `,
  SEASON_RULES.countBest ? `Do rebríčka sa rátajú ${SEASON_RULES.countBest} najlepšie výsledky jazdca. ` : '',
  'Z prvých eventov poznáme len top 3, od ďalšieho zapisujeme celý pavúk. Best Trick je ocenenie za 20 b.');
function photoGrid(photos, limit) {
  const list = limit ? photos.slice(0, limit) : photos;
  return h('div', { class: 'gallery' }, list.map((p, i) => h('button', { type: 'button', class: 'ph', onclick: () => lightbox(photos, i), 'aria-label': 'Zväčšiť: ' + p.alt },
    h('img', { src: p.src, alt: p.alt, loading: 'lazy', width: 1400, height: 933 }),
    p.credit ? h('span', { class: 'credit' }, p.credit) : null,
    p.pending ? h('span', { class: 'tag pend' }, 'Čaká na schválenie') : null)));
}
const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? u : null);
const ytId = u => { const m = String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/); return m ? m[1] : null; };

/* ---------- partneri ---------- */
const partnerNode = p => (p.logo ? h('img', { class: 'p-logo', src: p.logo, alt: p.name, loading: 'lazy' }) : h('span', { class: 'p-name' }, p.name));
const partnerItem = (id, p) => h('li', {}, partnerNode(p), p.about ? h('a', { href: '#/partner/' + id }, 'O partnerovi') : null, igLink(p.instagram));
/* fotky z eventov (img/gosko1): [šírka, výška] originálu, menšia a väčšia verzia sú pripravené */
const PHOTOS = { 'board-red': [2250, 1500], 'flip-bollard': [2576, 1717], 'crowd-board': [2576, 1717], 'crowd-low': [2576, 1717], 'carry-table': [2576, 1717], 'flip-santacruz': [2576, 1717],
  'flip-black': [1717, 2576], 'flip-car': [1717, 2576], 'car-sitting': [1717, 2576], hug: [1717, 2576],
  'flip-fisheye': [1717, 2576], 'flip-lakers': [1717, 2576], 'flip-tank': [1717, 2576], 'bench-crew': [1717, 2576], 'bowl-portrait': [1717, 2576], peace: [1717, 2576],
  'cap-gesture': [2576, 1717], 'mc-newspirit': [2576, 1717], pointing: [2576, 1717] };
function photoImg(name, alt, pos) {
  const [w, hgt] = PHOTOS[name], land = w >= hgt, sw = land ? 720 : 640, lw = land ? 1600 : 1100;
  return h('img', { src: `img/gosko1/${name}-s.webp`, srcset: `img/gosko1/${name}-s.webp ${sw}w, img/gosko1/${name}-l.webp ${lw}w`, sizes: land ? '(max-width: 900px) 100vw, 50vw' : '(max-width: 900px) 50vw, 25vw',
    width: lw, height: Math.round(lw * hgt / w), alt, loading: 'lazy', decoding: 'async', style: pos ? `object-position:${pos}` : null });
}
/* pás fotiek: items = [[názov, popis, tvar]], tvar 'wide' alebo 'tall' */
function photoBand({ kicker, title, lead, items, cta, cls = '' }) {
  return h('section', { class: 'sec pband ' + cls }, h('div', { class: 'wrap' },
    kicker ? h('span', { class: 'mono hs-k' }, kicker) : null, title ? h('h2', { class: 'wide' }, title) : null, lead ? h('p', { class: 'lead' }, lead) : null,
    h('div', { class: `pb-grid n${items.length}` + (items.length === 3 && items.every(i => i[2] === 'tall') ? ' t3' : '') }, items.map(([n, alt, shape, pos]) => h('figure', { class: 'pb-it ' + (shape || '') }, photoImg(n, alt, pos)))),
    cta ? h('div', { class: 'actions cta-row' }, cta) : null));
}
/* nadpis stránky s fotkou v pozadí */
const photoHead = (head, name, pos = '50% 40%') => { const u = f => `url(${new URL(`img/gosko1/${name}-${f}.webp`, document.baseURI).href})`; return h('div', { class: 'ph-photo', style: `--ph-s:${u('s')};--ph-l:${u('l')};--ph-pos:${pos}` }, head); };

/* jemná fotka v pozadí celej sekcie (veľmi stmavená, aby neprekážala obsahu) */
function photoBg(el, name, pos = '50% 50%') {
  const u = f => `url(${new URL(`img/gosko1/${name}-${f}.webp`, document.baseURI).href})`;
  el.classList.add('sec-photo'); el.style.setProperty('--ph-s', u('s')); el.style.setProperty('--ph-l', u('l')); el.style.setProperty('--ph-pos', pos);
  return el;
}

function partnersStrip() {
  const withLogo = Object.entries(PARTNERS).filter(([, p]) => p.logo);
  if (!withLogo.length) return null;
  return h('section', { class: 'sec logo-strip' }, h('div', { class: 'wrap' },
    h('h2', { class: 'wide sub' }, 'Partneri'),
    h('ul', {}, withLogo.map(([id, p]) => h('li', {}, h('a', { href: p.about ? '#/partner/' + id : `https://www.instagram.com/${p.instagram}/`, target: p.about ? null : '_blank', rel: 'noopener', 'aria-label': p.name }, partnerNode(p)))))));
}

/* ---------- odpočet do ďalšieho eventu ---------- */
const WEEKDAYS = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
function daysUntil(dateStr) {
  const p = parseDate(dateStr); if (!p) return null;
  const t0 = new Date();
  return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(t0.getFullYear(), t0.getMonth(), t0.getDate())) / 864e5);
}
/* krátky dátum pre ďalší event bez presného dátumu: „14. alebo 21. 11.“ (z ev.when), inak „čoskoro“ */
const soonDate = ev => ev?.when ? String(ev.when).replace(/\s*20\d\d\s*$/, '') : 'čoskoro';
const nextEvent = () => EVENTS.filter(e => e.status === 'next').sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0];
function countdownEl(ev) {
  if (!ev) return null;
  const d = daysUntil(ev.date), p = parseDate(ev.date);
  const when = p ? `${WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]} ${fmtDate(ev.date)}` : '';
  let num, unit, meta;
  if (d === null) { num = 'Čoskoro'; unit = 'ďalšie GOSko'; meta = `${ev.city}: dátum a miesto zverejníme na Instagrame.`; }
  else if (d > 0) { num = String(d); unit = `${plural(d, 'deň', 'dni', 'dní')} do ďalšieho GOSka`; meta = [ev.city, when, ev.place].filter(Boolean).join(', '); }
  else if (d === 0) { num = 'Dnes'; unit = 'je GOSko'; meta = [ev.city, ev.place].filter(Boolean).join(', '); }
  else { num = 'Výsledky'; unit = 'čoskoro'; meta = `${ev.name} sa už odohral.`; }
  const open = d === null || d >= 0;
  return h('section', { class: 'countdown', 'aria-label': 'Odpočet do ďalšieho eventu' }, h('div', { class: 'wrap cd-in' },
    h('div', { class: 'cd-main' }, h('span', { class: 'cd-num wide' }, num), h('span', { class: 'cd-unit wide' }, unit)),
    h('p', { class: 'cd-meta cond' }, meta),
    h('div', { class: 'actions' },
      open && ev.registration ? h('button', { class: 'btn primary', type: 'button', onclick: () => registerDialog(ev) }, 'Chcem jazdiť') : null,
      p && open ? h('button', { class: 'btn', type: 'button', onclick: () => downloadIcs({ title: ev.name, date: ev.date, place: ev.place }) }, 'Do kalendára') : null,
      d === null ? h('button', { class: 'btn', type: 'button', onclick: () => newsletterDialog('countdown') }, 'Daj mi vedieť e-mailom') : null,
      h('a', { class: 'btn', href: '#/event/' + ev.id }, 'Detail eventu'))));
}

/* ---------- pavúk ---------- */
function bracketEl(b, { interactive = false, onPick, onCurrent, onClear, tv = false, name = x => x } = {}) {
  const side = (mt, who, r, m) => {
    const win = !!mt.w && !mt.bye && mt.w === who, lose = !!mt.w && !mt.bye && !!who && mt.w !== who;
    const label = who ? name(who) : 'čaká sa';
    const cls = 'br-side' + (win ? ' win' : '') + (lose ? ' lose' : '') + (!who ? ' empty' : '');
    const inner = [h('span', {}, label, mt.bye ? h('small', {}, ' voľný postup') : null), win ? h('span', { class: 'br-tick', 'aria-hidden': 'true' }, '✓') : null];
    if (interactive && who && mt.a && mt.b && !mt.bye) return h('button', { type: 'button', class: cls, 'aria-pressed': String(win), onclick: () => onPick(r, m, who) }, inner);
    return h('div', { class: cls }, inner);
  };
  const matchEl = (mt, r, m) => {
    const cur = !!b.current && b.current.r === r && b.current.m === m;
    const canMark = interactive && !mt.bye && mt.a && mt.b;
    return h('div', { class: 'br-match' + (cur ? ' current' : '') + (mt.bye ? ' bye' : ''), 'data-r': r, 'data-m': m },
      cur ? h('span', { class: 'br-live' }, 'Teraz jazdia') : null,
      mt.bye ? side(mt, mt.a || mt.b, r, m) : [side(mt, mt.a, r, m), side(mt, mt.b, r, m)],
      canMark ? h('div', { class: 'br-tools' },
        !mt.w ? h('button', { type: 'button', class: 'br-mini', 'aria-pressed': String(cur), onclick: () => onCurrent(r, m) }, cur ? 'Zrušiť „teraz jazdia“' : 'Teraz jazdia') : null,
        mt.w ? h('button', { type: 'button', class: 'br-mini', onclick: () => onClear(r, m) }, 'Zrušiť víťaza') : null) : null);
  };
  const fin = b.rounds[b.rounds.length - 1][0];
  const rows0 = b.rounds[0].reduce((s, mt) => s + (mt.bye ? 1 : 2), 0), units = (1.9 * rows0 + .9 * b.rounds[0].length).toFixed(1);
  return h('div', { class: 'bracket' + (tv ? ' on-tv' : ''), role: 'group', 'aria-label': 'Pavúk', style: `--units:${units}` },
    b.rounds.map((round, r) => h('div', { class: 'br-col' }, h('h4', { class: 'br-title wide' }, roundName(round.length)), h('div', { class: 'br-matches' }, round.map((mt, m) => matchEl(mt, r, m))))),
    fin.w ? h('div', { class: 'br-col br-champ' }, h('h4', { class: 'br-title wide' }, 'Víťaz'), h('div', { class: 'br-matches' }, h('div', { class: 'br-winner wide' }, name(fin.w)))) : null);
}
function placeList(list, { limit = 8 } = {}) {
  const row = x => h('li', {}, h('span', { class: 'rank wide' }, x.place), h('a', { href: '#/jazdec/' + slug(x.name) }, x.name), h('span', { class: 'cond' }, `${pointsFor(x.place)} b.`));
  const rest = list.slice(limit);
  return h('div', {}, h('ol', {}, list.slice(0, limit).map(row)),
    rest.length ? h('details', { class: 'more-results' }, h('summary', {}, `Ďalší jazdci (${rest.length})`), h('ol', {}, rest.map(row))) : null);
}

/* ---------- cesta do finále ---------- */
function finaleTable(cat, season) {
  const F = SEASON_RULES.finale;
  if (!F || season !== SITE.season) return null;
  const st = standings(cat, null, season);
  if (!st.length) return null;
  const left = F.eventsLeft ?? EVENTS.filter(e => e.status === 'next' && e.season === season).length;
  const gain = left * pointsFor(1), cut = st[F.slots - 1]?.points ?? 0;
  const rows = st.map((r, i) => {
    const rivals = st.filter((o, j) => j !== i && o.points + gain >= r.points).length;
    const state = rivals < F.slots ? 'secure' : i < F.slots ? 'in' : r.points + gain >= cut ? 'alive' : 'out';
    return { ...r, rank: i + 1, state, gap: Math.max(0, cut - r.points) };
  });
  return { F, rows, left };
}
function finaleEl(cat, season) {
  const ft = finaleTable(cat, season);
  if (!ft) return null;
  const label = { secure: 'Postupuje', in: 'Zatiaľ postupuje', alive: 'Ešte môže', out: 'Mimo hry' };
  return h('section', { class: 'finale' },
    h('h2', { class: 'wide sub' }, 'Cesta do finále'),
    h('p', { class: 'note' }, `Do finále postupuje prvých ${ft.F.slots} jazdcov v rebríčku. `,
      ft.left ? `Do konca kvalifikácie ${plural(ft.left, 'zostáva', 'zostávajú', 'zostáva')} ${ft.left} ${plural(ft.left, 'event', 'eventy', 'eventov')}.` : 'Kvalifikácia je uzavretá.'),
    h('ol', { class: 'finale-list' }, ft.rows.map(r => h('li', { class: 'fin-' + r.state + (r.rank === ft.F.slots ? ' cutline' : '') },
      h('span', { class: 'rank wide', 'aria-hidden': 'true' }, r.rank),
      h('a', { class: 'st-name', href: '#/jazdec/' + r.slug }, r.name),
      h('span', { class: 'fin-state' }, label[r.state]),
      h('span', { class: 'st-meta' }, r.state === 'alive' ? (r.gap ? `Do postupovej čiary chýba ${r.gap} b.` : 'Je na postupovej čiare.') : `${r.points} b.`)))));
}

/* =====================================================================
   STRÁNKY
   ===================================================================== */
/* ---------- úvodka: hra S.K.A.T.E. a vlastná doska ---------- */
const LSx = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bez úložiska to ide aj tak */ } },
};
const MY_STICKERS = 'gosko:my-stickers', MY_DECK = 'gosko:deck';
const SKATE_STICKER = { kind: 'skate', title: 'S.K.A.T.E.' };
function toast(text, img) {
  const t = h('div', { class: 'toast', role: 'status' }, img ? h('img', { src: img, alt: '' }) : null, h('span', {}, text));
  document.body.append(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 600); }, 4200);
}
function tickerEl() {
  const items = [];
  for (const ev of EVENTS) {
    if (ev.status === 'next') items.push(`Ďalší stop: ${ev.city}${ev.date ? ' ' + fmtDate(ev.date) : ', ' + soonDate(ev)}`);
    else if (ev.status === 'done') {
      items.push(`${ev.city}${ev.date ? ' ' + fmtDate(ev.date) : ''} · odjazdené`);
      const win = (ev.results?.open || [])[0];
      if (win) items.push(`Víťaz Open ${ev.city}: ${typeof win === 'string' ? win : win.name}`);
    }
  }
  items.push('Postav si skatepark a dostaň sa do top 10', 'Zavolaj si GOSko do svojho mesta', 'Klikni na S.K.A.T.E. a odomkni nálepku');
  const run = () => items.map(t => h('span', {}, t));
  return h('div', { class: 'ticker', 'aria-hidden': 'true' }, h('div', { class: 'ticker-in' }, run(), run()));
}

/* =====================================================================
   ÚVODKA
   ===================================================================== */
const MY_LOOK = 'gosko:board-look', MY_SCENE = 'gosko:board-scene';
const myLook = () => ({ ...DEFAULT_LOOK, deck: LSx.get(MY_DECK, 'cream'), ...LSx.get(MY_LOOK, {}) });
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const shortDate = d => { const p = parseDate(d); return p ? `${p.d}. ${p.m}.` : ''; };
const upcomingCommunity = async () => {
  const t = todayStr();
  return (await store.listEvents()).filter(e => !e.pending && (e.end_date || e.date) >= t).sort((a, b) => a.date.localeCompare(b.date));
};
const shuffled = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const allPhotos = () => EVENTS.flatMap(e => e.photos || []);

/* rotátor noviniek v hero: každých 6 sekúnd ďalšia */
/* nálepka ďalšieho eventu vpravo hore v titulke + tlačidlo na registráciu */
function heroSticker(next) {
  if (!next || !next.registration) return null;
  const d = next.date ? daysUntil(next.date) : null;
  if (d !== null && d < 0) return null;
  const img = h('img', { alt: '', width: 240, height: 240 });
  loadLogo().then(logo => { img.src = stickerCanvas(eventSticker(next), logo, 480).toDataURL(); }).catch(err => console.error(err));
  return h('div', { class: 'vh-stk' },
    h('a', { class: 'vh-stk-img', href: '#/event/' + next.id, 'aria-label': next.name + ': info o evente' }, img),
    h('button', { class: 'vh-stk-btn', type: 'button', onclick: () => registerDialog(next) }, 'Registruj sa'));
}

function newsRotator(next) {
  const stage = h('div', { class: 'nr-stage', 'aria-live': 'polite' });
  const count = h('span', { class: 'nr-count mono' });
  const bar = h('span', { class: 'nr-bar', 'aria-hidden': 'true' }, h('i'));
  let slides = [], i = 0, timer = null, paused = false;
  const slideEl = sl => h('a', { class: 'nr-slide', href: sl.href },
    h('span', { class: 'nr-img' + (sl.img ? '' : ' ghost') }, h('img', { src: sl.img || 'img/ghost-cream.svg', alt: '' })),
    h('span', { class: 'nr-txt' }, h('span', { class: 'nr-k' }, sl.kicker), h('span', { class: 'nr-t' }, sl.title), h('span', { class: 'nr-s' }, sl.sub || '')),
    h('span', { class: 'nr-go', 'aria-hidden': 'true' }, '→'));
  const restart = () => { clearTimeout(timer); if (!paused && slides.length > 1) timer = setTimeout(() => show(i + 1, 1), 6000); };
  function show(k, dir = 1) {
    if (!slides.length) return;
    i = (k + slides.length) % slides.length;
    const el = slideEl(slides[i]);
    const old = [...stage.children];
    if (old.length && !REDUCED()) { el.classList.add(dir > 0 ? 'from-r' : 'from-l'); old.forEach(o => { o.classList.add(dir > 0 ? 'to-l' : 'to-r'); setTimeout(() => o.remove(), 520); }); }
    else old.forEach(o => o.remove());
    stage.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('from-r', 'from-l')));
    count.textContent = `${i + 1} / ${slides.length}`;
    const b = bar.firstChild; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    box.classList.toggle('single', slides.length < 2);
    restart();
  }
  const box = h('div', { class: 'nr', role: 'region', 'aria-label': 'Novinky', onmouseenter: () => { paused = true; box.classList.add('paused'); clearTimeout(timer); }, onmouseleave: () => { paused = false; box.classList.remove('paused'); show(i); } },
    h('div', { class: 'nr-head' }, h('span', { class: 'nr-live' }, h('i', { 'aria-hidden': 'true' }), 'Novinky'), count,
      h('span', { class: 'nr-nav' },
        h('button', { type: 'button', 'aria-label': 'Predošlá novinka', onclick: () => show(i - 1, -1) }, '←'),
        h('button', { type: 'button', 'aria-label': 'Ďalšia novinka', onclick: () => show(i + 1, 1) }, '→'))),
    stage, bar);
  if (next) { const n = next.date ? dayDiff(todayStr(), next.date) : null;
    slides.push({ kicker: n !== null && n >= 0 ? `Ďalší stop · ${n === 0 ? 'dnes!' : `o ${n} ${plural(n, 'deň', 'dni', 'dní')}`}` : `Ďalší stop · ${soonDate(next)}`, title: next.name, sub: next.date ? `${fmtDate(next.date)}${next.place ? ', ' + next.place : ''}. Zaregistruj sa.` : 'Zaregistruj sa a dáme ti vedieť medzi prvými.', href: '#/event/' + next.id, img: null }); }
  show(0);
  if (next) loadLogo().then(logo => { slides[0].img = stickerCanvas(eventSticker(next), logo, 256).toDataURL(); if (i === 0) { const im = stage.lastChild?.querySelector('.nr-img'); if (im) { im.classList.remove('ghost'); im.firstChild.src = slides[0].img; } } }).catch(() => {});
  loadPosts().then(posts => { slides.push(...posts.slice(0, 5).map(p => ({ kicker: 'Novinka · ' + fmtDateTime(p.created_at), title: p.title, sub: p.summary, href: '#/novinka/' + p.id, img: p.image_url }))); show(i); });
  return { el: box, stop: () => clearTimeout(timer) };
}

/* skate kalendár: pás eventov s vlajkami, pripnutý v hlavičke pod logom (vytvorí sa raz, nie pri každej stránke) */
function mountRoller(host) {
  const inner = h('div', { class: 'ticker-in' });
  const nav = h('nav', { class: 'ticker er er-top', 'aria-label': 'Skate eventy doma a vo svete' },
    h('a', { class: 'er-label mono', href: '#/eventy#kalendar' }, 'Skate kalendár'), h('div', { class: 'er-track' }, inner));
  const fill = list => {
    const gk = EVENTS.filter(e => e.status === 'next').map(e => ({ ours: true, name: e.name, country: 'Slovensko', label: e.date ? shortDate(e.date) : soonDate(e), href: '#/event/' + e.id }));
    const items = [...gk, ...list.slice(0, 20).map(e => ({ ...e, label: shortDate(e.date), href: '#/eventy#kalendar' }))];
    const run = () => items.map(e => h('a', { href: e.href, class: e.ours ? 'ours' : '' }, flag(e.country), h('b', {}, e.label), e.city ? h('span', { class: 'er-city' }, e.city) : null, h('span', {}, e.name)));
    inner.replaceChildren(...run(), ...run(), ...(items.length < 6 ? [...run(), ...run()] : []));
    inner.style.animationDuration = `${Math.max(24, items.length * 7)}s`;
  };
  fill([]);
  host.replaceChildren(nav);
  return { load: () => upcomingCommunity().then(fill).catch(err => console.error(err)) };
}

/* naše eventy ako nálepky: odlepíš a vojdeš do sveta eventu */
function stickerWall({ bare = false } = {}) {
  const evs = [...EVENTS].sort((a, b) => (a.status === 'next' ? -1 : 0) - (b.status === 'next' ? -1 : 0) || (b.date || '').localeCompare(a.date || ''));
  const imgs = new Map();
  const peel = (ev, e) => {
    ev.preventDefault();
    const a = ev.currentTarget, src = a.querySelector('.sw-st img');
    if (REDUCED() || !src || !src.src) return go('#/event/' + e.id);
    const r = src.getBoundingClientRect();
    const fly = h('img', { class: 'sw-fly', src: src.src, alt: '', style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` });
    document.body.append(fly); a.classList.add('peeled');
    try { sessionStorage.setItem('gosko:peel', e.id); } catch {}
    const cx = innerWidth / 2 - (r.left + r.width / 2), cy = innerHeight / 2 - (r.top + r.height / 2);
    fly.animate([
      { transform: 'none', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.4))' },
      { transform: 'translate(10px,-40px) rotate(-16deg) perspective(600px) rotateX(38deg) scale(1.1)', filter: 'drop-shadow(0 30px 30px rgba(0,0,0,.55))', offset: .35 },
      { transform: `translate(${cx}px,${cy}px) rotate(6deg) scale(3.2)`, opacity: 0 },
    ], { duration: 820, easing: 'cubic-bezier(.55,0,.25,1)' }).onfinish = () => { fly.remove(); go('#/event/' + e.id); };
  };
  const wall = h('div', { class: 'sw' }, evs.map((e, k) => {
    const img = h('img', { alt: '', width: 260, height: 260 }); imgs.set(e.id, img);
    const isNext = e.status === 'next';
    return h('div', { class: 'sw-item' + (isNext ? ' next' : ''), style: `--r:${[-3, 2, -2, 3][k % 4]}deg` },
      h('a', { class: 'sw-link', href: '#/event/' + e.id, onclick: ev => peel(ev, e), 'aria-label': `${e.name}: otvoriť svet eventu` },
        h('span', { class: 'sw-st' }, img, h('span', { class: 'sw-corner', 'aria-hidden': 'true' }))),
      h('span', { class: 'sw-cap' },
        h('b', { class: 'sw-date' }, e.date ? fmtDate(e.date) : soonDate(e)),
        isNext && e.registration ? h('button', { class: 'sw-reg', type: 'button', onclick: () => registerDialog(e) }, 'Registruj sa')
          : h('a', { class: 'sw-more', href: '#/event/' + e.id }, isNext ? 'Info' : 'Fotky a výsledky', h('span', { 'aria-hidden': 'true' }, ' →'))));
  }));
  loadLogo().then(logo => evs.forEach(e => { imgs.get(e.id).src = stickerCanvas(eventSticker(e), logo, 720).toDataURL(); })).catch(err => console.error(err));
  if (bare) return wall;
  return h('section', { class: 'hs sw-sec', id: 'eventy' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('div', {},
      h('h2', {}, 'Naše eventy')),
      h('a', { class: 'btn cta', href: '#/eventy' }, 'Všetky eventy', icon('arrow'))),
    wall));
}

/* Spoločný profil (GOSko web + Ghoskate): duch, doska a loot. Prihlásený má dosku uloženú v účte. */
async function syncProfile() {
  if (!store || store.mode !== 'live') return;
  try {
    if (!(await store.signedIn())) { cacheProfile(null, []); return; }
    const [p, inv] = await Promise.all([store.myProfile(), store.myInventory().catch(() => [])]);
    cacheProfile(p, inv.map(i => i.item));
  } catch (err) { console.error(err); }
}
let loadoutTimer = null;
function saveLoadoutSoon(look) {
  clearTimeout(loadoutTimer);
  if (!cachedProfile() || store?.mode !== 'live') return;
  loadoutTimer = setTimeout(async () => {
    // vlastná fotka na doske žije len v tomto zariadení, do účtu ide posledná farba dosky
    const deck = look.deck === 'photo' ? (cachedProfile()?.loadout?.deck || 'cream') : look.deck;
    const loadout = { deck, grip: look.grip, wheels: look.wheels, trucks: look.trucks };
    try { const p = await store.saveProfile({ loadout }); cacheProfile(p); } catch (err) { console.error(err); }
    // ak je účet prepojený s jazdcom, tá istá doska sa ukáže aj na jeho kartičke
    try { await store.saveRiderLoadout?.(loadout); } catch (err) { console.error(err); }
  }, 900);
}

/* 3D doska na celú šírku: scény + úprava vzhľadu */
/* úvodka: doska len ako ukážka – jazdí a otáča sa sama, bez ovládania; klik otvorí garáž na /doska */
function boardTeaser() {
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const stage = h('div', { class: 'bt-stage' }, canvas);
  const stickers = () => [...lootStickers(cachedInventory()), ...(LSx.get(MY_STICKERS, []).includes('skate') ? [SKATE_STICKER] : []), ...EVENTS.map(eventSticker)];
  let api = null, started = false;
  const start = () => { if (started) return; started = true; mountBoard(canvas, { stickers: stickers(), look: myLook(), scene: 'ride' }).then(a => { api = a; a.setAuto(true); }).catch(err => console.error(err)); };
  if (!('IntersectionObserver' in window)) start();
  else { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '500px 0px' }); requestAnimationFrame(() => io.observe(stage)); }
  const el = h('section', { class: 'hs bt-sec', id: 'doska' }, h('div', { class: 'wrap' },
    h('a', { class: 'bt', href: '#/doska', 'aria-label': 'Navrhni si dosku' },
      stage,
      h('span', { class: 'bt-copy' },
        h('span', { class: 'mono hs-k' }, 'Tvoja 3D doska'),
        h('span', { class: 'bt-h' }, 'Navrhni si dosku'),
        h('span', { class: 'bt-p' }, 'Farby, grip, kolieska, podvozky aj vlastná fotka na spodku. Doska je tvoja skutočná, stojí na nej tvoj duch a ukáže sa aj na kartičke jazdca.'),
        h('span', { class: 'btn primary cta' }, 'Otvoriť garáž', icon('arrow'))))));
  return { el, cleanup: () => { if (api) api(); } };
}
/* Garáž dosky: vzory, farby, vlastná farba a fotka. Rovnaký editor v 3D garáži aj v Mojom profile. */
function garageEditor(initLook, onApply) {
  let look = { ...initLook };
  /* garáž: vzory + palety farieb + vlastná farba; doska aj s vlastnou fotkou ako pixel art */
  const hexOf = n => '#' + n.toString(16).padStart(6, '0');
  const OPTS = {
    deck: { label: 'Doska', presets: DECKS, colors: DECK_COLORS, colorsLabel: 'Farby',
      chip: d => d.pattern === 'ghosts' ? `url(img/ghost.svg) center / 70% no-repeat,${d.base}` : `linear-gradient(90deg,${d.stripe} 0 18%,${d.base} 18% 82%,${d.stripe} 82%)` },
    grip: { label: 'Grip', presets: GRIPS, colors: GRIP_COLORS, colorsLabel: 'Pastelové',
      chip: g => g.ghost ? 'url(img/ghost.svg) center / 55% no-repeat,#1b1b1b' : g.tint ? `rgb(${g.tint})` : '#1b1b1b' },
    wheels: { label: 'Kolieska', presets: WHEELS, colors: WHEEL_COLORS, colorsLabel: 'Neónové',
      chip: w => `radial-gradient(circle,${hexOf(w.core)} 0 26%,transparent 27%),${hexOf(w.color)}` },
    trucks: { label: 'Podvozky', presets: TRUCKS, colors: TRUCK_COLORS, colorsLabel: 'Kovové',
      chip: t => `linear-gradient(135deg,rgba(255,255,255,.55),transparent 45%,rgba(0,0,0,.35)),${hexOf(t.color)}` },
  };
  const swatchBg = (key, hex) => key === 'trucks' ? `linear-gradient(135deg,rgba(255,255,255,.7) 0%,rgba(255,255,255,0) 42%,rgba(0,0,0,.4) 100%),${hex}`
    : key === 'wheels' ? `radial-gradient(circle,#111 0 22%,transparent 23%),${hex}` : hex;
  const tabsBar = h('div', { class: 'gar-tabs', role: 'tablist', 'aria-label': 'Úpravy dosky' });
  const panel = h('div', { class: 'gar-panel' });
  let tab = 'deck', photoSrc = null, photoLevel = LSx.get('gosko:deck-px', 'mid'), photoFocus = .5;
  // jedna doska pre celý web: garáž, profil, duch (3D aj pixel) aj Ghoskate čítajú ten istý loadout
  const applyLook = (next, { quick = false } = {}) => {
    look = next; LSx.set(MY_LOOK, look);
    onApply(look, { quick });
    saveLoadoutSoon(look);
  };
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true });
  async function makePhoto() {
    if (!photoSrc) return;
    panel.classList.add('busy');
    try { setDeckPhoto(await photoToPixelArt(photoSrc, photoLevel, { focus: photoFocus })); applyLook({ ...look, deck: 'photo' }); }
    catch (err) { console.error(err); toast('Fotku sa nepodarilo spracovať. Skús inú.'); }
    panel.classList.remove('busy'); renderPanel();
  }
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (!f) return; photoSrc = f; photoFocus = .5; makePhoto(); });
  function renderPanel() {
    tabsBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
    const O = OPTS[tab], cur = look[tab];
    const pick = v => () => { applyLook({ ...look, [tab]: v }); renderPanel(); };
    const presets = Object.entries(O.presets).map(([k, v]) =>
      h('button', { type: 'button', class: 'gar-sw', 'aria-pressed': String(cur === k), onclick: pick(k) },
        h('span', { class: 'gar-chip', style: `background:${O.chip(v)}`, 'aria-hidden': 'true' }), h('span', {}, v.name)));
    if (tab === 'deck') presets.push(h('button', { type: 'button', class: 'gar-sw photo', 'aria-pressed': String(cur === 'photo'),
      onclick: () => { if (hasDeckPhoto() && cur !== 'photo') { applyLook({ ...look, deck: 'photo' }); renderPanel(); } else fileIn.click(); } },
      h('span', { class: 'gar-chip px', 'aria-hidden': 'true', style: hasDeckPhoto() ? `background:url(${deckPhoto().toDataURL ? deckPhoto().toDataURL() : deckPhoto().src}) center / cover` : null }), h('span', {}, hasDeckPhoto() ? 'Tvoja fotka' : '+ Tvoja fotka')));
    const isCustom = isHex(cur) && !O.colors.some(c => same(c.hex, cur));
    const colorIn = h('input', { type: 'color', value: isHex(cur) ? cur.toLowerCase() : '#ff2bd6', 'aria-label': 'Vlastná farba' });
    colorIn.addEventListener('input', () => { applyLook({ ...look, [tab]: colorIn.value }, { quick: true }); paintSel(colorIn.value); });
    colorIn.addEventListener('change', () => renderPanel());
    const dots = h('div', { class: 'gar-dots', role: 'group', 'aria-label': O.colorsLabel },
      O.colors.map(c => h('button', { type: 'button', class: 'gar-dot', title: c.name, 'aria-label': c.name, 'aria-pressed': String(same(cur, c.hex)), style: `--c:${swatchBg(tab, c.hex)}`, onclick: pick(c.hex) })),
      h('label', { class: 'gar-dot custom', title: 'Vlastná farba', 'aria-pressed': String(isCustom), style: isCustom ? `--c:${swatchBg(tab, cur)}` : null }, colorIn, h('span', { 'aria-hidden': 'true' }, '+')));
    const sel = h('p', { class: 'gar-sel mono' });
    const paintSel = v => { sel.replaceChildren('Vybraté: ', h('b', {}, lookName(tab, v))); };
    paintSel(cur);
    const kids = [sel, h('div', { class: 'gar-row' }, presets), h('p', { class: 'gar-lbl mono' }, O.colorsLabel), dots];
    if (tab === 'deck' && cur === 'photo') {
      kids.splice(2, 0, h('div', { class: 'gar-photo' },
        h('p', { class: 'gar-lbl mono' }, 'Pixely'),
        h('div', { class: 'chips' }, Object.entries(PIXEL_LEVELS).map(([k, v]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(photoLevel === k), disabled: !photoSrc,
          onclick: () => { photoLevel = k; LSx.set('gosko:deck-px', k); makePhoto(); } }, v.name))),
        photoSrc ? h('label', { class: 'gar-range' }, h('span', { class: 'mono' }, 'Posun výrezu'), h('input', { type: 'range', min: 0, max: 100, value: Math.round(photoFocus * 100),
          onchange: e => { photoFocus = e.target.value / 100; makePhoto(); } })) : h('p', { class: 'gar-note' }, 'Hrubosť pixelov a výrez zmeníš, keď fotku nahráš znova.'),
        h('div', { class: 'gar-row' },
          h('button', { type: 'button', class: 'btn small', onclick: () => fileIn.click() }, 'Iná fotka'),
          h('button', { type: 'button', class: 'btn small', onclick: () => { setDeckPhoto(null); photoSrc = null; applyLook({ ...look, deck: 'cream' }); renderPanel(); } }, 'Zmazať fotku'))));
    }
    panel.replaceChildren(...kids, fileIn);
  }
  Object.entries(OPTS).forEach(([k, o]) => tabsBar.append(h('button', { type: 'button', role: 'tab', 'data-t': k, onclick: () => { tab = k; renderPanel(); } }, o.label)));
  renderPanel();
  return { tabsBar, panel, getLook: () => look, refresh: () => { look = myLook(); renderPanel(); } };
}

function boardStudio({ page = false } = {}) {
  let look = myLook();
  let sceneName = LSx.get(MY_SCENE, 'wall'); if (!SCENES[sceneName]) sceneName = 'wall';
  const canvas = h('canvas', { 'aria-label': 'Tvoja 3D skateboard doska. Ťahaj na otočenie, dvojklik ju prevráti.' });
  const stage = h('div', { class: 'b3-stage' }, canvas);
  let api = null;
  const stickers = () => [...lootStickers(cachedInventory()), ...(LSx.get(MY_STICKERS, []).includes('skate') ? [SKATE_STICKER] : []), ...EVENTS.map(eventSticker)];
  let startBoard;
  const boardP = new Promise(res => { startBoard = res; }).then(() => mountBoard(canvas, { stickers: stickers(), onSticker: go, look, scene: sceneName })).then(a => (api = a));
  if (page || !('IntersectionObserver' in window)) startBoard();
  else { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); startBoard(); } }, { rootMargin: '600px 0px' }); requestAnimationFrame(() => io.observe(stage)); }
  const HINT = { wall: 'Ťahaj a obzri si dosku zo všetkých strán. Dvojklik ju otočí.', ride: 'Doska jazdí sama. Občas skočí ollie alebo kickflip.', free: 'Voľný pohľad: ťahaj kamkoľvek, približuj kolieskom (najprv klikni na dosku) alebo dvoma prstami.' };
  const hint = h('p', { class: 'b3-hint mono' }, HINT[sceneName]);
  const sceneBar = h('div', { class: 'b3-scenes', role: 'group', 'aria-label': 'Scéna' }, Object.entries(SCENES).map(([k, n]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === sceneName), onclick: e => {
      sceneName = k; LSx.set(MY_SCENE, k); api?.setScene(k); hint.textContent = HINT[k];
      sceneBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    } }, n)));
  let pendingLook = null, lookTimer = 0;
  const gar = garageEditor(look, (l, { quick }) => {
    look = l; clearTimeout(lookTimer); pendingLook = l;
    lookTimer = setTimeout(() => { api?.setLook(pendingLook); }, quick ? 140 : 0);
  });
  const { tabsBar, panel } = gar;
  const autoBtn = h('button', { type: 'button', class: 'gar-mini', 'aria-pressed': String(LSx.get('gosko:board-auto', true)), onclick: e => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); LSx.set('gosko:board-auto', on); api?.setAuto(on); } }, 'Pohyb');
  boardP.then(a => a.setAuto(LSx.get('gosko:board-auto', true)));
  const saveBtn = h('button', { type: 'button', class: 'gar-mini', onclick: async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const c = await api.snapshot(); const file = await canvasToFile(c, 'moja-gosko-doska.png');
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Moja GOSko doska' });
      else { const l = h('a', { href: c.toDataURL('image/png'), download: 'moja-gosko-doska.png' }); document.body.append(l); l.click(); l.remove(); }
    } catch (err) { if (err?.name !== 'AbortError') console.error(err); }
    b.disabled = false;
  } }, 'Uložiť obrázok');
  const tools = h('div', { class: 'b3-tools' },
    h('button', { type: 'button', class: 'gar-mini sq', onclick: () => api?.zoomBy(.85), 'aria-label': 'Priblížiť' }, '+'),
    h('button', { type: 'button', class: 'gar-mini sq', onclick: () => api?.zoomBy(1.18), 'aria-label': 'Oddialiť' }, '−'),
    h('button', { type: 'button', class: 'gar-mini sq', onclick: () => api?.reset(), 'aria-label': 'Späť do základnej polohy', title: 'Späť' }, '↺'),
    autoBtn, saveBtn);
  const el = h('section', { class: 'b3' + (page ? ' page' : ''), id: 'doska' },
    stage,
    h('div', { class: 'b3-ui' },
      h('div', { class: 'b3-head' }, h('span', { class: 'mono hs-k' }, 'Tvoja 3D doska'), h(page ? 'h1' : 'h2', {}, 'Postav si dosku'),
        h('p', {}, 'Farby, grip, kolieska, podvozky aj vlastná fotka na spodku dosky. Nálepky z eventov sú pod doskou, ťuknutím otvoríš event.'),
        page ? h('a', { class: 'btn small b3-ghostlink', href: '#/profil' }, 'Uprav aj ducha, ktorý na nej stojí →') : null),
      sceneBar,
      h('div', { class: 'b3-garage' }, tabsBar, panel, h('div', { class: 'gar-foot' }, hint, tools)),));
  return { el, cleanup: () => { startBoard(); return boardP.then(a => a()); } };
}

/* najlepší skejteri: zberateľské karty */
function skaterCards(rows, label = `Open ${SITE.season}`) {
  const R = riderMap();
  const tilt = e => { const c = e.currentTarget, r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; c.style.setProperty('--rx', `${(.5 - y) * 14}deg`); c.style.setProperty('--ry', `${(x - .5) * 18}deg`); c.style.setProperty('--mx', `${x * 100}%`); c.style.setProperty('--my', `${y * 100}%`); };
  const untilt = e => { const c = e.currentTarget; c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); };
  const stat = (n, t) => h('span', {}, h('b', {}, String(n)), h('small', {}, t));
  /* fotka jazdca ako pozadie karty; kým ju nemáme, fotka z eventu, kde jazdil (každý jazdec inú) */
  const cardPhoto = (r, rd) => {
    // len vlastná fotka jazdca – cudzia tvár pod menom by bola chyba; bez fotky ostane grafické pozadie
    return (RIDERS[r.slug] || {}).photo || null;
  };
  const card = (r, i) => {
    const rd = R.get(r.slug);
    return h('a', { class: `sk-card r${i + 1}`, href: '#/jazdec/' + r.slug, onpointermove: tilt, onpointerleave: untilt },
      h('span', { class: 'sk-bg' + (cardPhoto(r, rd) ? '' : ' nophoto'), 'aria-hidden': 'true' }, cardPhoto(r, rd) ? h('img', { class: 'sk-photo', src: cardPhoto(r, rd), alt: '', loading: 'lazy' }) : h('span', { class: 'sk-ini' }, initials(r.name)), h('span', { class: 'sk-shade' })),
      h('span', { class: 'sk-top' }, h('span', { class: 'sk-rank' }, `#${i + 1}`), h('span', { class: 'mono sk-cat' }, label)),
      h('span', { class: 'sk-art' }, rd ? boardImg(rd, 'sk-bimg') : null),
      h('span', { class: 'sk-name' }, r.name),
      h('span', { class: 'sk-stats' }, stat(r.points, 'bodov'), stat(r.events, plural(r.events, 'event', 'eventy', 'eventov')), stat(r.wins, plural(r.wins, 'výhra', 'výhry', 'výhier'))),
      h('span', { class: 'sk-holo', 'aria-hidden': 'true' }));
  };
  return h('div', { class: 'sk-cards' + (rows.length < 3 ? ' few' : '') }, rows.slice(0, 3).map(card));
}
function skaterSection() {
  const top = standings('open');
  if (!top.length) return null;
  const leaders = [...CATEGORIES.filter(c => c.id !== 'open'), { id: 'award', name: 'Best Trick' }].map(c => [c, standings(c.id)[0]]).filter(([, r]) => r);
  return h('section', { class: 'hs sk-sec' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('div', {}, h('span', { class: 'mono hs-k' }, 'Rebríček'), h('h2', {}, `Najlepší skejteri ${SITE.season}`)),
      h('span', { class: 'actions cta-row' }, h('a', { class: 'btn primary cta', href: '#/rebricek' }, icon('rank'), 'Celý rebríček'), h('a', { class: 'btn cream cta', href: '#/sien-slavy' }, icon('trophy'), 'Sieň slávy'))),
    skaterCards(top),
    h('div', { class: 'sk-more' },
      top.length > 3 ? h('ol', { class: 'sk-rest', start: '4' }, top.slice(3, 8).map(r => h('li', {}, h('a', { href: '#/jazdec/' + r.slug }, avatarEl(r.name, r.slug), h('span', {}, r.name), h('b', {}, `${r.points} b.`))))) : null,
      leaders.length ? h('ul', { class: 'sk-kings' }, leaders.map(([c, r]) => h('li', {}, h('span', { class: 'mono' }, c.id === 'award' ? 'Best Trick' : `Líder ${c.name}`), h('a', { href: '#/jazdec/' + r.slug }, r.name), h('b', {}, `${r.points} b.`)))) : null)));
}

/* EVENT WIDGET: skate kalendár doma a vo svete (plná verzia žije v hub/) */
function eventWidget() {
  let mode = 'all', data = [];
  const track = h('ul', { class: 'ew-track' });
  const meta = h('span', { class: 'mono ew-meta' }, 'Načítavam…');
  const t = todayStr();
  const row = e => {
    const p = parseDate(e.date), live = e.date <= t && (e.end_date || e.date) >= t, n = dayDiff(t, e.date);
    return h('li', {}, h('a', { href: '#/eventy#kalendar', class: live ? 'live' : '' },
      h('span', { class: 'ew-d' }, h('b', {}, p ? p.d : '?'), h('small', {}, p ? MON[p.m - 1] : '')),
      flag(e.country),
      h('span', { class: 'ew-t' }, h('b', {}, e.name), h('small', {}, [e.city, e.country, e.organizer].filter(Boolean).join(' · '))),
      h('span', { class: 'ew-b' }, live ? h('span', { class: 'evb live' }, 'live') : n <= 30 ? h('span', { class: 'evb soon' }, n === 1 ? 'zajtra' : `o ${n} d.`) : null, e.prize ? h('span', { class: 'evb prize' }, '🏆 ' + e.prize) : null)));
  };
  const render = () => {
    const home = e => e.country === 'Slovensko' || e.country === 'Česko';
    const list = data.filter(e => mode === 'all' || (mode === 'home' ? home(e) : !home(e)));
    const countries = new Set(data.map(e => e.country)).size;
    meta.textContent = `${data.length} ${plural(data.length, 'event', 'eventy', 'eventov')} · ${countries} ${plural(countries, 'krajina', 'krajiny', 'krajín')}`;
    if (!list.length) { track.replaceChildren(h('li', { class: 'empty' }, 'Zatiaľ nič.')); track.classList.remove('roll'); return; }
    const rows = list.map(row);
    track.replaceChildren(...rows, ...(list.length > 5 ? list.map(row) : []));
    track.classList.toggle('roll', list.length > 5 && !REDUCED());
    track.style.setProperty('--dur', `${list.length * 3.2}s`);
  };
  const tabs = h('div', { class: 'chips ew-tabs', role: 'group', 'aria-label': 'Región' }, [['all', 'Všetko'], ['home', 'SK + CZ'], ['world', 'Svet']].map(([v, l]) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === mode), onclick: e => { mode = v; tabs.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.currentTarget))); render(); } }, l)));
  upcomingCommunity().then(l => { data = l; render(); }).catch(() => { meta.textContent = 'Kalendár sa nepodarilo načítať.'; });
  return h('section', { class: 'hs ew-sec' }, h('div', { class: 'wrap ew-grid' },
    h('div', { class: 'ew-copy' },
      h('span', { class: 'mono hs-k' }, 'Skate kalendár'), h('h2', {}, 'Eventy doma aj vo svete'),
      h('p', { class: 'lead' }, 'Contesty, jamy a festivaly od iných crew, skateshopov a svetových sérií. Nech ti nič neujde.'),
      h('div', { class: 'actions cta-row' }, h('a', { class: 'btn primary cta', href: '#/eventy#kalendar' }, 'Celý kalendár', icon('arrow')), h('a', { class: 'btn cta', href: '#/eventy?pridat' }, 'Pridať event'))),
    h('div', { class: 'ew' },
      h('div', { class: 'ew-head' }, h('span', { class: 'ew-live' }, h('i', { 'aria-hidden': 'true' }), 'Live feed'), meta, tabs),
      h('div', { class: 'ew-win' }, track),
      h('a', { class: 'ew-foot mono', href: '#/eventy#kalendar' }, 'Celý kalendár a hľadanie'))));
}

function pageHome(root) {
  const next = nextEvent(), reduced = REDUCED();
  /* ---------- 1. hero: video, logo, novinky, maskot, pás eventov ---------- */
  let media;
  if (SITE.heroVideo && !reduced) media = h('video', { class: 'vh-video', poster: SITE.heroPoster, autoplay: true, muted: true, loop: true, playsinline: true, preload: 'auto', 'aria-hidden': 'true' },
    // mobil dostane menšie video (720p), počítač plnú kvalitu
    h('source', { src: SITE.heroVideo.replace(/\.mp4$/, '-720.webm'), type: 'video/webm', media: '(max-width: 900px)' }), h('source', { src: SITE.heroVideo.replace(/\.mp4$/, '-720.mp4'), type: 'video/mp4', media: '(max-width: 900px)' }),
    h('source', { src: SITE.heroVideo.replace(/\.mp4$/, '.webm'), type: 'video/webm' }), h('source', { src: SITE.heroVideo, type: 'video/mp4' }));
  else media = h('div', { class: 'vh-yt' }, h('img', { class: 'vh-poster', src: SITE.heroPoster, alt: '' }));
  if (media.tagName === 'VIDEO') media.muted = true;
  const rot = newsRotator(next);
  // veľký duch za nápisom GOSko: trochu rozmazaný (je vzadu), jemný paralax na myš aj scroll
  const bigGhost = h('img', { class: 'vh-bigghost', src: 'img/ghost.svg', alt: '', 'aria-hidden': 'true', width: 480, height: 540 });
  const heroIn = h('div', { class: 'wrap vh-in' },
    bigGhost,
    h('h1', { class: 'vh-logo' }, h('img', { class: 'vh-word', src: 'img/gosko-wordmark-plain.svg', alt: 'GOSko', width: 426, height: 178 })),
    h('p', { class: 'vh-tag2' }, 'Game of S.K.A.T.E. po Slovensku'),
    rot.el);
  /* video je pevné pozadie: pri scrollovaní stmavne do čiernej, cez nálepky eventov ešte presvitá,
     od rebríčka ďalej je plné čierne pozadie a video sa zastaví */
  const dim = h('div', { class: 'vbg-dim', 'aria-hidden': 'true' });
  const vbg = h('div', { class: 'vbg', 'aria-hidden': 'true' }, media, dim);
  const isVideo = media.tagName === 'VIDEO';
  if (isVideo) {
    Object.assign(media, { muted: true, defaultMuted: true, playsInline: true, controls: false, disablePictureInPicture: true });
    media.setAttribute('disableremoteplayback', '');
    media.setAttribute('webkit-playsinline', '');
  }
  let wantPlay = true;
  const tryPlay = () => { if (isVideo && wantPlay && media.paused) media.play().catch(() => {}); };
  // niektoré telefóny (úsporný režim) autoplay zablokujú: skúsime znova pri prvom dotyku alebo scrolle
  const kick = () => tryPlay();
  ['touchstart', 'pointerdown', 'keydown'].forEach(t => addEventListener(t, kick, { passive: true }));
  if (isVideo) { media.addEventListener('canplay', tryPlay); media.addEventListener('pause', () => setTimeout(tryPlay, 300)); }
  const onVis = () => { if (!document.hidden) tryPlay(); };
  document.addEventListener('visibilitychange', onVis);
  const shade = h('div', { class: 'vh-shade', 'aria-hidden': 'true' });
  const hero = h('header', { class: 'vh' },
    shade,
    heroSticker(next),
    heroIn);
  if (!reduced) {
    hero.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      bigGhost.style.setProperty('--gx', `${(-x * 28).toFixed(1)}px`);
      bigGhost.style.setProperty('--gy', `${(-y * 18).toFixed(1)}px`);
    });
    hero.addEventListener('pointerleave', () => { bigGhost.style.setProperty('--gx', '0px'); bigGhost.style.setProperty('--gy', '0px'); });
  }
  const studio = boardTeaser();
  setTimeout(onboarding, 1800);
  const solid = h('div', { class: 'after-solid' }, photoBg(stickerWall(), 'pointing', '82% 40%'), skaterSection(), studio.el, eventWidget(),
    photoBand({ kicker: 'Z GOSka', title: 'Takto to vyzerá na ploche', lead: 'Triky, partia a dobrá nálada. Takto vyzerali naše eventy.',
      items: [['flip-bollard', 'Skejter preskakuje betónový kolík a pod ním sa otáča doska', 'wide'], ['flip-black', 'Kickflip pred grafitovou rampou', 'tall'], ['flip-car', 'Trik pred divákmi a eventovým autom Red Bull', 'tall'], ['flip-santacruz', 'Kickflip v skateparku, vzadu eventový stan', 'wide', '50% 78%']],
      cta: [h('a', { class: 'btn primary cta', href: '#/eventy' }, 'Eventy', icon('arrow')), h('a', { class: 'btn cta', href: '#/komunita' }, 'Komunita')] }),
    partnersStrip());
  const after = h('div', { class: 'after-hero' }, solid);
  let raf = 0;
  const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => {
    raf = 0;
    // názov GOSko, novinky a duch nemiznú: len odrolujú spolu so stránkou, video za nimi postupne stmavne
    const vh = innerHeight;
    const top = solid.getBoundingClientRect().top;
    // 0 → 0.55 počas prvej obrazovky (nálepky ešte cez video), potom do úplnej čiernej, keď prichádza rebríček
    let d = Math.min(.55, scrollY / vh * .55);
    if (top < vh * .7) d = Math.max(d, .55 + (1 - Math.max(0, top) / (vh * .7)) * .45);
    dim.style.opacity = String(d);
    if (!reduced) bigGhost.style.setProperty('--sy', `${Math.min(scrollY, vh) * .14}px`);
    const hidden = top <= 0;
    vbg.classList.toggle('off', hidden);
    if (hidden !== !wantPlay) { wantPlay = !hidden; if (isVideo) { if (hidden) media.pause(); else tryPlay(); } }
  }); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  root.append(vbg, hero, after);
  onScroll(); tryPlay();
  return () => { wantPlay = false; removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); ['touchstart', 'pointerdown', 'keydown'].forEach(t => removeEventListener(t, kick)); document.removeEventListener('visibilitychange', onVis); cancelAnimationFrame(raf); rot.stop(); studio.cleanup(); if (isVideo) { media.pause(); media.removeAttribute('src'); media.load(); } };
}

function pageBoard(root) {
  const studio = boardStudio({ page: true });
  root.append(studio.el);
  return studio.cleanup;
}

/* prvá návšteva: duch ťa prevedie webom (len raz) */
function onboarding() {
  if (document.documentElement.matches('[data-intro]:not(.intro-done)')) { setTimeout(onboarding, 600); return; }
  if (LSx.get('gosko:onboarded', false) || document.querySelector('.onb') || !document.querySelector('.vh')) return;
  const steps = [
    ['Čau, som GOSko duch.', 'Toto je domov slovenského Game of S.K.A.T.E. Ukážem ti, čo tu je, zaberie to 10 sekúnd.'],
    ['Odlep nálepku', 'Každý náš event má nálepku. Klikni na ňu a vojdeš do sveta eventu: fotky, výsledky, videá.'],
    ['Pošli trik týždňa', 'Každý týždeň nové zadanie. Pošli klip, my vyberieme troch a ty hlasuješ.'],
    ['Zbieraj XP', 'Prihlás sa, prevezmi svoj profil jazdca a za aktivitu odomykaj odznaky. Hotovo, jazdi!'],
  ];
  let i = 0;
  const t = h('b'), d = h('p'), dots = h('span', { class: 'onb-dots' }, steps.map(() => h('i')));
  const close = () => { LSx.set('gosko:onboarded', true); box.classList.remove('show'); setTimeout(() => box.remove(), 400); };
  const nextBtn = h('button', { class: 'btn small primary', type: 'button', onclick: () => { if (++i >= steps.length) return close(); paint(); } });
  const paint = () => { t.textContent = steps[i][0]; d.textContent = steps[i][1]; nextBtn.textContent = i === steps.length - 1 ? 'Ideme' : 'Ďalej'; [...dots.children].forEach((x, k) => x.classList.toggle('on', k === i)); };
  const box = h('div', { class: 'onb', role: 'dialog', 'aria-label': 'Sprievodca webom' },
    h('img', { class: 'onb-ghost', src: 'img/ghost-cream.svg', alt: '' }),
    h('div', { class: 'onb-body' }, t, d, h('div', { class: 'onb-act' }, dots, h('button', { class: 'linklike', type: 'button', onclick: close }, 'Preskočiť'), nextBtn)));
  paint(); document.body.append(box); requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('show')));
}

/* =====================================================================
   SPOLOČNÁ PÄTIČKA: novinky + features, GOSko TV, kto sme, newsletter
   ===================================================================== */
const FEATURES = [
  { href: '#/parky', k: 'Hra · 3D', t: 'Postav si skatepark', d: 'Rampy, raily, ledge. Poskladaj park snov, najlepšie idú do top 10.', img: 'img/ba-trick-1.webp' },
  { href: '#/mapa', k: 'Komunita', t: 'Mapa spotov', d: 'Poznáš spot, o ktorom nikto nevie? Teraz už bude.', img: 'img/ba-trick-5.webp' },
  { href: '#/partneri/zavolaj', k: 'Pre mestá a firmy', t: 'Zavolaj si GOSko', d: 'Prinesieme Game of S.K.A.T.E. do tvojho mesta, na festival alebo firemnú akciu.', img: 'img/ba-mc.webp' },
];
const featureCard = (f, i) => h('a', { class: 'ft-card ' + (i % 2 ? 'cream' : 'red'), href: f.href },
  h('span', { class: 'ft-img' }, h('img', { src: f.img, alt: '', loading: 'lazy' })),
  h('span', { class: 'ft-body' }, h('span', { class: 'ft-k mono' }, f.k), h('span', { class: 'ft-t' }, f.t), h('span', { class: 'ft-d' }, f.d), h('span', { class: 'ft-cta' }, 'Vyskúšaj', h('span', { 'aria-hidden': 'true' }, ' →'))));
function siteFeed() {
  const rail = h('div', { class: 'feed-rail' }, FEATURES.map((f, i) => featureCard(f, i)));
  loadPosts().then(posts => {
    const p = posts.slice(0, 3).map(x => postCard(x)), f = FEATURES.map((x, i) => featureCard(x, i)), out = [];
    for (let i = 0; i < Math.max(p.length, f.length); i++) { if (p[i]) out.push(p[i]); if (f[i]) out.push(f[i]); }
    rail.replaceChildren(...out);
  });
  const scroll = dir => rail.scrollBy({ left: dir * Math.min(rail.clientWidth * .8, 640), behavior: 'smooth' });
  const last = EVENTS.filter(e => e.status === 'done' && e.photos?.length).at(-1);
  const photos = shuffled(allPhotos());
  // telka bez polaroidov a bez ledge: len samotný televízor, video vyplní celú obrazovku
  const tv = last && tvScene({ videoId: last.video?.youtubeId, title: `${last.name}: video`, photos, stamp: `${last.city} ${last.season}`, onPhoto: lightbox, controls: false, polaroids: false });
  return h('div', { class: 'site-feed' },
    h('section', { class: 'hs feed-sec' }, h('div', { class: 'wrap' },
      h('div', { class: 'sec-head' }, h('div', {}, h('span', { class: 'mono hs-k' }, 'Novinky a hry'), h('h2', {}, 'Fresh zo scény'), h('p', { class: 'lead feed-lead' }, 'Čo je nové v GOSku a veci, pri ktorých sa zasekneš na hodinu.')),
        h('span', { class: 'feed-nav' }, h('button', { type: 'button', class: 'btn small', 'aria-label': 'Posunúť doľava', onclick: () => scroll(-1) }, '←'), h('button', { type: 'button', class: 'btn small', 'aria-label': 'Posunúť doprava', onclick: () => scroll(1) }, '→'), h('a', { class: 'btn small', href: '#/novinky' }, 'Všetky novinky'))),
      rail)),
    h('section', { class: 'hs feed-bottom' }, h('div', { class: 'wrap fb-grid' },
      tv ? h('div', { class: 'fb-tv tv-sec' },
        tv,
        h('div', { class: 'tv-under' }, h('span', { class: 'mono hs-k' }, `${last.name}: video`), h('a', { class: 'btn small', href: '#/event/' + last.id }, 'Fotky a výsledky', icon('arrow')))) : null,
      h('div', { class: 'fb-side' },
        h('div', { class: 'fb-card about-card' }, h('span', { class: 'mono hs-k' }, 'Kto sme'), h('h3', {}, 'Robíme to pre komunitu'),
          h('p', {}, 'Partia skejterov, ktorá ťahá Game of S.K.A.T.E. po mestách. Bez vstupného, s cenami od partnerov.'),
          h('a', { class: 'btn cta', href: '#/o-nas' }, 'Kto za tým stojí', icon('arrow'))),
        h('div', { class: 'fb-card news-card' }, h('h3', { class: 'letterg news-title' }, 'Nezmeškaj ďalšie GOSko'),
          h('p', {}, 'Keď vyhlásime dátum a miesto, pošleme ti jeden e-mail. Žiadny spam.'), newsletterInline('feed'),
          h('div', { class: 'news-ghosts', 'aria-hidden': 'true' }, h('img', { src: 'img/ghost-cream.svg', alt: '' }), h('img', { src: 'img/ghost-cream.svg', alt: '' }), h('img', { src: 'img/ghost-cream.svg', alt: '' }))),
        h('a', { class: 'fb-card cm-mini', href: SITE.whatsapp || '#/komunita', target: SITE.whatsapp ? '_blank' : null, rel: SITE.whatsapp ? 'noopener' : null },
          h('span', { class: 'mono hs-k' }, 'Komunita'), h('h3', {}, SITE.whatsapp ? 'Pridaj sa do WhatsApp skupiny' : 'Trik týždňa, crew a WhatsApp'), h('span', {}, SITE.whatsapp ? 'Sessiony, novinky a info o GOSku skôr ako inde.' : 'Pošli klip, hlasuj, nájdi svoju crew.'), h('span', { class: 'cm-go', 'aria-hidden': 'true' }, '→'))))));
}

/* podstránky: na konci už len krátky odber noviniek, nie celá úvodka dookola */
function newsStrip() {
  return h('section', { class: 'news-strip' }, h('div', { class: 'wrap ns-in' },
    h('div', { class: 'ns-copy' }, h('h2', { class: 'letterg' }, 'Nezmeškaj ďalšie GOSko'), h('p', {}, 'Jeden e-mail, keď vyhlásime dátum a miesto. Nič viac.')),
    newsletterInline('strip')));
}

function quickTile(href, title, text) {
  return h('a', { class: 'qt', href }, h('span', { class: 'qt-t' }, title), h('span', { class: 'qt-d' }, text), h('span', { class: 'qt-a', 'aria-hidden': 'true' }, '→'));
}
function countdownCard(ev) {
  const d = daysUntil(ev.date);
  const big = d === null ? 'Čoskoro' : d > 0 ? String(d) : d === 0 ? 'Dnes' : 'Výsledky';
  const unit = d === null ? 'ďalšie GOSko' : d > 0 ? `${plural(d, 'deň', 'dni', 'dní')} do GOSka` : d === 0 ? 'je GOSko' : 'čoskoro';
  const open = d === null || d >= 0;
  return h('div', { class: 'cd-card' },
    h('span', { class: 'mono' }, 'Ďalší stop'),
    h('div', { class: 'cd-row' }, h('span', { class: 'cd-big' }, big), h('span', { class: 'cd-u letterg' }, unit)),
    h('p', { class: 'cd-where' }, h('b', {}, ev.city), ev.date ? `, ${fmtDate(ev.date)}` : '', ev.place ? `, ${ev.place}` : ', miesto zverejníme na Instagrame'),
    h('div', { class: 'actions' },
      open && ev.registration ? h('button', { class: 'btn primary small', type: 'button', onclick: () => registerDialog(ev) }, 'Chcem jazdiť') : null,
      d === null ? h('button', { class: 'btn small', type: 'button', onclick: () => newsletterDialog('countdown') }, 'Daj mi vedieť') : null,
      h('a', { class: 'btn small', href: '#/event/' + ev.id }, 'Detail')));
}

function pageStandings(root, focus) {
  let season = SITE.season, scope = 'season', cat = 'open';
  const years = seasonYears();
  const body = h('div');
  const chips = (items, current, set) => h('div', { class: 'chips' }, items.map(([v, label]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === current), onclick: () => { set(v); render(); } }, label)));
  const all = riders(), doneEv = EVENTS.filter(e => e.status === 'done' && e.season === SITE.season);
  /* úprimne, čo v rebríčku je: z prvých GOSiek máme len stupne víťazov, celé výsledky zbierame od ďalšieho */
  const nextEv = nextEvent();
  const stats = h('div', { class: 'rk-info' },
    h('p', {}, h('b', {}, 'Ako vznikol rebríček. '), `Z ${doneEv.map(e => e.name.replace(/^GOSko/, 'GOSka')).join(' a ') || 'prvých eventov'} máme zapísané len stupne víťazov, teda prvé tri miesta v kategóriách, ktoré sa jazdili. Body majú zatiaľ jazdci, ktorí boli na stupňoch, a víťaz Best Trick (20 b.).`),
    h('p', {}, `Od ${nextEv ? nextEv.name.replace(/^GOSko/, 'GOSka') : 'ďalšieho GOSka'} zapisujeme celý pavúk, takže body dostane každý, kto jazdí.`));
  function render() {
    const doneEvents = EVENTS.filter(e => e.status === 'done' && e.season === season);
    if (scope !== 'season' && !doneEvents.some(e => e.id === scope)) scope = 'season';
    const ev = EVENTS.find(e => e.id === scope);
    const rows = standings(cat, scope === 'season' ? null : scope, season), em = scope !== 'season';
    body.replaceChildren(); put(body,
      h('div', { class: 'controls' },
        years.length > 1 ? chips(years.map(y => [y, String(y)]), season, v => { season = v; scope = 'season'; }) : null,
        chips([['season', `Sezóna ${season}`], ...doneEvents.map(e => [e.id, e.name])], scope, v => { scope = v; }),
        chips([...CATEGORIES.map(c => [c.id, c.name]), ['award', 'Best Trick']], cat, v => { cat = v; })),
      ev && ev.awards?.length ? h('p', { class: 'note' }, ev.awards.map(a => [`${a.name}: `, h('a', { href: '#/jazdec/' + slug(a.rider) }, a.rider), '. '])) : null,
      rows.length ? [skaterCards(rows, `${catName(cat)} · ${em ? ev.name.replace(/^GOSko\s*/, '') : season}`), standingsList(rows, { eventMode: em, from: 3 })] : h('p', { class: 'empty' }, em ? 'V tejto kategórii sa na tomto evente nejazdilo.' : 'Výsledky doplníme.'),
      scope === 'season' ? finaleEl(cat, season) : null);
  }
  const pts = h('div', { class: 'rk-points' }, h('h3', { class: 'mono' }, 'Bodovanie'),
    h('ul', {}, [[1, '1.'], [2, '2.'], [3, '3. – 4.'], [5, '5. – 8.'], [9, '9. – 16.'], [99, 'účasť']].map(([p, l]) => h('li', {}, h('span', {}, l), h('b', {}, `${pointsFor(p)}`)))),
    h('p', { class: 'note' }, SEASON_RULES.countBest ? `Do rebríčka sa rátajú ${SEASON_RULES.countBest} najlepšie výsledky jazdca. ` : '', `Best Trick je ocenenie za ${awardPoints('Best Trick')} b. Pri rovnakých bodoch je prvý Open, potom U16, Babská kategória, a skorší event má prednosť.`));

  /* jazdci: zoznam s rozklikávacím mini profilom */
  const q = h('input', { type: 'search', class: 'rk-search', placeholder: 'Hľadať jazdca…', 'aria-label': 'Hľadať jazdca' });
  let rcat = 'all';
  const rList = h('ul', { class: 'rd-list' });
  function renderRiders() {
    const t = q.value.trim().toLowerCase();
    const list = all.filter(r => (rcat === 'all' || r.cats.includes(rcat)) && (!t || r.name.toLowerCase().includes(t)));
    rList.replaceChildren(...(list.length ? list.map((r, i) => riderRow(r)) : [h('li', { class: 'empty' }, 'Nikoho sme nenašli.')]));
  }
  q.addEventListener('input', renderRiders);
  const rChips = h('div', { class: 'chips' }, [['all', 'Všetci'], ...CATEGORIES.map(c => [c.id, c.name])].map(([v, l]) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === rcat), onclick: e => { rcat = v; rChips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === e.currentTarget))); renderRiders(); } }, l)));

  const ridersSec = h('section', { class: 'rk-sec', id: 'jazdci' },
    h('div', { class: 'sec-head' }, h('h2', {}, 'Jazdci'), h('span', { class: 'mono lead' }, 'Klikni na jazdca a uvidíš jeho mini profil')),
    h('div', { class: 'controls' }, q, rChips), rList,
    h('p', { class: 'note' }, 'Si to ty a chceš fotku, Instagram alebo vlastnú dosku v profile? Napíš nám na Instagram ', igLink(SITE.instagram), '.'));
  root.append(photoHead(pageHead('Rebríček a jazdci', 'Body, výsledky a profily všetkých jazdcov GOSka.'), 'board-red', '72% 62%'),
    h('div', { class: 'wrap page-body' },
      stats,
      h('section', { class: 'rk-sec' }, h('div', { class: 'sec-head' }, h('h2', {}, `Rebríček ${SITE.season}`)), h('div', { class: 'rk-grid' }, body, pts)),
      ridersSec,
      h('section', { class: 'rk-sec', id: 'sien-slavy' }, h('div', { class: 'sec-head' }, h('h2', {}, 'Sieň slávy'), h('span', { class: 'mono lead' }, 'Víťazi eventov a ocenenia')), hallEl())));
  render(); renderRiders();
  if (focus) requestAnimationFrame(() => document.getElementById(focus)?.scrollIntoView());
}
function riderRow(r) {
  const badges = riderBadges(r), st = riderStickers(r);
  const rankIn = r.cats.map(c => { const s2 = standings(c); const i = s2.findIndex(x => x.slug === r.slug); return i >= 0 ? `${i + 1}. ${catName(c)}` : null; }).filter(Boolean);
  const info = RIDERS[r.slug] || {};
  const body = h('div', { class: 'rd-body' });
  const det = h('details', { class: 'rd' },
    h('summary', {},
      avatarEl(r.name, r.slug),
      h('span', { class: 'rd-main' }, h('b', {}, r.name), h('span', { class: 'mono' }, [r.cats.map(catName).join(', ') || r.awards.map(a => a.name).join(', ') || 'Ocenenie', info.city].filter(Boolean).join(' · '))),
      h('span', { class: 'rd-badges', 'aria-hidden': 'true' }, badges.slice(0, 4).map(b => h('span', { class: 'mini-badge', title: b.name, html: badgeSvg(b, 14) }))),
      h('span', { class: 'rd-pts' }, String(r.points), h('small', {}, ' b.')),
      h('span', { class: 'rd-chev', 'aria-hidden': 'true' }, '+')),
    body);
  det.addEventListener('toggle', () => {
    if (!det.open || body.childElementCount) return;
    body.append(
      h('div', { class: 'rd-board' }, boardImg(r, 'rd-bimg')),
      h('div', { class: 'rd-info' },
        h('ul', { class: 'rd-facts' },
          h('li', {}, h('b', {}, String(r.points)), h('span', {}, `bodov ${SITE.season}`)),
          h('li', {}, h('b', {}, String(r.events.length)), h('span', {}, plural(r.events.length, 'event', 'eventy', 'eventov'))),
          rankIn.length ? h('li', {}, h('b', {}, rankIn[0].split('.')[0] + '.'), h('span', {}, 'v rebríčku ' + rankIn[0].split('. ')[1])) : null),
        h('h4', { class: 'mono' }, 'Výsledky'),
        h('ul', { class: 'rd-res' }, r.results.map(x => h('li', {}, h('span', { class: 'rd-place' }, `${x.place}.`), h('a', { href: '#/event/' + x.ev.id }, x.ev.name), h('span', { class: 'mono' }, `${catName(x.cat)} · ${pointsFor(x.place)} b.`))),
          r.awards.map(a => h('li', {}, h('span', { class: 'rd-place' }, '★'), h('a', { href: '#/event/' + a.ev.id }, a.ev.name), h('span', { class: 'mono' }, `${a.name} · ${awardPoints(a.name)} b.`)))),
        badges.length ? h('div', { class: 'rd-blist' }, badges.map(b => h('span', { class: 'rd-b' }, h('span', { class: 'mini-badge', html: badgeSvg(b, 14) }), b.name))) : null,
        h('div', { class: 'actions' },
          h('a', { class: 'btn small primary', href: '#/jazdec/' + r.slug }, 'Celý profil a 3D doska'),
          info.instagram ? h('a', { class: 'btn small', href: `https://www.instagram.com/${info.instagram}/`, target: '_blank', rel: 'noopener' }, '@' + info.instagram) : null)));
  });
  return h('li', {}, det);
}

/* krajina -> kód vlajky (obrázky z flagcdn.com) */
const COUNTRY_CODES = {
  Slovensko: 'sk', Česko: 'cz', Rakúsko: 'at', Maďarsko: 'hu', Poľsko: 'pl', Nemecko: 'de', Francúzsko: 'fr', Španielsko: 'es',
  Taliansko: 'it', Portugalsko: 'pt', Fínsko: 'fi', Švédsko: 'se', Dánsko: 'dk', Holandsko: 'nl', Belgicko: 'be', Švajčiarsko: 'ch',
  Rumunsko: 'ro', Chorvátsko: 'hr', Slovinsko: 'si', 'Veľká Británia': 'gb', USA: 'us', Kanada: 'ca', Brazília: 'br',
  Austrália: 'au', Japonsko: 'jp', Čína: 'cn', Paraguaj: 'py',
};
const EVENT_COUNTRIES = ['Slovensko', 'Česko', 'Rakúsko', 'Maďarsko', 'Poľsko', 'Nemecko', 'Francúzsko', 'Španielsko', 'Taliansko', 'Veľká Británia', 'USA', 'Iná'];
const flag = country => {
  const c = COUNTRY_CODES[country];
  return c ? h('img', { class: 'flag', src: `https://flagcdn.com/${c}.svg`, alt: country, title: country, width: 24, height: 18, loading: 'lazy' })
    : h('span', { class: 'flag globe', title: country || 'Svet', 'aria-label': country || 'Svet' }, '🌍');
};
const MONTHS_NOM = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
const dayDiff = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...a.split('-').map((x, i) => i === 1 ? x - 1 : +x))) / 864e5);

/* EVENTY: jeden zoznam pod sebou ako na HLTV, zoradený podľa dátumu, rozdelený po mesiacoch.
   Tri úrovne: GOSko (naše, veľké, zlaté), Slovensko a Česko (biele, stredné), svet (sivé, malé).
   Riadok: vľavo veľký dátum, v strede názov a krátky popis, vpravo miesto a tlačidlá. */
async function pageEvents(root) {
  let when = 'upcoming', tier = 'all', q = '';
  const today = todayStr();
  const lastDay = e => e.end_date && e.end_date > e.date ? e.end_date : e.date;
  const home = c => c === 'Slovensko' || c === 'Česko';
  const ours = EVENTS.map(e => ({ id: e.id, tier: 'gosko', title: e.name, date: e.date || null, end_date: e.endDate || null, city: e.city, place: e.place, country: 'Slovensko',
    desc: e.status === 'next' ? 'Game of S.K.A.T.E. · Open, U16, Babská kategória + Best Trick' : 'Game of S.K.A.T.E. · výsledky, fotky a videá', ev: e }));
  let community = [];
  const load = async () => { try { community = (await store.listEvents()).map(e => ({ ...e, title: e.name, tier: home(e.country) ? 'local' : 'world' })); } catch (err) { console.error(err); } };
  const listBox = h('div', { class: 'evl', 'aria-live': 'polite' }, h('p', { class: 'empty' }, 'Načítavam eventy…'));
  const count = h('span', { class: 'mono lead' });

  const isUp = e => (e.date ? lastDay(e) >= today : true);
  const live = e => e.date && e.date <= today && lastDay(e) >= today;
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const match = e => !q || norm([e.title, e.city, e.place, e.country, e.organizer, e.kind].join(' ')).includes(norm(q));

  function dateCell(e) {
    const p = parseDate(e.date);
    if (!p) {
      // „14. alebo 21. 11.“ → veľké „14/21“, malé „nov?“
      const m = String(e.ev?.when || '').match(/(\d+)\.\s*alebo\s*(\d+)\.\s*(\d+)\./);
      return m ? h('div', { class: 'evl-date soon tentative' }, h('b', {}, `${m[1]}/${m[2]}`), h('span', {}, MON[+m[3] - 1] + '?'))
        : h('div', { class: 'evl-date soon' }, h('b', {}, '?'), h('span', {}, 'čoskoro'));
    }
    const z = parseDate(lastDay(e)), multi = z && (z.d !== p.d || z.m !== p.m);
    return h('div', { class: 'evl-date' }, h('b', {}, multi ? `${p.d}–${z.d}` : String(p.d)), h('span', {}, MON[p.m - 1] + (multi && z.m !== p.m ? '–' + MON[z.m - 1] : '')));
  }
  const igIcon = () => h('span', { class: 'evl-igi', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".7"/></svg>' });
  function actions(e) {
    if (e.tier === 'gosko') {
      const ev = e.ev, isNext = ev.status === 'next';
      return [isNext && ev.registration ? h('button', { class: 'btn primary small', type: 'button', onclick: x => { x.preventDefault(); registerDialog(ev); } }, 'Chcem jazdiť') : null,
        h('a', { class: 'btn small', href: '#/event/' + ev.id }, isNext ? 'Info' : 'Výsledky')];
    }
    const ig = e.instagram ? (/^https?:/.test(e.instagram) ? e.instagram : `https://www.instagram.com/${String(e.instagram).replace(/^@/, '')}/`) : (/instagram\.com/.test(e.link || '') ? e.link : null);
    const web = e.link && e.link !== ig ? e.link : null;
    return [EVENT_MEDIA[e.id] ? h('a', { class: 'btn small', href: '#/kalendar/' + e.id }, 'Fotky') : null,
      web ? h('a', { class: 'btn small', href: web, target: '_blank', rel: 'noopener' }, 'Web') : null,
      ig ? h('a', { class: 'evl-ig', href: ig, target: '_blank', rel: 'noopener', 'aria-label': `${e.title} na Instagrame` }, igIcon()) : null];
  }
  function row(e) {
    const desc = e.tier === 'gosko' ? e.desc : [e.kind, e.organizer ? `organizuje ${e.organizer}` : null].filter(Boolean).join(' · ');
    const n = e.date ? dayDiff(today, e.date) : null;
    return h('li', { class: `evl-row t-${e.tier}` + (live(e) ? ' live' : '') },
      dateCell(e),
      h('div', { class: 'evl-main' },
        h('span', { class: 'evl-tag mono' }, e.tier === 'gosko' ? 'GOSko' : e.tier === 'local' ? (e.country === 'Česko' ? 'Česko' : 'Slovensko') : 'Svet',
          live(e) ? h('i', { class: 'evb live' }, 'práve teraz') : n !== null && n > 0 && n <= 30 ? h('i', { class: 'evb soon' }, n === 1 ? 'zajtra' : `o ${n} ${plural(n, 'deň', 'dni', 'dní')}`) : null),
        e.tier === 'gosko' ? h('a', { class: 'evl-name', href: '#/event/' + e.id }, e.title) : EVENT_MEDIA[e.id] ? h('a', { class: 'evl-name', href: '#/kalendar/' + e.id }, e.title) : h('b', { class: 'evl-name' }, e.title),
        desc ? h('span', { class: 'evl-desc' }, desc) : null,
        e.prize ? h('span', { class: 'evl-prize' }, '🏆 ', e.prize) : null),
      h('div', { class: 'evl-side' },
        h('span', { class: 'evl-loc' }, flag(e.country), h('span', {}, h('b', {}, e.city || e.country || 'Miesto čoskoro'), e.place ? h('small', {}, e.place) : e.tier === 'world' && e.country ? h('small', {}, e.country) : null)),
        h('span', { class: 'evl-act' }, actions(e))));
  }
  function render() {
    const all = [...ours, ...community].filter(e => (when === 'upcoming' ? isUp(e) : !isUp(e)) && (tier === 'all' || e.tier === tier) && match(e));
    const rank = { gosko: 0, local: 1, world: 2 };
    all.sort(when === 'upcoming'
      ? (a, b) => (a.date || '0').localeCompare(b.date || '0') || rank[a.tier] - rank[b.tier]
      : (a, b) => (b.date || '').localeCompare(a.date || '') || rank[a.tier] - rank[b.tier]);
    count.textContent = `${all.length} ${plural(all.length, 'event', 'eventy', 'eventov')}`;
    if (!all.length) { listBox.replaceChildren(h('div', { class: 'empty-cta' }, h('div', {}, h('b', {}, q ? 'Nič sme nenašli.' : 'Zatiaľ tu nič nie je.'), h('p', {}, 'Poznáš skate event? Pridaj ho a po schválení sa ukáže.'), h('button', { class: 'btn primary small', type: 'button', onclick: addEventDialog }, 'Pridať event')))); return; }
    // po mesiacoch, ako na HLTV
    const groups = [];
    for (const e of all) {
      const p = parseDate(e.date), w = !p && String(e.ev?.when || '').match(/(\d+)\.\s*(20\d\d)/);
      const key = p ? `${p.y}-${p.m}` : w ? `${w[2]}-${+w[1]}` : 'soon';
      let g = groups.find(x => x.key === key); if (!g) groups.push(g = { key, label: p ? `${MONTHS_NOM[p.m - 1]} ${p.y}` : w ? `${MONTHS_NOM[+w[1] - 1]} ${w[2]}` : 'Dátum čoskoro', items: [] });
      g.items.push(e);
    }
    listBox.replaceChildren(...groups.map(g => h('section', { class: 'evl-month' }, h('h3', { class: 'evl-mh' }, g.label), h('ul', { class: 'evl-list' }, g.items.map(row)))));
  }
  function chipGroup(label, items, get, set) {
    const g = h('div', { class: 'chips', role: 'group', 'aria-label': label }, items.map(([v, t]) =>
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === get()), onclick: ev => { set(v); g.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === ev.currentTarget))); render(); } }, t)));
    return g;
  }
  const search = h('input', { type: 'search', class: 'ev-search', placeholder: 'Hľadaj event, mesto alebo organizátora', 'aria-label': 'Hľadať event' });
  search.addEventListener('input', () => { q = search.value.trim(); render(); });
  root.append(photoHead(pageHead('Eventy', 'GOSko, skate eventy na Slovensku a v Česku a veľké eventy vo svete v jednom zozname.'), 'crowd-low', '50% 60%'),
    h('div', { class: 'wrap page-body ev-page2', id: 'kalendar' },
      h('div', { class: 'evl-tools' },
        search,
        chipGroup('Čas', [['upcoming', 'Nadchádzajúce'], ['past', 'Odjazdené']], () => when, v => { when = v; }),
        chipGroup('Druh', [['all', 'Všetko'], ['gosko', 'GOSko'], ['local', 'SK a CZ'], ['world', 'Svet']], () => tier, v => { tier = v; }),
        h('button', { class: 'btn small', type: 'button', onclick: addEventDialog }, '+ Pridať event')),
      h('div', { class: 'evl-legend' }, count, h('span', { class: 'lg-t t-gosko' }, 'GOSko'), h('span', { class: 'lg-t t-local' }, 'Slovensko a Česko'), h('span', { class: 'lg-t t-world' }, 'Svet')),
      listBox));
  render();   // GOSko eventy hneď, ostatné po načítaní z databázy
  load().then(render);
  if (new URLSearchParams(location.search).has('pridat')) addEventDialog();

  function addEventDialog() {
    formDialog({
      title: 'Pridať event', submit: 'Poslať event',
      intro: 'Event sa zobrazí v kalendári po schválení.',
      fields: [
        { name: 'name', label: 'Názov eventu', required: true, max: 80 },
        { name: 'date', label: 'Dátum (prvý deň)', type: 'date', required: true },
        { name: 'end_date', label: 'Posledný deň', type: 'date', hint: 'Len pri viacdňovom evente.' },
        { name: 'city', label: 'Mesto', required: true, max: 40 },
        { name: 'place', label: 'Miesto', max: 60, placeholder: 'nepovinné, napr. názov skateparku' },
        { name: 'country', label: 'Krajina', type: 'select', options: EVENT_COUNTRIES },
        { name: 'kind', label: 'Typ', type: 'select', options: ['Game of Skate', 'Contest', 'Jam alebo session', 'Iné'] },
        { name: 'prize', label: 'Prize pool', max: 60, placeholder: 'nepovinné, napr. 500 € + ceny' },
        { name: 'link', label: 'Odkaz na event', type: 'url', max: 300, placeholder: 'https://…' },
        { name: 'organizer', label: 'Organizátor', max: 60 },
        { name: 'contact', label: 'Tvoj kontakt', type: 'email', max: 120, hint: 'Nezverejníme ho, len keby sme sa potrebovali niečo spýtať.' },
      ],
      onSubmit: async v => {
        if (v.end_date && v.end_date < v.date) throw new UserError('Posledný deň nemôže byť pred prvým.');
        await store.submitEvent({ ...v, end_date: v.end_date && v.end_date !== v.date ? v.end_date : null, prize: v.prize || null, place: v.place || null, link: v.link || null, organizer: v.organizer || null, contact: v.contact || null });
        await load(); render();
        return 'Ďakujeme! Event sa v kalendári zobrazí po schválení.';
      },
    });
  }
}

function registerDialog(ev) {
  formDialog({
    title: 'Chcem jazdiť', submit: 'Zaregistrovať sa',
    intro: `${ev.name}${ev.date ? ', ' + fmtDate(ev.date) : ''}. Keď zverejníme dátum a miesto, ozveme sa ti.`,
    fields: [
      { name: 'name', label: 'Meno alebo prezývka', required: true, max: 40, autocomplete: 'name', value: LSx.get('gosko:reg-me', {}).name },
      { name: 'instagram', label: 'Instagram', max: 40, placeholder: '@tvojmeno', value: LSx.get('gosko:reg-me', {}).instagram },
      { name: 'city', label: 'Mesto', max: 40, value: LSx.get('gosko:reg-me', {}).city },
      { name: 'category', label: 'Kategória', type: 'select', options: CATEGORIES.map(c => ({ value: c.id, label: c.name + (c.note ? ` (${c.note})` : '') })) },
      { name: 'contact', label: 'E-mail alebo telefón', required: true, max: 120, value: LSx.get('gosko:reg-me', {}).contact },
      { name: 'parent_consent', label: 'Mám súhlas rodiča s účasťou a so zverejnením výsledkov.', type: 'checkbox', showIf: v => v.category === 'u16', requiredIfShown: true },
      { name: 'newsletter', label: 'Pošlite mi e-mail aj o ďalších GOSko eventoch.', type: 'checkbox' },
      { name: 'gdpr', label: ['Súhlasím, že GOSko použije moje údaje na organizáciu eventu. ', h('a', { href: '#/sukromie', target: '_blank', rel: 'noopener' }, 'Ako narábame s údajmi'), '.'], type: 'checkbox', required: true },
    ],
    onSubmit: async v => {
      const token = newToken();
      await store.send('registrations', { event_id: ev.id, token, name: v.name, instagram: v.instagram, city: v.city, category: v.category, contact: v.contact, parent_consent: !!v.parent_consent });
      if (v.newsletter && isEmail(v.contact)) store.subscribe(v.contact, 'registracia').catch(() => {});
      LSx.set('gosko:reg-me', { name: v.name, instagram: v.instagram, city: v.city, contact: v.contact });
      const pass = { token, eventId: ev.id, event: ev.name, date: ev.date, name: v.name, category: v.category, created: Date.now() };
      LSX.set('gosko:passes', [pass, ...LSX.get('gosko:passes', []).filter(p => p.token !== token)]);
      updateMenu();
      return h('div', { class: 'pass-done' },
        h('p', {}, 'Si zaregistrovaný. Toto je tvoj vstupný QR kód. Na evente ho ukážeš crew pri príchode.'),
        passCard(pass),
        h('div', { class: 'actions' },
          ev.date ? h('button', { class: 'btn primary', type: 'button', onclick: () => downloadIcs({ title: ev.name, date: ev.date, place: ev.place }) }, 'Pridať do kalendára') : null,
          h('a', { class: 'btn', href: '#/pass' }, 'Môj pass')),
        h('p', { class: 'note dark' }, ev.date ? 'Pass nájdeš v menu pod „Môj pass“. Pre istotu si sprav screenshot.' : 'Keď zverejníme dátum, pošleme ti ho a pridáš si ho do kalendára. Pass nájdeš v menu pod „Môj pass“.'));
    },
  });
}

function clipEl(c) {
  const id = ytId(c.clip_url), url = safeUrl(c.clip_url);
  if (!url) return null;
  return h('li', { class: 'clip' },
    id ? videoEmbed(id, `Klip od ${c.author}`) : h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener' }, 'Pozrieť klip'),
    h('span', { class: 'clip-by' }, `Klip od ${c.author}`, c.pending ? h('span', { class: 'tag pend' }, 'Čaká na schválenie') : null));
}
function photoDialog(ev, refresh) {
  let photo = null;
  formDialog({
    title: 'Pošli fotku alebo klip', submit: 'Poslať',
    intro: `${ev.name}. Zobrazí sa po schválení.`,
    fields: [
      { name: 'photo', label: 'Fotka', type: 'custom', hint: 'Nepovinné, ak pošleš odkaz na klip. Fotku zmenšíme pred odoslaním.', render: () => {
        const input = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Fotka z eventu' });
        const prev = h('img', { class: 'photo-prev', alt: '', hidden: true });
        input.addEventListener('change', async () => {
          const f = input.files[0]; if (!f) { photo = null; prev.hidden = true; return; }
          try { photo = await resizePhoto(f, store.mode === 'demo' ? 900 : 1600, store.mode === 'demo' ? .7 : .82); prev.src = URL.createObjectURL(photo); prev.hidden = false; }
          catch { photo = null; }
        });
        return { el: h('div', {}, input, prev), value: () => photo };
      } },
      { name: 'clip', label: 'Odkaz na klip', type: 'url', max: 300, placeholder: 'https://… (YouTube, Instagram, TikTok)' },
      { name: 'author', label: 'Autor (meno alebo Instagram)', required: true, max: 40, placeholder: '@tvojmeno', hint: 'Zobrazí sa pri fotke.' },
      { name: 'caption', label: 'Popis', max: 120, placeholder: 'nepovinné' },
      { name: 'consent', label: 'Fotku alebo klip som natočil/a ja, alebo mám súhlas autora, a súhlasím s jeho zverejnením na webe GOSko.', type: 'checkbox', required: true },
    ],
    onSubmit: async v => {
      if (v.clip && !safeUrl(v.clip)) throw new UserError('Odkaz na klip musí začínať na https://');
      if (!v.photo && !v.clip) throw new UserError('Pridaj fotku alebo odkaz na klip.');
      await store.submitEventPhoto({ event_id: ev.id, author: v.author, caption: v.caption || null, clip_url: v.clip || null }, v.photo);
      refresh && refresh();
      return store.mode === 'demo' ? 'Uložené. V ukážkovom režime to vidíš len ty a po schválení v admine.' : 'Ďakujeme! Fotka sa zobrazí po schválení.';
    },
  });
}
function privacyDialog(prefill = {}) {
  formDialog({
    title: 'Súkromie a odstránenie', submit: 'Odoslať žiadosť',
    intro: 'Napíš, čo máme upraviť. Rodič alebo zákonný zástupca môže žiadať za jazdca do 16 rokov.',
    fields: [
      { name: 'what', label: 'Čo chceš', type: 'select', options: ['Skryť priezvisko (ukáže sa len napr. „Marek K.“)', 'Odstrániť fotku', 'Odstrániť môj profil'] },
      { name: 'target', label: 'Koho alebo ktorej fotky sa to týka', required: true, max: 200, value: prefill.target || '', placeholder: 'Meno jazdca alebo odkaz na fotku' },
      { name: 'contact', label: 'E-mail alebo telefón', required: true, max: 120, hint: 'Nezverejňuje sa, ozveme sa ti na ňom.' },
      { name: 'guardian', label: 'Som rodič alebo zákonný zástupca jazdca do 16 rokov.', type: 'checkbox' },
    ],
    onSubmit: async v => { await store.send('privacy_requests', { what: v.what, target: v.target, contact: v.contact, guardian: !!v.guardian }); return 'Žiadosť sme prijali. Ozveme sa ti na uvedený kontakt.'; },
  });
}

/* Svet eventu: sem sa vojde po odlepení nálepky. Fotky, výsledky, videá, sociálne siete, články a ďalšie eventy. */
/* stránka eventu iného organizátora z kalendára: fotky, video, krátky text (EVENT_MEDIA v data.js) */
async function pageCalEvent(root, id) {
  const media = EVENT_MEDIA[id];
  let e = null;
  try { e = (await store.listEvents()).find(x => x.id === id) || null; } catch (err) { console.error(err); }
  if (!e && !media) return pageNotFound(root);
  const m = media || {}, title = m.title || e?.name || 'Event';
  const p = parseDate(e?.date || m.date);
  const when = p ? `${p.d}. ${p.m}. ${p.y}` : '';
  const where = [e?.place || m.place, e?.city || m.city].filter(Boolean).join(', ');
  const park = SKATEPARKS.find(x => x.photosFrom === id);
  const photos = m.photos || [];
  root.append(pageHead(title, [when, where].filter(Boolean).join(' · ')),
    h('div', { class: 'wrap page-body cev' },
      h('div', { class: 'cev-top' },
        h('div', { class: 'cev-info' },
          h('span', { class: 'mono hs-k' }, [e?.country || m.country, e?.kind].filter(Boolean).join(' · ') || 'Event'),
          h('ul', { class: 'cev-facts' },
            when ? h('li', {}, h('span', { class: 'mono' }, 'Kedy'), h('b', {}, when)) : null,
            where ? h('li', {}, h('span', { class: 'mono' }, 'Kde'), h('b', {}, where)) : null,
            e?.organizer ? h('li', {}, h('span', { class: 'mono' }, 'Organizuje'), h('b', {}, e.organizer)) : null),
          h('div', { class: 'actions' },
            e?.link ? h('a', { class: 'btn small', href: e.link, target: '_blank', rel: 'noopener' }, 'Web eventu') : null,
            park ? h('a', { class: 'btn small', href: '#/mapa' }, 'Skatepark na mape') : null,
            h('a', { class: 'btn small', href: '#/eventy' }, 'Všetky eventy')))),
      photos.length ? h('section', { class: 'cev-photos' }, h('h2', { class: 'wide sub' }, 'Fotky'),
        h('div', { class: 'cev-grid' }, photos.map((ph, i) => h('button', { type: 'button', class: 'cev-ph', onclick: () => lightbox(photos, i), 'aria-label': 'Zväčšiť: ' + ph.alt }, h('img', { src: ph.src, alt: ph.alt, loading: 'lazy' }))))) : null));
}

async function pageEvent(root, id) {
  const ev = EVENTS.find(e => e.id === id);
  if (!ev) return pageNotFound(root);
  let landing = false;
  try { landing = sessionStorage.getItem('gosko:peel') === id; sessionStorage.removeItem('gosko:peel'); } catch {}
  const isNext = ev.status === 'next';
  /* nálepka v hlavičke: ostrá (1024 px), s lesklým odleskom a jemným náklonom pod prstom */
  const sticker = h('img', { class: 'evw-sticker', alt: `Nálepka ${ev.name}`, width: 420, height: 420 });
  const shine = h('span', { class: 'evw-shine', 'aria-hidden': 'true' });
  const tiltSt = e => { const c = e.currentTarget, r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    c.style.setProperty('--ry', `${(px - .5) * 22}deg`); c.style.setProperty('--rx', `${(.5 - py) * 18}deg`); c.style.setProperty('--sx', `${px * 100}%`); };
  const untiltSt = e => { const c = e.currentTarget; c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); c.style.removeProperty('--sx'); };
  const stk = h('div', { class: 'evw-stk', onpointermove: tiltSt, onpointerleave: untiltSt, onpointerup: untiltSt }, sticker, shine);
  loadLogo().then(logo => {
    const url = stickerCanvas(eventSticker(ev), logo, 1024).toDataURL();
    sticker.src = url; shine.style.setProperty('-webkit-mask-image', `url(${url})`); shine.style.setProperty('mask-image', `url(${url})`);
  }).catch(() => {});
  const cover = ev.photos?.[0]?.src || 'img/ba-podium.webp';
  const sections = [];
  const sec = (key, title, ...kids) => { const el = h('section', { class: 'evw-sec', 'data-k': key }, h('h2', { class: 'evw-h' }, title), kids); sections.push([key, title, el]); return el; };
  const ig = `https://www.instagram.com/${SITE.instagram}/`;

  const body = h('div', { class: 'wrap page-body evw-body' });
  const cats = CATEGORIES.filter(c => ev.results?.[c.id]?.length);
  if (ev.status === 'done') {
    const res = [];
    if (!cats.length) res.push(h('div', { class: 'empty-cta' }, h('img', { src: 'img/ghost-cream.svg', alt: '' }), h('div', {}, h('b', {}, `Výsledky z ${ev.city === 'Žilina' ? 'Žiliny' : ev.city} práve dopĺňame.`), h('p', {}, 'Bol si tam? Pošli fotku alebo klip a pomôž nám poskladať deň.'),
      h('button', { class: 'btn primary small', type: 'button', onclick: () => requireLogin(() => photoDialog(ev, () => go('#/event/' + ev.id))).then(ok => ok && photoDialog(ev, () => go('#/event/' + ev.id))) }, 'Poslať fotku alebo klip'))));
    else res.push(h('div', { class: 'podiums' }, cats.map(c => h('div', { class: 'podium' }, h('h3', {}, c.name, c.note && h('span', { class: 'cond' }, ` ${c.note}`)), placeList(ev.results[c.id])))));
    if (ev.awards?.length) res.push(h('p', { class: 'note' }, ev.awards.map(a => [`${a.name}: `, h('a', { href: '#/jazdec/' + slug(a.rider) }, a.rider), '. '])));
    const withBracket = CATEGORIES.filter(c => ev.brackets?.[c.id]);
    if (withBracket.length) res.push(...withBracket.map((c, i) => h('details', { class: 'br-details', open: i === 0 }, h('summary', {}, 'Pavúk: ' + c.name + (c.note ? ` (${c.note})` : '')),
      h('div', { class: 'br-scroll' }, bracketEl(ev.brackets[c.id], { name: displayName })))));
    put(body, sec('vysledky', 'Výsledky', res));
  }
  if (ev.photos?.length) put(body, sec('fotky', 'Fotky', photoGrid(ev.photos), SITE.photoCredit ? h('p', { class: 'note' }, `Foto: ${SITE.photoCredit}`) : null));
  const videos = [ev.video?.youtubeId && videoEmbed(ev.video.youtubeId, `${ev.name}: video`), ...(ev.videos || []).map(v => videoEmbed(v, `${ev.name}: video`))].filter(Boolean);
  const community = h('div', { class: 'community' });
  if (videos.length || ev.status === 'done') put(body, sec('videa', 'Videá a klipy', videos.length ? h('div', { class: 'evw-videos' }, videos) : null, community));
  const socials = (ev.socials || []).filter(x => safeUrl(x.url));
  put(body, sec('socials', 'Zo sociálnych sietí',
    h('div', { class: 'evw-social' },
      socials.map(x => h('a', { class: 'evw-sc', href: x.url, target: '_blank', rel: 'noopener' }, h('span', { class: 'mono' }, x.from || 'Instagram'), h('b', {}, x.label || 'Pozrieť príspevok'), h('span', { 'aria-hidden': 'true' }, '↗'))),
      h('a', { class: 'evw-sc ig', href: ig, target: '_blank', rel: 'noopener' }, h('span', { class: 'mono' }, 'Instagram'), h('b', {}, '@' + SITE.instagram), h('span', {}, 'Reels, stories a fotky z eventu'), h('span', { 'aria-hidden': 'true' }, '↗')),
      h('div', { class: 'evw-sc tag' }, h('span', { class: 'mono' }, 'Natočil si niečo?'), h('b', {}, `#gosko${(ev.city || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`), h('span', {}, 'Označ @' + SITE.instagram + ' a pridáme to sem.')))));
  const postsBox = h('div', { class: 'post-grid three' });
  put(body, sec('clanky', 'Články', postsBox));
  if (ev.partners?.length) put(body, sec('partneri', 'Partneri', h('ul', { class: 'partner-list' }, ev.partners.filter(k => PARTNERS[k]).map(k => partnerItem(k, PARTNERS[k])))));
  const moreBox = h('div', { class: 'evw-more' });
  put(body, sec('dalsie', 'Ďalšie eventy', moreBox));

  const jumpBtn = ([k, t, el]) => h('button', { type: 'button', class: 'chip', 'data-k': k, onclick: () => el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t);
  const jump = h('nav', { class: 'evw-jump', 'aria-label': 'Časti eventu' }, sections.map(jumpBtn));
  const facts = [
    ev.place && ['Kde', ev.place],
    ['Kedy', ev.date ? fmtDate(ev.date) : (ev.when || 'čoskoro')],
    ev.status === 'done' && cats.length && ['Kategórie', cats.map(c => c.name).join(', ')],
  ].filter(Boolean);
  root.append(h('header', { class: 'evw-hero' + (landing ? ' landing' : '') + (isNext ? ' is-next' : ''), style: `--cover:url("${new URL(cover, document.baseURI).href}")` },
    h('div', { class: 'wrap evw-grid' },
      h('div', { class: 'evw-st' }, stk),
      h('div', { class: 'evw-copy' },
        h('p', { class: 'mono evw-k' }, isNext ? `Ďalší stop · ${ev.date ? fmtDate(ev.date) : soonDate(ev)}` : `Odjazdené · ${ev.city}`),
        h('h1', {}, ev.name),
        h('dl', { class: 'evw-facts' }, facts.map(([k, v]) => h('div', {}, h('dt', { class: 'mono' }, k), h('dd', {}, v)))),
        ev.about ? h('p', { class: 'lead' }, ev.about) : null,
        h('div', { class: 'actions' },
          isNext && ev.registration ? h('button', { class: 'btn primary', type: 'button', onclick: () => registerDialog(ev) }, 'Chcem jazdiť') : null,
          isNext && ev.date ? h('button', { class: 'btn', type: 'button', onclick: () => downloadIcs({ title: ev.name, date: ev.date, place: ev.place }) }, 'Do kalendára') : null,
          isNext && !ev.date ? h('button', { class: 'btn', type: 'button', onclick: () => newsletterDialog('event') }, 'Daj mi vedieť dátum') : null,
          !isNext && cats.length ? h('button', { class: 'btn primary', type: 'button', onclick: () => sections.find(s => s[0] === 'vysledky')?.[2].scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Výsledky', icon('arrow')) : null,
          h('a', { class: 'btn', href: ig, target: '_blank', rel: 'noopener' }, icon('insta'), '@' + SITE.instagram))))),
    h('div', { class: 'evw-jumpbar' }, h('div', { class: 'wrap' }, jump)),
    body);

  // články k eventu: keď žiadny nie je, sekcia sa neukáže
  loadPosts().then(posts => {
    const mine = posts.filter(p => p.event_id === ev.id);
    if (mine.length) postsBox.replaceChildren(...mine.map(p => postCard(p)));
    else { postsBox.closest('.evw-sec')?.remove(); jump.querySelector('[data-k="clanky"]')?.remove(); }
  });
  // ďalšie eventy: naše nálepky + najbližšie z kalendára
  const others = EVENTS.filter(e => e.id !== ev.id);
  const mini = h('div', { class: 'evw-mini' }, others.map(e => {
    const im = h('img', { alt: '', width: 120, height: 120 });
    loadLogo().then(logo => { im.src = stickerCanvas(eventSticker(e), logo, 384).toDataURL(); }).catch(() => {});
    return h('a', { href: '#/event/' + e.id, class: 'evw-mi' }, im, h('b', {}, e.name), h('span', { class: 'mono' }, e.status === 'next' ? (e.date ? fmtDate(e.date) : soonDate(e)) : fmtDate(e.date)));
  }));
  const cal = h('ul', { class: 'cal-mini' });
  moreBox.append(mini, h('div', { class: 'cal-box' }, h('div', { class: 'cal-head' }, h('h3', { class: 'mono' }, 'Zo skate kalendára'), h('a', { class: 'linkish', href: '#/eventy#kalendar' }, 'Celý kalendár')), cal));
  upcomingCommunity().then(list => cal.replaceChildren(...list.slice(0, 4).map(e => { const p = parseDate(e.date); return h('li', {},
    h('span', { class: 'cm-d' }, h('b', {}, p.d), h('small', {}, MON[p.m - 1])), flag(e.country),
    h('span', { class: 'cm-t' }, h('b', {}, e.name), h('small', {}, [e.city, e.country].filter(Boolean).join(', '))),
    e.link ? h('a', { class: 'btn small', href: e.link, target: '_blank', rel: 'noopener' }, 'Info') : null); }))).catch(() => {});

  // fotky a klipy od komunity
  if (ev.status === 'done') {
    const load = async () => {
      let items = []; try { items = await store.listEventPhotos(ev.id); } catch (err) { console.error(err); }
      const photos = items.filter(x => x.photo_url).map(x => ({ src: x.photo_url, alt: x.caption || `Fotka od ${x.author}`, credit: x.author, pending: x.pending }));
      const clips = items.filter(x => x.clip_url).map(clipEl).filter(Boolean);
      community.replaceChildren(...[
        h('h3', { class: 'mono evw-sub' }, 'Od komunity'),
        photos.length ? photoGrid(photos) : null,
        clips.length ? h('ul', { class: 'clip-list' }, clips) : null,
        !items.length ? h('p', { class: 'empty' }, 'Máš vlastnú fotku alebo klip z eventu? Pošli ho a pridáme ho sem.') : null,
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => requireLogin(() => photoDialog(ev, load)).then(ok => ok && photoDialog(ev, load)) }, 'Pošli svoju fotku alebo klip')),
        (photos.length || ev.photos?.length) && h('p', { class: 'note' }, 'Si na fotke a nechceš tam byť? ', h('button', { class: 'linklike', type: 'button', onclick: () => privacyDialog({ target: ev.name }) }, 'Napíš nám'), ' a odstránime ju.'),
      ].filter(Boolean));
    };
    await load();
  }
}

function pageRiders(root) { return pageStandings(root, 'jazdci'); }

function pageRider(root, s) {
  const r = riders().find(x => x.slug === s);
  if (!r) return pageNotFound(root);
  const canvas = h('canvas', { 'aria-label': `Doska jazdca ${r.name} s nálepkami` });
  const rankIn = [...r.cats, ...(r.awards.length ? ['award'] : [])].map(c => { const st = standings(c); const i = st.findIndex(x => x.slug === r.slug); return i >= 0 ? `${i + 1}. v rebríčku ${catName(c)}` : null; }).filter(Boolean);
  root.append(h('header', { class: 'hero rider-hero' }, h('div', { class: 'wrap hero-grid' },
    h('div', {},
      h('div', { class: 'rider-id' }, avatarEl(r.name, r.slug), h('h1', { class: 'wide' }, r.name)),
      (() => { const x = RIDERS[r.slug]?.extra, ig = RIDERS[r.slug]?.instagram; const items = [
        ig && h('a', { href: `https://www.instagram.com/${ig}/`, target: '_blank', rel: 'noopener' }, '@' + ig), RIDERS[r.slug]?.city, x?.stance && STANCE[x.stance],
        x?.fav_trick && `Obľúbený trik: ${x.fav_trick}`, x?.home_spot && `Spot: ${x.home_spot}`, x?.crew && h('a', { href: '#/crew/' + x.crew }, 'Crew: ' + crewName(x.crew))].filter(Boolean);
        return items.length || x?.bio ? h('div', { class: 'rider-extra' }, items.length ? h('ul', { class: 'rx-tags' }, items.map(i => h('li', {}, i))) : null, x?.bio ? h('p', {}, x.bio) : null) : null; })(),
      h('p', { class: 'cond big-meta' }, `${r.points} bodov v sezóne ${SITE.season}`),
      rankIn.length ? h('p', {}, rankIn.join(', ') + '.') : null,
      h('h2', { class: 'sub' }, 'Výsledky'),
      h('ul', { class: 'r-results' },
        r.results.map(x => h('li', {}, h('a', { href: '#/event/' + x.ev.id }, x.ev.name), ` ${x.place}. miesto, ${catName(x.cat)}, ${pointsFor(x.place)} b.`)),
        r.awards.map(a => h('li', {}, h('a', { href: '#/event/' + a.ev.id }, a.ev.name), ` ${a.name}, ${awardPoints(a.name)} b.`))),
      h('h2', { class: 'sub' }, 'Odznaky'),
      h('ul', { class: 'badges' }, riderBadges(r).map(b => h('li', { class: 'badge' }, h('span', { class: 'b-ico', html: badgeSvg(b, 22) }),
        h('span', {}, h('strong', {}, b.name), h('small', {}, b.detail ? `${b.text}: ${b.detail}` : b.text))))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => shareCardDialog(r, rankIn) }, 'Zdieľať kartu jazdca')),
      RIDER_DB.has(r.slug) && RIDER_DB.get(r.slug).user_id ? null : h('div', { class: 'claim' }, h('b', {}, 'Si to ty?'), ' Prevezmi si profil a doplň fotku, Instagram a svoj spot. ',
        h('button', { class: 'btn small primary', type: 'button', onclick: () => requireLogin(() => claimDialog(r)).then(ok => ok && claimDialog(r)) }, 'Som to ja')),
      h('p', { class: 'note' },
        h('button', { class: 'linklike', type: 'button', onclick: () => privacyDialog({ target: r.name }) }, r.cats.includes('u16') ? 'Súkromie a odstránenie údajov (U16)' : 'Súkromie a odstránenie údajov'))),
    h('div', { class: 'board-stage' }, canvas, deco('land', 'd-stage-tl'), h('p', { class: 'hint cond' }, 'Ťukni na nálepku a otvorí sa event')))));
  const stop = mountBoard(canvas, { stickers: riderStickers(r), onSticker: go, look: riderLook(r.slug) });
  return () => stop.then(f => f());
}

async function pageParks(root) {
  const tools = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Prekážky' });
  const section = h('section', { class: 'builder light' }, h('div', { class: 'wrap rel' },
    deco('oval', 'd-head'),
    h('h1', { class: 'wide red' }, 'Postav si skatepark'),
    h('p', { class: 'lead' }, matchMedia('(pointer: fine)').matches ? 'Vyber prekážku a ťukni na plochu, alebo ju myšou rovno potiahni. Položené prekážky chytíš a presunieš. Keď je park hotový, pošli ho. Najlepšie parky podľa hlasov budú v top 10.' : 'Vyber prekážku a ťukni na plochu. Položenú prekážku vyberieš ťuknutím, podržaním ju presunieš, alebo ju posuň šípkami. Dvoma prstami park priblížiš, posunieš a otočíš. Keď je hotový, pošli ho. Najlepšie parky podľa hlasov budú v top 10.'),
    h('div', { class: 'viewing', hidden: true }, h('p', { class: 'viewing-text' }), h('button', { class: 'btn viewing-exit', type: 'button' }, 'Späť na môj park')),
    h('div', { class: 'builder-stage' }, h('canvas', { class: 'park-canvas', 'aria-label': 'Stavebná plocha skateparku' }),
      h('div', { class: 'stage-tools' },
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'zoom-in', 'aria-label': 'Priblížiť', title: 'Priblížiť (+)' }, '+'),
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'zoom-out', 'aria-label': 'Oddialiť', title: 'Oddialiť (−)' }, '−'),
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'reset-view', 'aria-label': 'Celá plocha', title: 'Celá plocha (F)' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '⤢'), h('span', { class: 'lbl' }, 'Celá plocha')),
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'view', 'aria-label': 'Otočiť pohľad', title: 'Otočiť pohľad (Q / E)' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '↻'), h('span', { class: 'lbl' }, 'Otočiť pohľad'))),
      h('div', { class: 'sel-bar', role: 'toolbar', 'aria-label': 'Vybraná prekážka', hidden: true },
        h('div', { class: 'sel-pad' },
          h('button', { class: 'btn solid', type: 'button', 'data-act': 'nudge-up', 'aria-label': 'Posunúť dopredu' }, '↑'),
          h('button', { class: 'btn solid', type: 'button', 'data-act': 'nudge-left', 'aria-label': 'Posunúť doľava' }, '←'),
          h('button', { class: 'btn solid', type: 'button', 'data-act': 'nudge-down', 'aria-label': 'Posunúť dozadu' }, '↓'),
          h('button', { class: 'btn solid', type: 'button', 'data-act': 'nudge-right', 'aria-label': 'Posunúť doprava' }, '→')),
        h('div', { class: 'sel-acts' },
          h('button', { class: 'btn solid', type: 'button', 'data-act': 'sel-rotate' }, 'Otočiť'),
          h('button', { class: 'btn solid', type: 'button', 'data-act': 'sel-duplicate' }, 'Kopírovať'),
          h('button', { class: 'btn solid', type: 'button', 'data-act': 'sel-delete' }, 'Zmazať')))),
    tools,
    h('div', { class: 'builder-opts' },
      h('div', { class: 'opt' }, h('span', { class: 'opt-label cond' }, 'Farba'), h('div', { class: 'swatches', role: 'group', 'aria-label': 'Farba prekážky' })),
      h('div', { class: 'opt' }, h('span', { class: 'opt-label cond' }, 'Plocha'), h('div', { class: 'chips sizes', role: 'group', 'aria-label': 'Veľkosť plochy' }))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', 'data-act': 'undo', disabled: true, title: 'Ctrl+Z' }, 'Späť'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'redo', disabled: true, title: 'Ctrl+Y' }, 'Znova'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'rotate', title: 'R' }, 'Otočiť prekážku'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'duplicate', disabled: true, title: 'Ctrl+D' }, 'Kopírovať'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'delete', disabled: true, title: 'Delete' }, 'Zmazať'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'random' }, 'Inšpiruj ma'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'clear' }, 'Vyčistiť plochu'),
      h('button', { class: 'btn primary push', type: 'button', 'data-act': 'send' }, 'Poslať park')),
    h('details', { class: 'kbd-help', hidden: true }, h('summary', {}, 'Ovládanie myšou a klávesnicou'),
      h('ul', {}, [
        ['Klik', 'položí vybranú prekážku alebo vyberie položenú'],
        ['Ťahanie prekážky', 'presun; prekážku z panela môžeš potiahnuť rovno na plochu'],
        ['Ťahanie plochy / pravé tlačidlo', 'otáčanie pohľadu'],
        ['Stredné tlačidlo / Shift + ťahanie', 'posun pohľadu'],
        ['Koliesko', 'priblíženie (najprv klikni do plochy)'],
        ['R', 'otočiť prekážku'], ['Delete', 'zmazať'], ['Ctrl+D', 'kopírovať'], ['Šípky', 'posun vybranej prekážky'],
        ['Ctrl+Z / Ctrl+Y', 'späť / znova'], ['1 – 9', 'výber prekážky'], ['Q / E', 'otočiť pohľad'], ['+ / −', 'priblížiť / oddialiť'], ['F', 'celá plocha'], ['Esc', 'zrušiť výber'],
      ].map(([k, t]) => h('li', {}, h('kbd', {}, k), ' ', t)))),
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
    const lay = builder?.layout();
    if (!lay || lay.items.length < 3) { builder?.say('Pridaj aspoň 3 prekážky, potom môžeš park poslať.'); return; }
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
        const res = await store.submitPark({ ...v, layout: slimLayout(lay), thumb: renderThumb(lay) });
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
  root.append(pageHead('Shop', 'Coming soon. Merch GOSka pripravujeme.'),
    h('div', { class: 'wrap page-body' }, h('p', { class: 'lead' }, 'Zatiaľ tu nič nepredávame. Novinky dávame na Instagram.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/' }, 'Späť na úvod'), h('a', { class: 'btn', href: `https://www.instagram.com/${SITE.instagram}/`, target: '_blank', rel: 'noopener' }, '@' + SITE.instagram))));
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
  if (sub === 'mediakit') return pageMediaKit(root);
  const form = h('div', { class: 'book', id: 'zavolaj' });
  const num = (n, t) => h('li', { class: 'pf-item' }, h('span', { class: 'pf-n' }, n), h('span', { class: 'pf-t' }, t));
  root.append(
    h('header', { class: 'pt-hero' },
      h('div', { class: 'pt-bg', 'aria-hidden': 'true' }, h('img', { src: 'img/ba-trick-1.webp', alt: '' })),
      h('div', { class: 'wrap pt-in' },
        h('span', { class: 'mono pt-k' }, 'Pre partnerov · sezóna 2026/27'),
        h('h1', { class: 'pt-h' }, 'Séria skate súťaží na Slovensku'),
        h('p', { class: 'lead' }, 'GOSko je nový organizátor skate eventov. Komunitná značka, ktorá robí pop-up súťaže Game of S.K.A.T.E., rebríček jazdcov a vlastný digitálny svet.'),
        h('p', {}, 'Organizačne za projektom stojí občianske združenie Slovenská Federácia Skateboardingu.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#zavolaj', onclick: e => { e.preventDefault(); form.scrollIntoView({ behavior: 'smooth' }); } }, 'Chcem spolupracovať'), h('a', { class: 'btn', href: '#/partneri/mediakit' }, 'Media kit (PDF)')))),

    h('section', { class: 'sec' }, h('div', { class: 'wrap pt-three' },
      [['01', 'Eventy', 'Pop-up súťaže po mestách na Slovensku.'], ['02', 'Rebríček a web', 'Body, výsledky a profil každého jazdca.'], ['03', 'Komunita', 'Mapa spotov, parky a klipy.']].map(([n, t, d]) =>
        h('div', { class: 'pt-card' }, h('span', { class: 'pt-num' }, n), h('h3', {}, t), h('p', {}, d))))),

    h('section', { class: 'sec pt-format' }, h('div', { class: 'wrap pt-split' },
      h('div', {},
        h('span', { class: 'mono pt-k' }, 'Formát'),
        h('h2', {}, 'Game of S.K.A.T.E.'),
        h('p', { class: 'lead' }, 'Súboj v trikoch jeden na jedného. Ako HORSE v basketbale.'),
        h('ol', { class: 'pt-steps' }, ['Jazdec predvedie trik.', 'Súper ho musí zopakovať.', 'Kto nezopakuje, dostane písmeno.', 'Kto prvý vyskladá S.K.A.T.E., vypadáva.'].map(t => h('li', {}, t))),
        h('div', { class: 'pt-tags' }, ['Open 16+', 'U16', 'Babská', 'Best Trick'].map((t, i) => h('span', { class: 'pt-tag' + (i === 3 ? ' hot' : '') }, t)))),
      h('img', { src: 'img/ba-trick-2.webp', alt: 'Jazdkyňa vo vzduchu nad doskou', loading: 'lazy', class: 'pt-photo' }))),

    h('section', { class: 'sec' }, h('div', { class: 'wrap' },
      h('span', { class: 'mono pt-k' }, 'Prečo to funguje'),
      h('div', { class: 'pt-why' },
        h('div', {}, h('h3', { class: 'mono' }, 'Pre ľudí'), h('ul', {}, [['Jednoduché', 'Zábava, ktorú pochopí aj divák, ktorý nikdy nestál na doske.'], ['Rýchle', 'Každý duel má víťaza za pár minút.'], ['Stavané na video', 'Každý trik je hotový klip na Reels, TikTok aj Shorts.']].map(([t, d]) => h('li', {}, h('b', {}, t), h('span', {}, d))))),
        h('div', {}, h('h3', { class: 'mono' }, 'Pre značku'), h('ul', {}, [['Skutočná komunita', 'Jazdci, partie, rodičia aj diváci.'], ['Obsah na týždne', 'Pred, počas aj po evente.'], ['Séria, nie akcia', 'Značka sa vracia na každom stope.']].map(([t, d]) => h('li', {}, h('b', {}, t), h('span', {}, d)))))))),

    h('section', { class: 'sec pt-results' }, h('div', { class: 'wrap' },
      h('span', { class: 'mono pt-k' }, 'Čo už máme za sebou'),
      h('ul', { class: 'pt-facts' }, FACTS.map(f => num(f.num, f.label))))),

    h('section', { class: 'sec' }, h('div', { class: 'wrap' },
      h('span', { class: 'mono pt-k' }, 'Obsah'),
      h('h2', {}, 'Jeden event, týždne obsahu'),
      h('div', { class: 'pt-content' },
        [['Pred eventom', 'Ľudia sa tešia', ['Plagát s logami partnerov', 'Program a registrácia v stories', 'Spoločný post s partnerom']],
         ['Počas eventu', 'Ľudia sú pri tom', ['Stories naživo zo spotu', 'Moderátor a DJ spomínajú partnera', 'Best Trick a odovzdávanie cien']],
         ['Po evente', 'Ľudia zdieľajú', ['Výsledky a fotky z pódia', 'Video na YouTube', 'Profily jazdcov a nálepky na webe']]].map(([k, t, l], i) =>
          h('div', { class: 'pt-col' + (i === 1 ? ' dark' : '') }, h('span', { class: 'mono' }, k), h('h3', {}, t), h('ul', {}, l.map(x => h('li', {}, x)))))),
      h('div', { class: 'pt-video' }, videoEmbed(SITE.vlog, 'Vlog z GOSko Bratislava'), h('p', { class: 'note' }, 'Vlog z prvého GOSka v Bratislave. Atmosféra, ktorú žiadne číslo neopíše.')))),

    h('section', { class: 'sec' }, h('div', { class: 'wrap pt-split' },
      h('img', { src: 'img/stage-dj.webp', alt: 'DJ na mobilnej stage v aute Red Bull', loading: 'lazy', class: 'pt-photo', width: 1400, height: 933 }),
      h('div', {}, h('span', { class: 'mono pt-k' }, 'Pop-up'), h('h2', {}, 'Dostaneme sa hocikam. A veľmi rýchlo.'),
        h('p', {}, 'Event auto s mobilnou DJ stage a zvukom. GOSko postavíme na skateparku, námestí aj na festivale.'),
        h('ul', { class: 'pt-list' }, h('li', {}, h('b', {}, 'Bratislava. '), 'Samostatný event v skateparku Rača s DJ a afterparty.'), h('li', {}, h('b', {}, 'Žilina. '), 'GOSko ako súčasť festivalu Shred Fest v skateparku Solinky.'))))),

    h('section', { class: 'sec light' }, h('div', { class: 'wrap' },
      h('span', { class: 'mono pt-k' }, 'Plán 2026/27'),
      h('h2', {}, 'Pilot v novembri, potom hlavná sezóna'),
      h('p', { class: 'lead' }, 'Tri krajské mestá a finále v Bratislave. Mestá vyberáme spolu s partnermi.'),
      h('ol', { class: 'pt-plan' }, PLAN.map(p => h('li', { class: (p.dark ? 'dark' : '') + (p.red ? ' red' : '') }, h('span', { class: 'mono' }, p.when), h('b', {}, p.title), h('span', {}, p.place), p.note ? h('small', {}, p.note) : null))),
      h('div', { class: 'pt-three small' },
        [['Komunitné eventy', 'GOSko pop-upy na festivaloch a jamoch, ako Shred Fest Žilina.'], ['Naše ďalšie projekty', 'GOSko sa objaví aj tam. A partner spolu s ním.']].map(([t, d]) => h('div', { class: 'pt-card' }, h('h3', {}, t), h('p', {}, d)))))),

    h('section', { class: 'sec light' }, h('div', { class: 'wrap' },
      h('span', { class: 'mono pt-k' }, 'Spolupráca'),
      h('h2', {}, 'Ako sa zapojiť'),
      h('ul', { class: 'cards' }, PACKAGES.map(p => h('li', { class: 'card pack' }, h('div', { class: 'card-body' },
        h('h3', { class: 'card-title' }, p.name), h('p', {}, p.text), h('ul', { class: 'gets' }, p.gets.map(g => h('li', {}, g))))))),
      h('p', { class: 'note dark' }, 'Cenu a detaily pošleme na požiadanie. Napíš cez formulár nižšie.'))),

    h('section', { class: 'sec' }, h('div', { class: 'wrap' },
      h('h2', {}, 'S nami doteraz'),
      h('ul', { class: 'partner-list' }, Object.entries(PARTNERS).map(([id, p]) => partnerItem(id, p))))),
    h('section', { class: 'sec light' }, h('div', { class: 'wrap' }, form)));

  form.append(h('h2', {}, 'Zavolaj si GOSko'),
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

function goskoEventCard(e) {
  const photo = e.photos?.[0]?.src || (e.status === 'next' ? 'img/ba-podium.webp' : 'img/ba-trick-5.webp');
  const isNext = e.status === 'next';
  return h('article', { class: 'gk-card' + (isNext ? ' next' : '') },
    h('a', { class: 'gk-img', href: '#/event/' + e.id }, h('img', { src: photo, alt: '', loading: 'lazy' }), h('span', { class: 'gk-st mono' }, isNext ? 'Ďalší stop' : 'Odjazdené')),
    h('div', { class: 'gk-body' },
      h('span', { class: 'mono gk-date' }, e.date ? fmtDate(e.date) : (e.when || 'Dátum čoskoro')),
      h('h3', {}, h('a', { href: '#/event/' + e.id }, e.name)),
      h('p', {}, e.place || (isNext ? 'Miesto zverejníme na Instagrame' : e.city)),
      h('div', { class: 'actions' },
        isNext && e.registration ? h('button', { class: 'btn primary small', type: 'button', onclick: () => registerDialog(e) }, 'Chcem jazdiť') : null,
        h('a', { class: 'btn small', href: '#/event/' + e.id }, isNext ? 'Detail' : 'Výsledky a fotky'))));
}

/* ---------- novinky a články ---------- */
const fmtDateTime = d => { const t = new Date(d); return isNaN(t) ? '' : `${t.getDate()}. ${t.getMonth() + 1}. ${t.getFullYear()}`; };
const paras = text => String(text || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean).map(t => h('p', {}, ...t.split('\n').flatMap((l, i) => i ? [h('br'), l] : [l])));
let POSTS = null;
async function loadPosts() { if (!POSTS) { try { POSTS = await store.listPosts(); } catch (err) { console.error(err); POSTS = []; } } return POSTS; }
function postDialog(post, done) {
  let photo = null;
  formDialog({
    title: post ? 'Upraviť novinku' : 'Pridať novinku', submit: post ? 'Uložiť' : 'Zverejniť',
    intro: 'Stačí nadpis a pár viet. Fotka a odkaz sú nepovinné.',
    fields: [
      { name: 'title', label: 'Nadpis', required: true, max: 120, value: post?.title, placeholder: 'napr. GOSko 3 bude 21. novembra' },
      { name: 'summary', label: 'Krátko (1 – 2 vety)', type: 'textarea', max: 300, value: post?.summary, hint: 'Ukáže sa v zozname noviniek a na úvodke.' },
      { name: 'body', label: 'Celý text', type: 'textarea', rows: 7, max: 20000, value: post?.body, hint: 'Nový odsek = prázdny riadok. Nepovinné.' },
      { name: 'photo', label: 'Fotka', type: 'custom', hint: post?.image_url ? 'Nová fotka nahradí tú súčasnú.' : 'Nepovinné. Fotku zmenšíme pred odoslaním.', render: () => {
        const input = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Fotka k novinke' });
        const prev = h('img', { class: 'photo-prev', alt: '', src: post?.image_url || null, hidden: !post?.image_url });
        input.addEventListener('change', async () => {
          const f = input.files[0]; if (!f) { photo = null; return; }
          try { photo = await resizePhoto(f, store.mode === 'demo' ? 900 : 1600, store.mode === 'demo' ? .7 : .82); prev.src = URL.createObjectURL(photo); prev.hidden = false; } catch { photo = null; }
        });
        return { el: h('div', {}, input, prev), value: () => photo };
      } },
      { name: 'link', label: 'Odkaz (nepovinné)', max: 300, value: post?.link, placeholder: 'https://… alebo napr. #/eventy' },
      { name: 'link_label', label: 'Text tlačidla pri odkaze', max: 40, value: post?.link_label, placeholder: 'napr. Registrácia' },
      { name: 'event_id', label: 'Patrí k eventu (nepovinné)', type: 'select', value: post?.event_id || '', options: [{ value: '', label: 'Nie, všeobecná novinka' }, ...EVENTS.map(e => ({ value: e.id, label: e.name }))], hint: 'Článok sa potom ukáže aj na stránke eventu.' },
      { name: 'author', label: 'Kto píše', max: 60, value: post?.author || 'GOSko crew' },
      { name: 'pinned', label: 'Pripnúť navrch', type: 'checkbox', value: post?.pinned },
      { name: 'published', label: 'Zverejnené (odškrtni a novinka bude skrytá)', type: 'checkbox', value: post ? post.published !== false : true },
    ],
    onSubmit: async v => {
      if (v.link && !/^(https?:\/\/|#\/)/i.test(v.link)) throw new UserError('Odkaz musí začínať https:// alebo #/');
      await store.savePost({ id: post?.id, title: v.title, summary: v.summary || null, body: v.body || null, link: v.link || null, link_label: v.link_label || null,
        author: v.author || null, event_id: v.event_id || null, pinned: !!v.pinned, published: !!v.published, image_url: post?.image_url || null }, v.photo);
      POSTS = null; done && done();
      return post ? 'Uložené.' : 'Novinka je na webe.';
    },
  });
}
/* admin: výber novej titulnej fotky článku (alebo odstránenie) */
function pickPostImage(post, done) {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files[0]; input.remove(); if (!f) return;
    try { toast('Nahrávam fotku…'); await store.setPostImage(post.id, await resizePhoto(f, store.mode === 'demo' ? 900 : 1600, store.mode === 'demo' ? .7 : .82)); POSTS = null; toast('Titulná fotka je zmenená.'); done && done(); }
    catch (err) { console.error(err); toast('Fotku sa nepodarilo nahrať.'); }
  });
  document.body.append(input); input.click();
}
async function removePostImage(post, done) {
  if (!confirm('Odstrániť titulnú fotku článku?')) return;
  try { await store.setPostImage(post.id, null); POSTS = null; toast('Fotka je odstránená.'); done && done(); } catch (err) { console.error(err); toast('Nepodarilo sa odstrániť.'); }
}
function postCard(p, { big } = {}) {
  return h('a', { class: 'post-card' + (big ? ' big' : ''), href: '#/novinka/' + p.id },
    p.image_url ? h('span', { class: 'pc-img' }, h('img', { src: p.image_url, alt: '', loading: 'lazy' })) : h('span', { class: 'pc-img empty', 'aria-hidden': 'true' }, h('img', { src: 'img/ghost-cream.svg', alt: '' })),
    h('span', { class: 'pc-body' },
      h('span', { class: 'mono pc-date' }, fmtDateTime(p.created_at), p.pinned ? ' · dôležité' : ''),
      h('span', { class: 'pc-title' }, p.title),
      p.summary ? h('span', { class: 'pc-sum' }, p.summary) : null));
}
async function pageNews(root) {
  const list = h('div', { class: 'post-grid' }, h('p', { class: 'empty' }, 'Načítavam…'));
  root.append(photoHead(pageHead('Novinky', 'Čo sa deje v GOSku: eventy, výsledky, nové veci na webe.'), 'mc-newspirit', '50% 18%'), h('div', { class: 'wrap page-body' }, list));
  POSTS = null;
  const posts = await loadPosts();
  list.replaceChildren(...(posts.length ? posts.map((p, i) => postCard(p, { big: i === 0 })) : [h('p', { class: 'empty' }, 'Zatiaľ žiadne novinky.')]));
}
async function pagePost(root, id) {
  const p = await store.getPost(id).catch(() => null);
  if (!p) return pageNotFound(root);
  const link = p.link ? (p.link.startsWith('#/') ? h('a', { class: 'btn primary', href: p.link }, p.link_label || 'Viac', h('span', { 'aria-hidden': 'true' }, '→')) : safeUrl(p.link) && h('a', { class: 'btn primary', href: p.link, target: '_blank', rel: 'noopener' }, p.link_label || 'Otvoriť odkaz')) : null;
  const heroBox = h('div', { class: 'post-hero-box' });
  const paintHero = () => heroBox.replaceChildren(...[p.image_url ? h('div', { class: 'post-hero' }, h('img', { src: p.image_url, alt: '' })) : null].filter(Boolean));
  paintHero();
  const adminBar = h('div', { class: 'post-admin', hidden: true });
  const reload = async () => { Object.assign(p, await store.getPost(id).catch(() => p)); paintHero(); paintBar(); };
  const paintBar = () => adminBar.replaceChildren(h('span', { class: 'mono' }, 'Admin'),
    h('button', { class: 'btn small', type: 'button', onclick: () => pickPostImage(p, reload) }, p.image_url ? 'Zmeniť titulnú fotku' : 'Pridať titulnú fotku'),
    p.image_url ? h('button', { class: 'btn small', type: 'button', onclick: () => removePostImage(p, reload) }, 'Odstrániť fotku') : null,
    h('button', { class: 'btn small', type: 'button', onclick: () => postDialog(p, reload) }, 'Upraviť článok'));
  store.isAdmin().then(ok => { if (ok) { paintBar(); adminBar.hidden = false; } }).catch(() => {});
  root.append(h('article', { class: 'post' },
    adminBar, heroBox,
    h('div', { class: 'wrap post-in' },
      h('p', { class: 'mono post-meta' }, [fmtDateTime(p.created_at), p.author].filter(Boolean).join(' · ')),
      h('h1', { class: 'post-title' }, p.title),
      p.summary ? h('p', { class: 'post-lead' }, p.summary) : null,
      h('div', { class: 'post-body' }, paras(p.body)),
      h('div', { class: 'actions' }, link || null, h('a', { class: 'btn', href: '#/novinky' }, '← Všetky novinky')))));
}

async function pageProfile(root) {
  root.append(pageHead('Môj profil', 'Tvoj GOSko účet: duch, doska a XP na jednom mieste.'));
  const body = h('div', { class: 'wrap page-body profile' }); root.append(body);
  const avatarSlot = h('div', { class: 'pf-avatar' });
  if (store.mode === 'live' && !(await store.signedIn())) {
    put(body, h('div', { class: 'pf-grid' }, avatarSlot, h('div', { class: 'pf-card' },
      h('h2', { class: 'wide sub' }, 'Nie si prihlásený'),
      h('p', {}, 'Prihlásenie ti umožní posielať fotky z eventov, pridávať spoty na mapu a hlasovať za parky. Crew sa tu dostane aj do adminu.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => loginDialog(() => route()) }, 'Prihlásiť sa'))));
    mountAvatar(avatarSlot);
    return;
  }
  const [email, admin] = await Promise.all([store.email(), store.isAdmin().catch(() => false)]);
  const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, placeholder: 'aspoň 8 znakov' });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  put(body, h('div', { class: 'pf-grid pf-grid-acct' }, h('div', { class: 'pf-card' },
    h('p', { class: 'mono pf-k' }, 'Prihlásený ako'),
    h('p', { class: 'pf-email' }, email || 'ukážkový režim'),
    admin ? h('p', { class: 'pf-admin' }, h('span', { class: 'chip on' }, 'Admin / crew'), ' ', h('a', { class: 'btn primary', href: '#/admin' }, 'Otvoriť admin'), ' ', h('a', { class: 'btn small', href: '#/admin/vysledky' }, 'Výsledky'), ' ', h('a', { class: 'btn small', href: '#/admin/scan' }, 'Check-in')) : null,
    store.mode === 'live' ? h('form', { class: 'pf-pw', onsubmit: async e => {
      e.preventDefault(); msg.textContent = '';
      if (pw.value.length < 8) { msg.textContent = 'Heslo musí mať aspoň 8 znakov.'; return; }
      try { await store.setPassword(pw.value); pw.value = ''; msg.textContent = 'Heslo je nastavené. Nabudúce sa prihlásiš e-mailom a heslom, bez čakania na e-mail.'; }
      catch (err) { console.error(err); msg.textContent = 'Heslo sa nepodarilo uložiť. Skús iné.'; }
    } }, h('label', { class: 'field' }, 'Nastav si heslo (rýchlejšie prihlásenie)', pw), h('button', { class: 'btn', type: 'submit' }, 'Uložiť heslo'), msg) : null,
    store.mode === 'live' ? h('button', { class: 'btn ghostbtn', type: 'button', onclick: async () => { await store.logout(); updateAccount(); route(); } }, 'Odhlásiť sa') : null)));
  let avatar = mountAvatar(avatarSlot);
  const remount = g => { avatar(); avatarSlot.replaceChildren(); avatar = mountAvatar(avatarSlot, { ghost: g }); paintStyle(); };
  /* Štúdio: duch je stále na očiach (na telefóne prilepený hore, na počítači vľavo), vedľa sa upravuje duch aj doska */
  const styleBar = h('div', { class: 'pf-style', role: 'group', 'aria-label': 'Zobrazenie ducha' });
  const lvlBadge = h('span', { class: 'pf-lvl mono' }, 'LVL 1');
  let curLevel = 1;
  const paintStyle = () => { const cur = localGhost().style || '3d'; styleBar.replaceChildren(...Object.entries(STYLES).map(([k, o]) => { const locked = o.lvl && curLevel < o.lvl; return h('button', { type: 'button', class: 'pf-style-b' + (locked ? ' locked' : ''), 'aria-pressed': String(cur === k), title: locked ? `Odomkne sa na leveli ${o.lvl}` : o.about, onclick: () => { if (locked) { toast(`${o.name} sa odomkne na leveli ${o.lvl}.`); return; } if (cur === k) return; const g = ghostOf({ ...localGhost(), style: k }); cacheGhost(g); editor?.set(g); persistRef.fn?.(g); remount(g); } }, o.name); })); };
  const persistRef = { fn: null }; let editor = null;
  const stage = h('div', { class: 'pf-stage' }, avatarSlot, h('div', { class: 'pf-stage-bar' }, styleBar, lvlBadge));
  const edSlot = h('div', { class: 'pf-pane', id: 'pf-pane-ghost', role: 'tabpanel' }, h('p', {}, 'Načítavam…'));
  // doska ducha = doska z garáže: tu sa upravuje tá istá, zmena sa hneď ukáže na duchovi (3D aj pixel) a uloží do účtu
  const gar = garageEditor(myLook(), l => avatar.api.then(a => a?.setLook?.({ ...DEFAULT_LOOK, ...l })));
  const boardSec = h('div', { class: 'pf-pane', id: 'pf-pane-board', role: 'tabpanel', hidden: true },
    h('p', {}, 'Tvoja skutočná doska: stojí na nej duch, je v 3D garáži aj na tvojej kartičke jazdca.'),
    h('div', { class: 'b3-garage pf-garage' }, gar.tabsBar, gar.panel),
    h('a', { class: 'btn small', href: '#/doska' }, 'Otvoriť 3D garáž'));
  /* jeden editor: záložky Duch | Doska */
  const paneOf = { ghost: edSlot, board: boardSec };
  const edTabs = h('div', { class: 'pf-edtabs', role: 'tablist', 'aria-label': 'Čo upravuješ' },
    [['ghost', 'Duch'], ['board', 'Doska']].map(([k, n], i) => h('button', { type: 'button', role: 'tab', class: 'pf-edtab', 'data-t': k, 'aria-selected': String(i === 0), 'aria-controls': 'pf-pane-' + k,
      onclick: () => { for (const [kk, el] of Object.entries(paneOf)) el.hidden = kk !== k; edTabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === k))); } }, n)));
  const editorSec = h('section', { class: 'pf-editor' }, h('h2', { class: 'evw-h' }, 'Uprav si ducha a dosku'), edTabs, edSlot, boardSec);
  put(body, h('section', { class: 'pf-studio' }, stage, h('div', { class: 'pf-panels' }, editorSec)));
  paintStyle();
  const ghSlot = h('section', { class: 'pf-ghoskate' });
  put(body, ghSlot);
  (async () => {
    await syncProfile();
    const p = cachedProfile(), inv = cachedInventory();
    const level = ghostLevel(await store.myActivity().catch(() => null) || {});
    // editor ducha: zmeny sa hneď ukážu na duchovi a uložia do profilu (alebo len do prehliadača, kým profil nie je)
    const { mountGhostEditor } = await import('./ghost-editor.js');
    const edBox = h('div');
    let saveTimer = null;
    const persist = g => {
      cacheGhost(g);
      if (!p || store.mode !== 'live') return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => { try { const np = await store.saveProfile({ ghost: unlockedGhost(g, inv, level) }); cacheProfile(np, inv); } catch (err) { console.error(err); } }, 900);
    };
    persistRef.fn = persist;
    let autoOn = true; try { autoOn = localStorage.getItem('gosko:ghost-auto') !== '0'; } catch { /* bez úložiska */ }
    const g0 = unlockedGhost(localGhost(), inv, level); cacheGhost(g0);
    if (g0.style !== (localGhost().style || '3d')) remount(g0);
    editor = mountGhostEditor(edBox, { ghost: g0, inventory: inv, level, autoOn,
      onChange: g => { persist(g); avatar.api.then(a => a?.setGhost?.(g)); },
      onStyle: () => remount(localGhost()),
      onEmote: k => avatar.api.then(a => a?.emote?.(k)),
      onAuto: v => { try { localStorage.setItem('gosko:ghost-auto', v ? '1' : '0'); } catch { /* nevadí */ } avatar.api.then(a => a?.setAuto?.(v)); } });
    avatar.api.then(a => a?.setAuto?.(autoOn));
    curLevel = level; lvlBadge.textContent = `LVL ${level} · ${LEVELS[level - 1][1]}`; paintStyle();
    edSlot.replaceChildren(p ? null : h('p', {}, 'Prihlás sa, aby sa duch uložil do účtu. Zatiaľ sa pamätá len v tomto prehliadači.'), edBox);
    const items = inv.filter(i => ITEMS[i]).map(i => h('li', {}, h('b', {}, ITEMS[i].name.sk), h('span', {}, ITEMS[i].about.sk)));
    ghSlot.replaceChildren(...[items.length ? h('h2', { class: 'evw-h' }, 'Tvoj loot') : null, items.length ? h('ul', { class: 'pf-loot' }, items) : null].filter(Boolean));
  })();
  const xpSlot = h('section', { class: 'pf-xp' }, h('p', { class: 'empty' }, 'Načítavam XP…'));
  const rpSlot = h('section', { class: 'pf-rider' });
  put(body, h('div', { class: 'pf-grid2' }, xpSlot, rpSlot));
  store.myActivity().then(a => xpSlot.replaceChildren(h('h2', { class: 'evw-h' }, 'XP a odznaky'), xpBox(a || {}))).catch(err => { console.error(err); xpSlot.replaceChildren(); });
  const renderRider = async () => {
    let mine = null; try { mine = await store.myRiderProfile(); } catch (err) { console.error(err); }
    if (!mine) { rpSlot.replaceChildren(h('h2', { class: 'evw-h' }, 'Profil jazdca'), h('p', {}, 'Jazdil si GOSko? Nájdi sa v rebríčku, klikni na svoje meno a daj „Som to ja“. Po overení si doplníš fotku a info.'), h('a', { class: 'btn', href: '#/jazdci' }, 'Nájsť sa v rebríčku')); return; }
    const name = riders().find(x => x.slug === mine.slug)?.name || mine.slug;
    let photo = null;
    const form = h('form', { class: 'rp-form', onsubmit: async e => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(form));
      msg.textContent = 'Ukladám…';
      try { await store.saveRiderProfile(mine.slug, profileRow(fd), photo); await loadRiderProfiles(); msg.textContent = 'Uložené.'; } catch (err) { console.error(err); msg.textContent = 'Nepodarilo sa uložiť.'; }
    } });
    const msg = h('p', { class: 'form-msg', role: 'status' });
    const file = h('input', { type: 'file', accept: 'image/*' });
    file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { photo = await resizePhoto(f, 800, .85); prev.src = URL.createObjectURL(photo); } catch { photo = null; } });
    const prev = h('img', { class: 'rp-prev', src: mine.photo_url || 'img/ghost-cream.svg', alt: '' });
    for (const f of riderFields(mine)) {
      const input = f.type === 'select' ? h('select', { name: f.name }, f.options.map(o => h('option', { value: o.value, selected: o.value === (mine[f.name] || '') }, o.label)))
        : f.type === 'textarea' ? h('textarea', { name: f.name, maxlength: f.max, rows: 3 }, mine[f.name] || '') : h('input', { name: f.name, maxlength: f.max, value: mine[f.name] || '', placeholder: f.placeholder });
      form.append(h('label', { class: 'field' }, f.label, input));
    }
    form.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Uložiť profil'), h('a', { class: 'btn', href: '#/jazdec/' + mine.slug }, 'Pozrieť profil')), msg);
    rpSlot.replaceChildren(h('h2', { class: 'evw-h' }, 'Profil jazdca'),
      h('p', {}, h('b', {}, name), ' · ', mine.status === 'approved' ? h('span', { class: 'chip on' }, 'Overený') : mine.status === 'pending' ? h('span', { class: 'chip' }, 'Čaká na overenie') : h('span', { class: 'chip' }, 'Zamietnutý')),
      h('div', { class: 'rp-photo' }, prev, h('label', { class: 'field' }, 'Fotka (štvorec, tvár)', file)), form);
  };
  if (store.mode !== 'live' || await store.signedIn()) renderRider();
}
/* slabší telefón alebo úsporný režim: menej 3D */
const LOW_END = (() => { try { const c = navigator.connection; return !!(c && (c.saveData || /2g/.test(c.effectiveType || ''))) || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2); } catch { return false; } })();
/* 3D duch na doske (avatar). Načíta sa až keď treba. */
function mountAvatar(slot, opts = {}) {
  const ghost = opts.ghost || localGhost(), style = opts.style || ghost.style || '3d';
  const look = { ...DEFAULT_LOOK, ...localLoadout() }, onScene = sc => { slot.dataset.scene = sc; };
  if (style === 'pixel') {
    // pixelový duch: čisté plátno, beží aj na slabších telefónoch
    const canvas = h('canvas', { class: 'pixel', 'aria-label': 'Pixelový GOSko duch na skateboarde' });
    slot.append(canvas);
    let stop = null;
    const api = import('./pixel-ghost.js').then(m => m.mountPixelGhost(canvas, { look, ghost, onScene, interactive: opts.interactive !== false })).then(f => { stop = f; return f; }).catch(err => { console.error(err); return null; });
    const off = () => stop && stop(); off.api = api; return off;
  }
  if (LOW_END || REDUCED()) { const still = h('span', { class: 'mascot-still', 'aria-hidden': 'true' }); const draw = g => ghostSvg(g).then(svg => { still.innerHTML = svg; }); draw(ghost); slot.append(still); const off = () => {}; off.api = Promise.resolve({ setGhost: draw, emote() {}, setAuto() {}, trick() {} }); return off; }
  const canvas = h('canvas', { class: style === 'ps1' ? 'ps1' : '', 'aria-label': 'GOSko duch na skateboarde' });
  slot.append(canvas);
  let stop = null;
  const api = import('./mascot.js').then(m => m.mountMascot(canvas, { look, ghost, stickers: lootStickers(cachedInventory()), onScene, ps1: style === 'ps1', interactive: opts.interactive !== false })).then(f => { stop = f; return f; }).catch(err => { console.error(err); return null; });
  const off = () => stop && stop();
  off.api = api;
  return off;
}
/* 3D duch vpravo hore pri „Môj profil“: ten istý duch ako v profile (farby, grimasy, doska).
   Vytvorí sa raz a ostáva aj pri prechode medzi stránkami. Na slabých telefónoch ostane obrázok. */
let acctGhost = null;
function headerGhost() {
  if (acctGhost) return acctGhost.slot;
  const slot = h('span', { class: 'acct-ghost acct-ghost3d', 'aria-hidden': 'true' }, h('img', { class: 'acct-ghost-img', src: 'img/ghost-cream.svg', alt: '', width: 96, height: 108 }));
  acctGhost = { slot, off: null };
  if (LOW_END || REDUCED() || !('IntersectionObserver' in window)) return slot;
  const start = () => {
    if (acctGhost.off) return;
    const off = mountAvatar(slot, { interactive: false });
    acctGhost.off = off;
    off.api.then(api => {
      if (!api) return;
      slot.classList.add('live');
      // pri myši spraví grimasu; inak ich robí sám
      slot.closest('a')?.addEventListener('pointerenter', () => import('./ghost.js').then(m => api.emote?.(m.randomEmote())));
    });
  };
  // až keď je stránka načítaná, aby duch nebrzdil prvé zobrazenie
  (window.requestIdleCallback || (f => setTimeout(f, 1200)))(start);
  return slot;
}
async function updateAccount() {
  const a = document.getElementById('acct'); if (!a || !store) return;
  const inn = store.mode === 'live' ? await store.signedIn().catch(() => false) : false;
  a.classList.toggle('in', inn);
  const adm = inn && await store.isAdmin().catch(() => false);
  document.querySelectorAll('[data-admin-link]').forEach(x => { x.hidden = !adm; });
  a.replaceChildren(h('span', { class: 'acct-t' }, inn || store.mode !== 'live' ? 'Môj profil' : 'Prihlásiť sa'), h('span', { class: 'acct-arrow-w', html: '<svg class="acct-arrow" viewBox="0 0 40 24" aria-hidden="true"><path d="M3 15c7-9 18-11 29-6"/><path d="M27 4.5 33 9l-6.5 3.5"/></svg>' }), headerGhost());
  a.setAttribute('aria-label', inn ? 'Môj profil' : 'Prihlásiť sa');
  const sa = document.getElementById('sh-acct');
  if (sa) sa.querySelector('span').replaceChildren(h('b', {}, inn || store.mode !== 'live' ? 'Môj profil' : 'Prihlásiť sa'), h('small', {}, inn ? 'XP, odznaky a profil jazdca' : 'Hlasuj, posielaj spoty a zbieraj XP'));
}

async function pageAdmin(root) {
  root.append(pageHead('Admin', store.mode === 'demo' ? 'Ukážkový režim: vidíš len to, čo sa uložilo v tomto prehliadači.' : 'Schvaľovanie a doručené formuláre.'));
  const body = h('div', { class: 'wrap page-body' }); root.append(body);
  if (store.mode === 'live' && !(await store.signedIn())) { put(body, h('button', { class: 'btn primary', type: 'button', onclick: loginDialog }, 'Prihlásiť sa')); return; }
  if (!(await store.isAdmin())) { put(body, h('p', {}, 'Tento účet nemá prístup do adminu.')); return; }
  const section = (t, ...kids) => h('section', { class: 'admin-sec' }, h('h2', { class: 'wide sub' }, t), kids);
  const [parks, events, spots, photos] = await Promise.all([store.pendingParks().catch(() => []), store.pendingEvents().catch(() => []), store.pendingSpots().catch(() => []), store.pendingEventPhotos().catch(() => [])]);
  put(body, h('div', { class: 'actions' },
    h('button', { class: 'btn primary', type: 'button', onclick: () => postDialog(null, renderPosts) }, '+ Pridať novinku'),
    h('a', { class: 'btn primary', href: '#/admin/vysledky' }, 'Zapisovať výsledky'),
    h('a', { class: 'btn primary', href: '#/admin/scan' }, 'Check-in (skener)')));
  const postsBox = h('div');
  async function renderPosts() {
    const list = await store.allPosts().catch(() => []);
    postsBox.replaceChildren(list.length ? h('ul', { class: 'admin-list' }, list.map(p => h('li', {},
      p.image_url && h('img', { class: 'thumb', src: p.image_url, alt: '' }),
      h('span', {}, h('b', {}, p.title), ` · ${fmtDateTime(p.created_at)}`, p.pinned ? ' · pripnuté' : '', p.published === false ? ' · skryté' : ''),
      h('a', { href: '#/novinka/' + p.id }, 'pozrieť'),
      h('button', { class: 'btn small', type: 'button', onclick: () => pickPostImage(p, renderPosts) }, p.image_url ? 'Zmeniť fotku' : 'Pridať fotku'),
      p.image_url ? h('button', { class: 'btn small', type: 'button', onclick: () => removePostImage(p, renderPosts) }, 'Odstrániť fotku') : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => postDialog(p, renderPosts) }, 'Upraviť'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!confirm(`Zmazať novinku „${p.title}“?`)) return; await store.deletePost(p.id); renderPosts(); } }, 'Zmazať')))) : h('p', { class: 'empty' }, 'Zatiaľ žiadne novinky.'));
  }
  put(body, section('Novinky a články', h('p', { class: 'note' }, 'Novinka sa hneď zobrazí na webe v časti Novinky a v páse noviniek na úvodke. Pripnutá je vždy prvá.'), postsBox));
  renderPosts();
  /* profily jazdcov: overenie a fotky */
  const claimsBox = h('div');
  async function renderClaims() {
    const list = await store.pendingRiderClaims().catch(() => []);
    claimsBox.replaceChildren(list.length ? h('ul', { class: 'admin-list' }, list.map(c => h('li', {},
      h('span', {}, h('b', {}, riders().find(x => x.slug === c.slug)?.name || c.slug), c.note ? ` · overenie: ${c.note}` : '', c.instagram ? ` · IG @${c.instagram.replace(/^@/, '')}` : ''),
      h('button', { class: 'btn small primary', type: 'button', onclick: async () => { await store.setRiderStatus(c.slug, 'approved'); await loadRiderProfiles(); renderClaims(); } }, 'Schváliť'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { await store.setRiderStatus(c.slug, 'rejected'); renderClaims(); } }, 'Zamietnuť')))) : h('p', { class: 'empty' }, 'Nikto nečaká na overenie.'));
  }
  const riderSel = h('select', { 'aria-label': 'Jazdec' }, riders().map(r => h('option', { value: r.slug }, r.name)));
  const riderFile = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Fotka jazdca' }), riderSt = h('span', { class: 'note' });
  riderFile.addEventListener('change', async () => {
    const f = riderFile.files[0]; if (!f) return; riderSt.textContent = 'Nahrávam…';
    try { await store.adminRiderPhoto(riderSel.value, await resizePhoto(f, 800, .85)); await loadRiderProfiles(); riderSt.textContent = 'Hotovo, fotka je na webe.'; riderFile.value = ''; } catch (err) { console.error(err); riderSt.textContent = 'Nepodarilo sa nahrať.'; }
  });
  put(body, section('Profily jazdcov', h('p', { class: 'note' }, 'Jazdci si môžu prevziať profil („Som to ja“). Over ich (napr. cez Instagram) a schváľ. Fotku jazdca môžeš nahrať aj sám, napr. z odovzdávania cien.'),
    claimsBox, h('div', { class: 'admin-row' }, h('b', {}, 'Fotka jazdca: '), riderSel, riderFile, riderSt)));
  renderClaims();

  /* trik týždňa */
  const trickBox = h('div');
  async function renderTrick() {
    const ch = await store.currentChallenge().catch(() => null);
    const editCh = cur => formDialog({ title: cur ? 'Upraviť trik týždňa' : 'Nový trik týždňa', submit: 'Uložiť',
      fields: [{ name: 'title', label: 'Zadanie', required: true, max: 80, value: cur?.title }, { name: 'description', label: 'Popis', type: 'textarea', max: 600, value: cur?.description },
        { name: 'status', label: 'Fáza', type: 'select', value: cur?.status || 'open', options: [{ value: 'open', label: 'Posielajú sa klipy' }, { value: 'voting', label: 'Hlasovanie (vyber 3 finalistov)' }, { value: 'closed', label: 'Uzavreté (ukáže víťaza)' }] },
        { name: 'ends_on', label: 'Koniec fázy (dátum)', type: 'date', value: cur?.ends_on || '' }],
      onSubmit: async v => { await store.saveChallenge({ id: cur?.id, title: v.title, description: v.description || null, status: v.status, ends_on: v.ends_on || null }); renderTrick(); return 'Uložené.'; } });
    if (!ch) { trickBox.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: () => editCh(null) }, '+ Nový trik týždňa')); return; }
    const entries = await store.adminTrickEntries(ch.id).catch(() => []);
    trickBox.replaceChildren(
      h('p', {}, h('b', {}, ch.title), ` · fáza: ${{ open: 'posielajú sa klipy', voting: 'hlasovanie', closed: 'uzavreté' }[ch.status]}`, ch.ends_on ? ` · do ${fmtDate(ch.ends_on)}` : ''),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => editCh(ch) }, 'Upraviť / zmeniť fázu'), h('button', { class: 'btn', type: 'button', onclick: () => editCh(null) }, '+ Nový trik týždňa')),
      entries.length ? h('ul', { class: 'admin-list' }, entries.map(e => h('li', {},
        h('span', {}, h('b', {}, e.name), e.instagram ? ` @${e.instagram.replace(/^@/, '')}` : '', e.finalist ? ' · FINALISTA' : ''),
        (e.video_url || e.clip_url) ? h('a', { href: e.video_url || e.clip_url, target: '_blank', rel: 'noopener' }, 'pozrieť klip') : null,
        h('button', { class: 'btn small' + (e.finalist ? '' : ' primary'), type: 'button', onclick: async () => { await store.setFinalist(e.id, !e.finalist); renderTrick(); } }, e.finalist ? 'Zrušiť finalistu' : 'Do finále')))) : h('p', { class: 'empty' }, 'Zatiaľ žiadne pokusy.'));
  }
  put(body, section('Trik týždňa', h('p', { class: 'note' }, 'Postup: zadaj trik → ľudia posielajú klipy → vyber 3 do finále a prepni fázu na Hlasovanie → po hlasovaní prepni na Uzavreté a web ukáže víťaza.'), trickBox));
  renderTrick();
  const calEvents = (await store.listEvents().catch(() => [])).filter(e => !e.pending && (e.country === 'Slovensko' || e.country === 'Česko') && (!e.date || e.date >= todayStr()));
  put(body, section('Fotky k eventom v kalendári (SK a CZ)', h('p', { class: 'note' }, 'Bez fotky sa ukáže grafika s názvom mesta. Fotku zmenšíme pred nahratím.'),
    calEvents.length ? h('ul', { class: 'admin-list' }, calEvents.map(e => {
      const input = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Fotka k eventu ' + e.name });
      const st = h('span', { class: 'note' });
      input.addEventListener('change', async () => {
        const f = input.files[0]; if (!f) return; st.textContent = 'Nahrávam…';
        try { await store.setEventImage(e.id, await resizePhoto(f, 1400, .82)); st.textContent = 'Hotovo.'; } catch (err) { console.error(err); st.textContent = 'Nepodarilo sa nahrať.'; }
      });
      return h('li', {}, e.image_url && h('img', { class: 'thumb', src: e.image_url, alt: '' }), h('span', {}, `${e.name}, ${fmtDate(e.date)}, ${e.city}`), input, st);
    })) : h('p', { class: 'empty' }, 'Žiadne nadchádzajúce eventy.')));
  const modBtns = (kind, id) => [
    h('button', { class: 'btn small', type: 'button', onclick: async e => { await store.approve(kind, id); e.currentTarget.closest('li').remove(); } }, 'Schváliť'),
    h('button', { class: 'btn small', type: 'button', onclick: async e => { if (!confirm('Naozaj zamietnuť a zmazať?')) return; await store.reject(kind, id); e.currentTarget.closest('li').remove(); } }, 'Zamietnuť')];
  const none = () => h('p', { class: 'empty' }, 'Nič nečaká.');
  put(body, section('Fotky a klipy na schválenie', photos.length ? h('ul', { class: 'admin-list' }, photos.map(x => h('li', {},
    x.photo_url && h('img', { class: 'thumb', src: x.photo_url, alt: '' }), h('span', {}, `${x.author}${x.caption ? ': ' + x.caption : ''}`),
    safeUrl(x.clip_url) && h('a', { href: x.clip_url, target: '_blank', rel: 'noopener' }, 'klip'), modBtns('photos', x.id)))) : none()));
  put(body, section('Spoty na schválenie', spots.length ? h('ul', { class: 'admin-list' }, spots.map(s => h('li', {},
    s.photo_url && h('img', { class: 'thumb', src: s.photo_url, alt: '' }), h('span', {}, [`${s.name}, ${s.city}`, s.kind, s.difficulty ? `náročnosť ${s.difficulty}/5` : '', s.bust ? `Bustmeter ${s.bust}/5` : '', (s.features || []).join(', '), s.source === 'ghoskate' ? 'z Ghoskate' : ''].filter(Boolean).join(' · ')), s.description ? h('small', {}, s.description) : null, h('a', { href: navLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, 'na mape'), modBtns('spots', s.id)))) : none()));
  put(body, section('Parky na schválenie', parks.length ? h('ul', { class: 'admin-list' }, parks.map(p => h('li', {},
    p.thumb && h('img', { class: 'thumb', src: p.thumb, alt: '' }), h('span', {}, `${p.name}, od ${p.author}, ${p.location}`), modBtns('parks', p.id)))) : none()));
  put(body, section('Eventy na schválenie', events.length ? h('ul', { class: 'admin-list' }, events.map(e => h('li', {},
    h('span', {}, `${e.name}, ${fmtDate(e.date)}, ${e.city}, ${e.country}`), safeUrl(e.link) && h('a', { href: e.link, target: '_blank', rel: 'noopener' }, 'odkaz'), modBtns('events', e.id)))) : none()));
  const cell = v => (v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
  for (const [table, label] of Object.entries(INBOX)) {
    const rows = await store.inbox(table).catch(() => []);
    const keys = rows.length ? Object.keys(rows[0]).filter(k => !['id', 'created'].includes(k)) : [];
    const extra = table === 'registrations' && rows.length ? h('p', { class: 'note' }, `Na evente zapísaných: ${rows.filter(r => r.checked_in_at).length} z ${rows.length}.`) : null;
    const csv = () => {
      const q = v => `"${cell(v).replace(/"/g, '""')}"`;
      const text = [keys.join(';'), ...rows.map(r => keys.map(k => q(r[k])).join(';'))].join('\n');
      const a = h('a', { href: URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' })), download: `${table}.csv` }); document.body.append(a); a.click(); a.remove();
    };
    put(body, section(`${label} (${rows.length})`, rows.length ? [extra,
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, keys.map(k => h('th', {}, k)))), h('tbody', {}, rows.map(r => h('tr', {}, keys.map(k => h('td', {}, cell(r[k])))))))),
      h('button', { class: 'btn small', type: 'button', onclick: csv }, 'Stiahnuť CSV')] : h('p', { class: 'empty' }, 'Zatiaľ nič.')));
  }
}

function pageNotFound(root) {
  root.append(pageHead('Tu nič nie je', 'Stránka neexistuje alebo sa presunula.'), h('div', { class: 'wrap page-body' }, h('div', { class: 'actions' },
    h('a', { class: 'btn primary', href: '#/' }, 'Na úvod'), h('a', { class: 'btn', href: '#/eventy' }, 'Eventy'), h('a', { class: 'btn', href: '#/rebricek' }, 'Rebríček'), h('a', { class: 'btn', href: '#/mapa' }, 'Mapa spotov'))));
}


/* =====================================================================
   NOVÉ: video, newsletter, karta jazdca, mapa, pass, check-in, media kit
   ===================================================================== */
function videoEmbed(id, title) {
  const wrap = h('div', { class: 'video' });
  const btn = h('button', { type: 'button', class: 'video-poster', 'aria-label': 'Prehrať video: ' + title },
    h('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: '', loading: 'lazy', width: 480, height: 360 }),
    h('span', { class: 'play', 'aria-hidden': 'true' }));
  btn.addEventListener('click', () => wrap.replaceChildren(h('iframe', {
    src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, title,
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: true, loading: 'lazy' })));
  wrap.append(btn);
  return wrap;
}

function newsletterFields() {
  return [
    { name: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email' },
    { name: 'consent', label: ['Súhlasím so zasielaním správ o GOSko eventoch. Odhlásiť sa dá kedykoľvek. ', h('a', { href: '#/sukromie', target: '_blank', rel: 'noopener' }, 'Ako narábame s údajmi'), '.'], type: 'checkbox', required: true },
  ];
}
async function subscribe(email, source) {
  const r = await store.subscribe(email, source);
  return r.already ? 'Tento e-mail už máme. Ozveme sa pri ďalšom evente.' : 'Hotovo! Keď vyhlásime ďalšie GOSko, pošleme ti e-mail.';
}
function newsletterDialog(source) {
  formDialog({ title: 'Daj mi vedieť', submit: 'Prihlásiť odber', intro: 'Jeden e-mail, keď vyhlásime dátum a miesto ďalšieho GOSka.',
    fields: newsletterFields(), onSubmit: v => subscribe(v.email, source) });
}
function newsletterInline(source) {
  const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'tvoj@email.sk', 'aria-label': 'E-mail' });
  const consent = h('input', { type: 'checkbox', required: true });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const form = h('form', { class: 'news-form', novalidate: true },
    h('div', { class: 'news-row' }, email),
    h('label', { class: 'check' }, consent, h('span', {}, 'Súhlasím so zasielaním správ o GOSko eventoch. Odhlásiť sa dá kedykoľvek. ', h('a', { href: '#/sukromie', target: '_blank', rel: 'noopener' }, 'Ako narábame s údajmi'), '.')), msg);
  form.querySelector('.check').after(h('button', { class: 'btn primary news-go', type: 'submit' }, 'Chcem vedieť'));
  form.addEventListener('submit', async e => {
    e.preventDefault(); msg.textContent = '';
    if (!isEmail(email.value.trim())) { msg.textContent = 'Skontroluj e-mail.'; return; }
    if (!consent.checked) { msg.textContent = 'Potvrď súhlas so zasielaním.'; return; }
    try { form.replaceChildren(h('p', { class: 'news-ok' }, await subscribe(email.value.trim(), source))); }
    catch (err) { console.error(err); msg.textContent = 'Nepodarilo sa to uložiť. Skús znova.'; }
  });
  return form;
}

async function shareCardDialog(r, rankIn) {
  const body = h('div', { class: 'dlg-body card-body-dlg' }, h('p', {}, 'Pripravujem kartu…'));
  const dlg = h('dialog', { 'aria-label': 'Karta jazdca', class: 'card-dlg' },
    h('div', { class: 'dlg-head' }, h('h3', { class: 'wide' }, 'Karta jazdca'), h('button', { class: 'x', type: 'button', 'aria-label': 'Zavrieť', onclick: () => dlg.close() }, '✕')), body);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
  try {
    const canvas = await riderCard({
      name: r.name, points: r.points, season: SITE.season, stickers: riderStickers(r), badges: riderBadges(r),
      ranks: rankIn.map(s => s.toLocaleUpperCase('sk')),
      lines: r.results.map(x => `${x.ev.name.toLocaleUpperCase('sk')}: ${x.place}. MIESTO`),
    });
    const file = await canvasToFile(canvas, `gosko-${r.slug}.png`);
    const url = URL.createObjectURL(file);
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    body.replaceChildren(
      h('img', { class: 'card-preview', src: url, alt: `Karta jazdca ${r.name}` }),
      h('div', { class: 'form-actions' },
        canShare && h('button', { class: 'btn primary', type: 'button', onclick: () => navigator.share({ files: [file], title: `${r.name} na GOSko`, text: `${r.name} na GOSko @g.o.s.ko` }).catch(() => {}) }, 'Zdieľať'),
        h('a', { class: 'btn' + (canShare ? '' : ' primary'), href: url, download: `gosko-${r.slug}.png` }, 'Stiahnuť obrázok')),
      h('p', { class: 'note dark' }, 'Formát sedí na Instagram Story. Na mobile môžeš obrázok aj podržať a uložiť.'));
  } catch (err) { console.error(err); body.replaceChildren(h('p', {}, 'Kartu sa nepodarilo vytvoriť. Skús to znova.')); }
}

/* ---------- mapa spotov ---------- */
async function resizePhoto(file, max = 1600, quality = .82) {
  const img = new Image(); img.src = URL.createObjectURL(file); await img.decode();
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}
function spotDialog(refresh) {
  let point = null, photo = null;
  formDialog({
    title: 'Pridať spot', submit: 'Poslať spot',
    intro: 'Spot sa na mape zobrazí po schválení.',
    fields: [
      { name: 'name', label: 'Názov spotu', required: true, max: 60, placeholder: 'napr. Schody pri Eurovea' },
      { name: 'city', label: 'Mesto', required: true, max: 40 },
      { name: 'kind', label: 'Typ', type: 'select', options: ['Skatepark', 'Street spot', 'DIY', 'Iné'] },
      { name: 'description', label: 'Popis', type: 'textarea', max: 400, placeholder: 'Čo tam je, povrch, kedy je tam pokoj…' },
      { name: 'photo', label: 'Fotka', type: 'custom', hint: 'Nepovinné. Fotku zmenšíme pred odoslaním.', render: () => {
        const input = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Fotka spotu' });
        const prev = h('img', { class: 'photo-prev', alt: '', hidden: true });
        input.addEventListener('change', async () => {
          const f = input.files[0]; if (!f) { photo = null; prev.hidden = true; return; }
          try { photo = await resizePhoto(f, store.mode === 'demo' ? 900 : 1600, store.mode === 'demo' ? .7 : .82); prev.src = URL.createObjectURL(photo); prev.hidden = false; }
          catch { photo = null; }
        });
        return { el: h('div', {}, input, prev), value: () => photo };
      } },
      { name: 'point', label: 'Presné miesto', type: 'custom', hint: 'Ťukni na mapu alebo potiahni pin.', render: () => {
        const mapEl = h('div', { class: 'picker' });
        const status = h('span', { class: 'picker-status' }, 'Pin ešte nie je položený.');
        let picker = null;
        const locate = h('button', { class: 'btn small', type: 'button', onclick: async () => {
          status.textContent = 'Zisťujem polohu…';
          try { await picker.locate(); } catch (err) { status.textContent = err.message; }
        } }, 'Použiť moju polohu');
        mountPicker(mapEl, p => { point = p; status.textContent = `Pin: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`; }).then(pk => { picker = pk; })
          .catch(() => { status.textContent = 'Mapu sa nepodarilo načítať.'; });
        return { el: h('div', {}, mapEl, h('div', { class: 'picker-bar' }, locate, status)), value: () => point,
          validate: () => point ? '' : 'Polož pin na mapu, aby sme vedeli, kde spot je.', destroy: () => picker && picker.destroy() };
      } },
    ],
    onSubmit: async v => {
      await store.submitSpot({ name: v.name, city: v.city, kind: v.kind, description: v.description || null, lat: v.point.lat, lng: v.point.lng }, v.photo);
      refresh && refresh();
      return store.mode === 'demo' ? 'Spot je uložený. V ukážkovom režime ho vidíš len ty a po schválení v admine.' : 'Ďakujeme! Spot sa na mape zobrazí po schválení.';
    },
  });
}
/* fotky skateparku: hlavná fotka + fotky z eventu v tom parku (photosFrom = id eventu v EVENT_MEDIA) */
const parkPhotos = p => {
  const extra = p.photos || (p.photosFrom ? (EVENT_MEDIA[p.photosFrom]?.photos || []) : []);
  return [...(p.photo ? [{ src: p.photo, alt: p.name }] : []), ...extra.filter(x => x.src !== p.photo)];
};
async function pageMap(root) {
  const mapEl = h('div', { class: 'map' });
  const list = h('ul', { class: 'spot-list' }), parksList = h('ul', { class: 'park-list' }), somBox = h('div');
  root.append(pageHead('Mapa spotov', 'Známe skateparky na Slovensku a street spoty od komunity. Poznáš dobrý spot? Pošli ho aj s fotkou.',
    h('button', { class: 'btn primary', type: 'button', onclick: () => requireLogin(() => spotDialog(load)).then(ok => ok && spotDialog(load)) }, 'Pridať spot')),
    h('div', { class: 'wrap page-body' }, somBox, mapEl,
      h('p', { class: 'map-legend mono' }, h('span', { class: 'lg lg-park' }), 'Skatepark', h('span', { class: 'lg lg-spot' }), 'Spot od komunity', h('span', { class: 'lg lg-event' }), 'GOSko event'),
      h('h2', { class: 'wide sub' }, 'Skateparky'), parksList, h('h2', { class: 'wide sub' }, 'Spoty od komunity'), list));
  let stopMap = null;
  async function load() {
    let spots = [];
    const [R] = await Promise.all([ratingsMap(), store.listSpots().then(x => { spots = x; }).catch(err => console.error(err))]);
    const som = SKATEPARKS.find(p => p.name === SITE.spotOfMonth);
    somBox.replaceChildren(...(som ? [h('section', { class: 'som' + (som.photo ? ' has-photo' : '') },
      som.photo ? h('button', { type: 'button', class: 'som-imgb', onclick: () => lightbox(parkPhotos(som).length ? parkPhotos(som) : [{ src: som.photo, alt: som.name }], 0), 'aria-label': `Fotky: ${som.name}` }, h('img', { class: 'som-img', src: som.photo, alt: som.name, loading: 'lazy' })) : null,
      parkPhotos(som).length ? h('div', { class: 'som-strip' }, parkPhotos(som).slice(1).map((ph, i) => h('button', { type: 'button', onclick: () => lightbox(parkPhotos(som), i + 1), 'aria-label': 'Zväčšiť: ' + ph.alt }, h('img', { src: ph.src, alt: '', loading: 'lazy' })))) : null,
      h('span', { class: 'som-k mono' }, 'Spot mesiaca'), h('h2', {}, som.name), h('p', { class: 'som-c mono' }, [som.area, som.city].filter(Boolean).join(', ')),
      h('p', {}, SITE.spotOfMonthNote || som.about), ratingEl('park:' + slug(som.name), R, load),
      h('a', { class: 'btn small', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(som.name + ' ' + som.city)}`, target: '_blank', rel: 'noopener' }, 'Navigovať'))] : []));
    const visible = spots.filter(s => !s.pending || store.mode === 'demo');
    const evPoints = EVENTS.filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng)).map(e => ({ lat: e.lat, lng: e.lng, kind: 'event', title: e.name,
      popup: h('div', { class: 'pop' }, h('strong', {}, e.name), h('span', {}, [e.place, fmtDate(e.date)].filter(Boolean).join(', ')), h('a', { href: '#/event/' + e.id }, 'Detail eventu')) }));
    const parkLink = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + p.city)}`;
    const parkPoints = SKATEPARKS.map(p => ({ lat: p.lat, lng: p.lng, kind: 'park', title: p.name,
      popup: h('div', { class: 'pop' }, h('strong', {}, p.name), h('span', {}, [p.area, p.city].filter(Boolean).join(', ')), h('span', {}, p.about), h('a', { href: parkLink(p), target: '_blank', rel: 'noopener' }, 'Navigovať')) }));
    /* karty skateparkov: fotka (p.photo v data.js), kým nie je, grafika s názvom; „Na mape“ priblíži park */
    const showOnMap = p => { if (stopMap?.focus) { mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); stopMap.focus(p.lat, p.lng); } };
    parksList.replaceChildren(...SKATEPARKS.map(p => h('li', { class: 'park-card' + (p.photo ? ' has-photo' : '') },
      h('button', { type: 'button', class: 'pk-img', 'aria-label': parkPhotos(p).length ? `Fotky: ${p.name}` : `Ukázať ${p.name} na mape`, onclick: () => parkPhotos(p).length ? lightbox(parkPhotos(p), 0) : showOnMap(p) },
        p.photo ? h('img', { src: p.photo, alt: '', loading: 'lazy' }) : h('span', { class: 'pk-ph', 'aria-hidden': 'true' }, h('span', {}, p.city)),
        parkPhotos(p).length > 1 ? h('span', { class: 'pk-count mono' }, `${parkPhotos(p).length} fotiek`) : null,
        h('span', { class: 'pk-tag mono' + (p.tag === 'GOSko' ? ' hot' : '') }, p.tag)),
      h('div', { class: 'pk-body' },
        h('b', {}, p.name), h('span', { class: 'pk-city' }, [p.area, p.city].filter(Boolean).join(', ')), h('p', {}, p.about), ratingEl('park:' + slug(p.name), R, load),
        h('div', { class: 'pk-act' },
          h('button', { type: 'button', class: 'btn small', onclick: () => showOnMap(p) }, 'Na mape'),
          h('a', { class: 'btn small primary', href: parkLink(p), target: '_blank', rel: 'noopener' }, 'Navigovať'))))));
    const spotPoints = visible.filter(s => !s.pending).map(s => ({ lat: s.lat, lng: s.lng, kind: 'spot', title: s.name,
      popup: h('div', { class: 'pop' }, s.photo_url && h('img', { src: s.photo_url, alt: '' }), h('strong', {}, s.name), h('span', {}, [s.kind, s.city].filter(Boolean).join(', ')),
        h('a', { href: navLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, 'Navigovať')) }));
    if (stopMap) stopMap();
    stopMap = await mountMap(mapEl, [...parkPoints, ...evPoints, ...spotPoints]).catch(err => { console.error(err); mapEl.replaceChildren(h('p', { class: 'empty' }, 'Mapu sa nepodarilo načítať.')); return null; });
    list.replaceChildren(...(visible.length ? visible.map(s => h('li', { class: 'spot' },
      s.photo_url ? h('img', { src: s.photo_url, alt: `Spot ${s.name}`, loading: 'lazy' }) : h('div', { class: 'spot-nophoto', 'aria-hidden': 'true' }),
      h('div', {}, h('p', { class: 'spot-name' }, s.name), h('p', { class: 'spot-meta' }, [s.kind, s.city].filter(Boolean).join(', ')),
        s.description && h('p', { class: 'spot-desc' }, s.description), s.pending && h('span', { class: 'tag' }, 'Čaká na schválenie'), !s.pending && ratingEl('spot:' + s.id, R, load),
        h('a', { class: 'btn small', href: navLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, 'Navigovať')))) : [h('li', { class: 'empty' }, 'Zatiaľ tu nie je žiadny spot. Pošli prvý.')]));
  }
  await load();
  return () => stopMap && stopMap();
}

/* ---------- pass a check-in ---------- */
function passCard(p) {
  const holder = h('div', { class: 'qr' }, h('span', { class: 'empty' }, 'Načítavam QR…'));
  const url = `${location.origin}${APP_BASE}checkin/${p.token}`;
  qrCanvas(url, 520).then(c => { c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'QR kód vstupenky'); holder.replaceChildren(c); })
    .catch(() => holder.replaceChildren(h('p', {}, 'QR sa nepodarilo načítať. Kód vstupenky: ', h('code', {}, p.token.slice(0, 8)))));
  return h('div', { class: 'pass' },
    h('div', { class: 'pass-head' }, h('span', { class: 'wide' }, p.event), h('span', { class: 'cond' }, [catName(p.category), p.date ? fmtDate(p.date) : 'dátum čoskoro'].join(', '))),
    holder, h('p', { class: 'pass-name wide' }, p.name), h('p', { class: 'pass-code cond' }, 'Kód: ' + p.token.slice(0, 8).toUpperCase()));
}
function pagePasses(root) {
  const passes = LSX.get('gosko:passes', []);
  root.append(pageHead('Môj pass', 'Vstupné QR kódy na eventy, na ktoré si sa zaregistroval v tomto telefóne.'),
    h('div', { class: 'wrap page-body' }, passes.length ? h('div', { class: 'passes' }, passes.map(passCard))
      : h('p', { class: 'empty' }, 'Zatiaľ tu nič nie je. Zaregistruj sa na ', h('a', { href: '#/eventy' }, 'najbližší event'), '.')));
}
function updateMenu() {
  const has = LSX.get('gosko:passes', []).length > 0;
  document.querySelectorAll('[data-pass-link]').forEach(a => { a.hidden = !has; });
  const rules = RULES.length > 0 || FAQ.length > 0;
  document.querySelectorAll('[data-rules-link]').forEach(a => { a.hidden = !rules; });
  // menu: karta Ďalšie GOSko a WhatsApp skupina
  const nx = nextEvent(), a = document.getElementById('sh-next');
  if (a) {
    if (nx) { a.setAttribute('href', 'event/' + nx.id); document.getElementById('sh-next-t').textContent = nx.name;
      document.getElementById('sh-next-d').textContent = nx.date ? [fmtDate(nx.date), nx.place || nx.city].filter(Boolean).join(' · ') : `${soonDate(nx)} · ${nx.city} · registrácia otvorená`; }
    else { document.getElementById('sh-next-t').textContent = 'Eventy'; document.getElementById('sh-next-d').textContent = 'Kalendár GOSko aj ďalších'; }
  }
  const wa = document.getElementById('sh-wa'); if (wa && SITE.whatsapp) { wa.href = SITE.whatsapp; wa.hidden = false; }
}
async function checkinView(token, box) {
  box.replaceChildren(h('p', {}, 'Hľadám registráciu…'));
  let r = null;
  try { r = await store.findRegistration(token); } catch (err) { console.error(err); }
  if (!r) { box.replaceChildren(h('div', { class: 'ci ci-bad' }, h('p', { class: 'wide' }, 'Neplatný kód'), h('p', {}, 'Takú registráciu nemáme.'))); return; }
  const ev = EVENTS.find(e => e.id === r.event_id);
  const info = [h('p', { class: 'ci-name wide' }, r.name), h('p', {}, [catName(r.category), r.instagram, r.city].filter(Boolean).join(', ')), h('p', { class: 'cond' }, ev ? ev.name : r.event_id)];
  if (r.category === 'u16') info.push(h('p', { class: r.parent_consent ? 'ci-ok-txt' : 'ci-warn' }, r.parent_consent ? 'Súhlas rodiča: áno' : 'POZOR: chýba súhlas rodiča'));
  if (r.checked_in_at) { box.replaceChildren(h('div', { class: 'ci ci-warn-box' }, h('p', { class: 'wide' }, 'Už zapísaný'), info, h('p', {}, 'Prišiel o ' + new Date(r.checked_in_at).toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })))); return; }
  const confirm = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    confirm.disabled = true;
    try { await store.checkIn(token); box.replaceChildren(h('div', { class: 'ci ci-good' }, h('p', { class: 'wide' }, 'Zapísané'), info)); }
    catch (err) { console.error(err); confirm.disabled = false; box.append(h('p', { class: 'form-msg' }, 'Nepodarilo sa zapísať. Skús znova.')); }
  } }, 'Potvrdiť príchod');
  box.replaceChildren(h('div', { class: 'ci' }, info, confirm));
}
async function adminGate(body) {
  if (store.mode === 'live' && !(await store.signedIn())) { put(body, h('button', { class: 'btn primary', type: 'button', onclick: () => loginDialog(() => route()) }, 'Prihlásiť sa')); return false; }
  if (!(await store.isAdmin())) { put(body, h('p', {}, 'Tento účet nemá prístup. Check-in robí len crew.')); return false; }
  return true;
}
async function pageCheckin(root, token) {
  root.append(pageHead('Check-in', 'Pre crew na evente.'));
  const body = h('div', { class: 'wrap page-body' }); root.append(body);
  if (!(await adminGate(body))) return;
  const box = h('div'); put(body, box, h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/admin/scan' }, 'Skenovať ďalšieho')));
  checkinView(token, box);
}
async function pageScan(root) {
  root.append(pageHead('Skener', 'Namier kameru na QR kód jazdca.'));
  const body = h('div', { class: 'wrap page-body' }); root.append(body);
  if (!(await adminGate(body))) return;
  const video = h('video', { class: 'scan-video', muted: true, playsinline: true });
  const box = h('div', { class: 'scan-result' }, h('p', { class: 'empty' }, 'Čakám na QR kód…'));
  put(body, h('div', { class: 'scan-wrap' }, video, h('span', { class: 'scan-frame', 'aria-hidden': 'true' })), box);
  let stop = null;
  try {
    stop = await startScanner(video, text => {
      const m = text.match(/checkin\/([\w-]+)/) || text.match(/^([0-9a-f-]{36})$/i);
      if (!m) { box.replaceChildren(h('p', { class: 'form-msg' }, 'Tento QR nie je GOSko pass.')); return; }
      if (navigator.vibrate) navigator.vibrate(60);
      checkinView(m[1], box);
    });
  } catch (err) { console.error(err); box.replaceChildren(h('p', { class: 'form-msg' }, 'Kameru sa nepodarilo spustiť. Povoľ prístup ku kamere, alebo naskenuj kód bežnou kamerou mobilu.')); }
  return () => stop && stop();
}

/* ---------- media kit ---------- */
function pageMediaKit(root) {
  const list = riders(), done = EVENTS.filter(e => e.status === 'done');
  const cats = new Set(allResults().map(r => r.cat));
  const numbers = [
    [String(done.length), plural(done.length, 'odjazdený event', 'odjazdené eventy', 'odjazdených eventov'), done.map(e => e.city).join(', ')],
    [String(list.length), plural(list.length, 'jazdec v rebríčku', 'jazdci v rebríčku', 'jazdcov v rebríčku'), 'po prvých eventoch'],
    [String(CATEGORIES.length + 1), plural(CATEGORIES.length + 1, 'kategória', 'kategórie', 'kategórií'), [...CATEGORIES.map(c => c.name), 'Best Trick'].join(', ')],
    ...FACTS.filter(f => /zobrazen|partner/i.test(f.label)).map(f => [f.num, f.label, '']),
  ];
  const photos = (EVENTS.find(e => e.photos?.length)?.photos || []).slice(0, 3);
  const kit = h('div', { class: 'kit' },
    h('section', { class: 'kit-page kit-cover' },
      h('img', { class: 'kit-logo', src: 'img/logo.webp', alt: 'GOSko' }),
      h('h1', { class: 'wide' }, 'Media kit ' + SITE.season),
      h('p', { class: 'kit-lead' }, 'GOSko je komunitná séria Game of S.K.A.T.E. súťaží po Slovensku. Pop-up formát s mobilnou DJ stage, ktorý vieme postaviť na hocijakom spote.'),
      h('div', { class: 'kit-numbers' }, numbers.map(([n, l, s]) => h('div', { class: 'kit-num' }, h('span', { class: 'wide' }, n), h('strong', {}, l), s && h('small', {}, s)))),
      h('div', { class: 'kit-photos' }, photos.map(p => h('img', { src: p.src, alt: p.alt })))),
    h('section', { class: 'kit-page' },
      h('h2', { class: 'wide' }, 'Ako sa zapojiť'),
      h('div', { class: 'kit-packs' }, PACKAGES.map(p => h('div', { class: 'kit-pack' }, h('h3', { class: 'wide' }, p.name), h('p', {}, p.text), h('ul', {}, p.gets.map(g => h('li', {}, g)))))),
      h('h2', { class: 'wide' }, 'S nami boli'),
      h('p', { class: 'kit-partners' }, Object.values(PARTNERS).map(p => `${p.name} (@${p.instagram})`).join('   ')),
      h('h2', { class: 'wide' }, 'Kontakt'),
      h('p', {}, SITE.email ? SITE.email + '   ' : '', 'Instagram @' + SITE.instagram, '   ', location.origin + APP_BASE)));
  root.append(h('div', { class: 'wrap page-body kit-screen' },
    h('div', { class: 'actions no-print' }, h('a', { class: 'btn', href: '#/partneri' }, 'Späť'), h('button', { class: 'btn primary', type: 'button', onclick: () => window.print() }, 'Uložiť ako PDF')),
    h('p', { class: 'note no-print' }, 'Po ťuknutí vyber v tlači „Uložiť ako PDF“. Čísla sa berú priamo z webu, takže sú vždy aktuálne.'),
    kit));
  document.body.classList.add('kit-mode');
  return () => document.body.classList.remove('kit-mode');
}


/* =====================================================================
   NOVÉ: sieň slávy, pravidlá, partner, TV mód, zápis výsledkov
   ===================================================================== */
function hallEl() {
  const body = h('div', { class: 'hall' });
  for (const y of seasonYears()) {
    const finished = !!SEASONS[y]?.finished;
    put(body, h('h3', { class: 'hall-y' }, `Sezóna ${y} `, h('span', { class: 'tag' }, finished ? 'ukončená' : 'prebieha')));
    if (finished) {
      const champs = CATEGORIES.map(c => [c, standings(c.id, null, y)[0]]).filter(([, r]) => r);
      if (champs.length) put(body, h('div', { class: 'champs' }, champs.map(([c, r]) => h('div', { class: 'champ' },
        h('span', { class: 'cond' }, `Šampión: ${c.name}`), h('a', { class: 'wide', href: '#/jazdec/' + r.slug }, r.name), h('span', { class: 'cond' }, `${r.points} b.`)))));
    }
    const evs = EVENTS.filter(e => e.season === y && e.status === 'done');
    const cards = [];
    for (const ev of evs) {
      const wins = CATEGORIES.map(c => [c, (ev.results[c.id] || []).filter(x => x.place === 1)]).filter(([, l]) => l.length);
      if (!wins.length && !ev.awards.length) continue;
      cards.push(h('div', { class: 'hof' },
        h('a', { class: 'hof-ev', href: '#/event/' + ev.id }, h('b', {}, ev.name), h('span', { class: 'mono' }, [ev.place, fmtDate(ev.date)].filter(Boolean).join(' · '))),
        h('ul', {}, wins.map(([c, l]) => l.map(x => h('li', {}, avatarEl(x.name, slug(x.name), { rank: 1 }), h('span', {}, h('small', { class: 'mono' }, c.name), h('a', { href: '#/jazdec/' + slug(x.name) }, x.name))))),
          ev.awards.map(a => h('li', {}, avatarEl(a.rider, slug(a.rider)), h('span', {}, h('small', { class: 'mono' }, a.name), h('a', { href: '#/jazdec/' + slug(a.rider) }, a.rider)))))));
    }
    put(body, cards.length ? h('div', { class: 'hof-grid' }, cards) : h('p', { class: 'empty' }, 'Výsledky doplníme.'));
  }
  return body;
}
function pageHall(root) {
  root.append(pageHead('Sieň slávy', 'Víťazi eventov a šampióni sezón. História sa tu nemaže.'), h('div', { class: 'wrap page-body' }, hallEl()));
}

function pageAbout(root) {
  const pillar = (href, n, t, d) => h('a', { class: 'pl', href }, h('span', { class: 'pl-n mono' }, n), h('span', { class: 'pl-t' }, t), h('span', { class: 'pl-d' }, d), h('span', { class: 'pl-a', 'aria-hidden': 'true' }, '→'));
  root.append(photoHead(pageHead('Kto sme', 'Partia skejterov, ktorá robí Game of S.K.A.T.E. po Slovensku.'), 'cap-gesture', '82% 26%'),
    h('div', { class: 'wrap page-body' },
      h('section', { class: 'about ab-grid' },
        h('div', { class: 'ab-copy' },
          h('p', { class: 'lead' }, 'Robíme pop-up súťaže po mestách, vedieme rebríček jazdcov a staviame digitálny svet pre skejterov: mapu spotov, 3D dosky a trik týždňa.'),
          h('p', {}, 'Začali sme v máji 2026 v Bratislave, v júni nasledovala Žilina na Shred Feste. V novembri štartuje pilot novej sezóny a v roku 2027 chceme obísť krajské mestá na Slovensku.'),
          h('p', { class: 'ab-oz mono' }, 'Za GOSkom stojí občianske združenie Slovenská Federácia Skateboardingu.'),
          h('ul', { class: 'ab-stats' }, FACTS.slice(0, 4).map(f => h('li', {}, h('b', {}, f.num), h('span', {}, f.label))))),
        h('div', { class: 'ab-pillars' },
          pillar('#/eventy', '01', 'Eventy', 'Kde sme jazdili a kde budeme.'),
          pillar('#/rebricek', '02', 'Rebríček a jazdci', 'Kto vedie sezónu a kto vyhral ktorý stop.'),
          pillar('#/komunita', '03', 'Komunita', 'Trik týždňa, crew a mapa spotov.'),
          pillar('#/partneri', '04', 'Pre partnerov', 'Ako sa pridať k sérii.'))),
      h('section', { class: 'ab-team' },
        h('h2', { class: 'wide sub' }, 'Ľudia za GOSkom'),
        h('ul', { class: 'team' }, TEAM.map(t => h('li', { class: 'tm' },
          h('span', { class: 'tm-ini', 'aria-hidden': 'true' }, t.ini),
          h('span', { class: 'tm-body' }, h('b', {}, t.name), h('span', {}, t.role),
            h('span', { class: 'tm-links' }, t.links.map(([label, href]) => h('a', { href, target: /^https?:/.test(href) ? '_blank' : null, rel: /^https?:/.test(href) ? 'noopener' : null }, label))))))),
        h('p', { class: 'note' }, 'Píš nám na ', h('a', { href: 'mailto:' + SITE.email }, SITE.email), ' alebo na Instagram ', igLink(SITE.instagram), '.'))));
}
const TEAM = [
  { name: 'Robert Ďurica', ini: 'RĎ', role: 'Organizácia, eventy a web', links: [['Web', 'https://offthewallhack.github.io/rd2026/'], ['@robodurica', 'https://www.instagram.com/robodurica/']] },
  { name: 'Radoslav „Piry“ Pirožek', ini: 'RP', role: 'Studnica hypotéz', links: [['@studnicahypotez', 'https://www.instagram.com/studnicahypotez/']] },
  { name: 'Jakub Sluka', ini: 'JS', role: '3Style Academy, partner a jazdec', links: [['@3styleacademy.eu', 'https://www.instagram.com/3styleacademy.eu/'], ['Profil jazdca', '#/jazdec/jakub-sluka']] },
];

function pageRules(root) {
  const any = RULES.length > 0 || FAQ.length > 0;
  root.append(photoHead(pageHead('Pravidlá', any ? 'Ako sa hrá GOSko a čo treba vedieť.' : 'Pravidlá a odpovede na časté otázky dopĺňame.'), 'pointing', '78% 16%'));
  const body = h('div', { class: 'wrap page-body' });
  const paras = txt => String(txt).split(/\n\s*\n/).map(x => h('p', {}, x));
  for (const r of RULES) put(body, h('section', { class: 'rule' }, h('h2', { class: 'wide sub' }, r.title), paras(r.text)));
  if (FAQ.length) put(body, h('h2', { class: 'wide sub' }, 'Časté otázky'), FAQ.map(f => h('details', { class: 'faq' }, h('summary', {}, f.q), h('div', {}, paras(f.a)))));
  put(body, h('p', { class: 'note' }, 'Nenašiel si odpoveď? Napíš nám na Instagram ', igLink(SITE.instagram), '.'));
  root.append(body);
}

function pagePartner(root, id) {
  const p = PARTNERS[id];
  if (!p || !p.about) return pageNotFound(root);
  root.append(pageHead(p.name, null));
  const evs = EVENTS.filter(e => (e.partners || []).includes(id));
  root.append(h('div', { class: 'wrap page-body' },
    p.logo ? h('img', { class: 'p-logo big', src: p.logo, alt: p.name }) : null,
    String(p.about).split(/\n\s*\n/).map(x => h('p', { class: 'lead' }, x)),
    h('p', {}, safeUrl(p.url) ? [h('a', { class: 'btn', href: p.url, target: '_blank', rel: 'noopener' }, 'Web partnera'), ' '] : null, igLink(p.instagram)),
    evs.length ? [h('h2', { class: 'wide sub' }, 'S nami na eventoch'), h('ul', { class: 'partner-list' }, evs.map(e => h('li', {}, h('a', { href: '#/event/' + e.id }, e.name), h('span', { class: 'cond' }, fmtDate(e.date)))))] : null));
}

/* ---------- TV mód ---------- */
async function pageTv(root, eventId, pinCat) {
  const ev = EVENTS.find(e => e.id === eventId);
  if (!ev) return pageNotFound(root);
  document.body.classList.add('tv-mode');
  const stage = h('div', { class: 'tv-stage' }), title = h('div', { class: 'tv-title wide' }), dots = h('div', { class: 'tv-dots', 'aria-hidden': 'true' });
  const fs = h('button', { class: 'tv-fs', type: 'button', 'aria-label': 'Celá obrazovka', onclick: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) }, '⛶');
  root.append(h('div', { class: 'tv' },
    h('header', { class: 'tv-head' }, h('img', { class: 'tv-logo', src: 'img/logo.webp', alt: 'GOSko' }), h('div', { class: 'tv-ev' }, h('span', { class: 'wide tv-name' }, ev.name), title)),
    stage, h('div', { class: 'tv-foot' }, h('span', { class: 'wide' }, '@' + SITE.instagram), dots), fs));
  const cats = () => CATEGORIES.filter(c => !pinCat || c.id === pinCat);
  const slides = () => {
    const out = [];
    for (const c of cats()) { if (ev.brackets?.[c.id]) out.push({ kind: 'bracket', cat: c }); else if (ev.results?.[c.id]?.length) out.push({ kind: 'results', cat: c }); }
    for (const c of cats()) if (standings(c.id).length) out.push({ kind: 'standings', cat: c });
    return out;
  };
  let idx = 0, shown = '';
  function render() {
    const list = slides(), liveCat = cats().find(c => ev.brackets?.[c.id]?.current);
    const s = liveCat ? { kind: 'bracket', cat: liveCat } : list[idx % (list.length || 1)];
    const sig = JSON.stringify([s && [s.kind, s.cat.id], ev.brackets, ev.results, ev.awards, s && s.kind === 'standings' ? standings(s.cat.id) : 0]);
    if (sig === shown) return;
    shown = sig; stage.replaceChildren();
    dots.replaceChildren(...list.map((x, i) => h('span', { class: !liveCat && i === idx % list.length ? 'on' : '' })));
    if (!s) { title.textContent = ''; stage.append(h('p', { class: 'tv-empty wide' }, 'Pavúk sa ukáže, keď ho crew vytvorí.')); return; }
    const cn = s.cat.name + (s.cat.note ? ` (${s.cat.note})` : '');
    title.textContent = s.kind === 'standings' ? `Rebríček ${SITE.season}: ${cn}` : cn;
    if (s.kind === 'bracket') {
      const b = ev.brackets[s.cat.id], cur = b.current && b.rounds[b.current.r][b.current.m], nx = nextMatch(b, { skipCurrent: true });
      if (cur || nx) stage.append(h('div', { class: 'tv-now' },
        cur ? [h('span', { class: 'tv-live wide' }, 'Teraz jazdia'), h('span', { class: 'tv-vs wide' }, `${displayName(cur.a)} vs ${displayName(cur.b)}`)] : null,
        nx ? h('span', { class: 'tv-next cond' }, `Ďalší: ${displayName(nx.match.a)} vs ${displayName(nx.match.b)}`) : null));
      stage.append(bracketEl(b, { tv: true, name: displayName }));
    }
    else if (s.kind === 'results') stage.append(h('div', { class: 'podium tv-podium' }, placeList(ev.results[s.cat.id], { limit: 8 })));
    else stage.append(standingsListPlain(standings(s.cat.id), { limit: 8 }));
  }
  render();
  const poll = setInterval(async () => { await refreshRemote(); render(); }, 5000);
  const rot = setInterval(() => { if (!cats().some(c => ev.brackets?.[c.id]?.current)) { idx++; render(); } }, 20000);
  let lock = null;
  const acquire = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch {} };
  const vis = () => { if (document.visibilityState === 'visible') acquire(); };
  acquire(); document.addEventListener('visibilitychange', vis);
  return () => {
    clearInterval(poll); clearInterval(rot); document.removeEventListener('visibilitychange', vis);
    try { lock && lock.release(); } catch {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.body.classList.remove('tv-mode');
  };
}

/* ---------- admin: zápis výsledkov ---------- */
async function pageAdminResults(root, eventId) {
  const ev = eventId && EVENTS.find(e => e.id === eventId);
  root.append(pageHead(ev ? ev.name : 'Výsledky', ev ? 'Pavúk, poradie a ocenenia z eventu.' : 'Vyber event, ku ktorému zapisuješ výsledky.'));
  const body = h('div', { class: 'wrap page-body res' }); root.append(body);
  if (!(await adminGate(body))) return;
  await refreshRemote();
  if (!ev) {
    put(body, h('ul', { class: 'cards' }, EVENTS.map(e => h('li', { class: 'card' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, e.name), h('p', {}, [fmtDate(e.date) || 'dátum čoskoro', e.status === 'next' ? 'pripravovaný' : 'odjazdený'].join(', ')),
      h('a', { class: 'btn primary', href: '#/admin/vysledky/' + e.id }, 'Zapisovať'))))));
    put(body, h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/admin' }, 'Späť do adminu')));
    return;
  }
  let cat = 'open', bracket = null, draft = [], note = '', drawMode = 'random';
  const view = h('div'); put(body, view);
  const clone = o => JSON.parse(JSON.stringify(o));
  const loadBracket = () => { bracket = ev.brackets?.[cat] ? clone(ev.brackets[cat]) : null; };
  const say = m => { note = m; const el = view.querySelector('.res-note'); if (el) el.textContent = m; };
  const failed = err => { console.error(err); say('Nepodarilo sa uložiť. Skús znova.'); };
  const same = s => s.toLocaleLowerCase('sk');
  const savedRaw = () => REMOTE.results.filter(r => r.event_id === ev.id && r.category === cat).map(r => ({ name: r.rider_name, place: r.place })).sort(byPlace);
  async function persist() {
    try { await store.saveBracket(ev.id, cat, bracket); ev.brackets = { ...ev.brackets, [cat]: clone(bracket) }; say('Uložené.'); return true; }
    catch (err) { failed(err); return false; }
  }

  function setupEditor() {
    const input = h('input', { type: 'text', maxlength: 60, placeholder: 'Meno jazdca', 'aria-label': 'Meno jazdca' });
    const add = () => {
      const v = input.value.replace(/\s+/g, ' ').trim(); if (!v) return;
      if (draft.some(x => same(x) === same(v))) { say('Toto meno tam už je.'); return; }
      draft.push(v); note = ''; render(); view.querySelector('.res-add input')?.focus();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const bulk = h('textarea', { rows: 4, placeholder: 'Jedno meno na riadok', 'aria-label': 'Zoznam jazdcov' });
    const addBulk = () => {
      let added = 0;
      for (const line of bulk.value.split('\n')) { const v = line.replace(/\s+/g, ' ').trim(); if (v && !draft.some(x => same(x) === same(v))) { draft.push(v); added++; } }
      note = added ? `Pridaných ${added}.` : 'Nič nové na pridanie.'; render();
    };
    const importRegs = async () => {
      let rows = []; try { rows = await store.inbox('registrations'); } catch (err) { console.error(err); }
      rows = rows.filter(r => r.event_id === ev.id && r.category === cat);
      const arrived = rows.filter(r => r.checked_in_at), use = arrived.length ? arrived : rows;
      if (!use.length) { say('Pre túto kategóriu nie sú žiadne registrácie.'); return; }
      let added = 0;
      for (const r of use) { const n = String(r.name).replace(/\s+/g, ' ').trim(); if (n && !draft.some(x => same(x) === same(n))) { draft.push(n); added++; } }
      note = arrived.length ? `Pridaných ${added} jazdcov, ktorí prišli.` : `Nikto ešte nie je zapísaný ako prítomný, pridal som ${added} registrovaných.`; render();
    };
    const create = async () => {
      try { bracket = makeBracket(draft, { shuffle: drawMode === 'random' }); } catch (err) { say(err.message); return; }
      if (await persist()) render();
    };
    const manual = h('textarea', { rows: 6, placeholder: 'Jedno meno na riadok, od 1. miesta', 'aria-label': 'Poradie jazdcov' });
    const saveManual = async () => {
      let names; try { names = cleanNames(manual.value.split('\n')); } catch (err) { say(err.message); return; }
      if (!names.length) { say('Napíš aspoň jedno meno.'); return; }
      try { await store.saveResults(ev.id, cat, names.map((name, i) => ({ name, place: i + 1 }))); await refreshRemote(); note = `Uložené: ${names.length} jazdcov v poradí.`; render(); } catch (err) { failed(err); }
    };
    return h('section', { class: 'admin-sec' },
      h('h2', { class: 'wide sub' }, 'Pavúk'),
      h('p', { class: 'note' }, 'Zapíš jazdcov, vytvor pavúk a ťukaním na meno označuj víťazov. Pavúk sa ukladá po každom ťuknutí a je vidieť aj na TV.'),
      draft.length ? h('ul', { class: 'draft' }, draft.map((n, i) => h('li', {}, h('span', { class: 'cond' }, `${i + 1}.`), n, h('button', { type: 'button', class: 'x-mini', 'aria-label': `Odstrániť ${n}`, onclick: () => { draft.splice(i, 1); render(); } }, '✕')))) : h('p', { class: 'empty' }, 'Zatiaľ žiadni jazdci.'),
      h('div', { class: 'res-add' }, input, h('button', { class: 'btn small', type: 'button', onclick: add }, 'Pridať')),
      h('details', { class: 'res-more' }, h('summary', {}, 'Vložiť viac mien naraz'), bulk, h('button', { class: 'btn small', type: 'button', onclick: addBulk }, 'Pridať zo zoznamu')),
      h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', onclick: importRegs }, 'Načítať z registrácií a check-inu')),
      h('label', { class: 'res-field' }, 'Losovanie', h('select', { onchange: e => { drawMode = e.target.value; } },
        h('option', { value: 'random', selected: drawMode === 'random' }, 'Náhodné losovanie'), h('option', { value: 'order', selected: drawMode === 'order' }, 'Podľa poradia v zozname (prvý je najlepšie nasadený)'))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: draft.length < 2, onclick: create }, `Vytvoriť pavúk (${draft.length})`)),
      h('details', { class: 'res-more' }, h('summary', {}, 'Alebo zapíš len poradie, bez pavúka'), manual, h('button', { class: 'btn small', type: 'button', onclick: saveManual }, 'Uložiť poradie')));
  }

  function bracketEditor() {
    const done = isComplete(bracket), pr = progress(bracket), nm = nextMatch(bracket);
    const mutate = async fn => { try { fn(bracket); } catch (err) { say(err.message); return; } await persist(); render(); };
    const el = bracketEl(bracket, { interactive: true,
      onPick: (r, m, who) => mutate(b => setWinner(b, r, m, who)),
      onCurrent: (r, m) => mutate(b => toggleCurrent(b, r, m)),
      onClear: (r, m) => mutate(b => clearWinner(b, r, m)) });
    const pl = done ? placements(bracket) : [];
    const saved = done && JSON.stringify(pl.map(x => [x.name, x.place]).sort()) === JSON.stringify(savedRaw().map(x => [x.name, x.place]).sort());
    const saveRes = async () => { try { await store.saveResults(ev.id, cat, pl); await refreshRemote(); note = 'Výsledky sú v rebríčku.'; render(); } catch (err) { failed(err); } };
    const del = async () => {
      if (!confirm('Zmazať pavúk? Uložené výsledky ostanú.')) return;
      try { await store.deleteBracket(ev.id, cat); bracket = null; const nb = { ...ev.brackets }; delete nb[cat]; ev.brackets = nb; note = 'Pavúk zmazaný.'; render(); } catch (err) { failed(err); }
    };
    return h('section', { class: 'admin-sec' },
      h('h2', { class: 'wide sub' }, 'Pavúk'),
      h('p', { class: 'note' }, done ? 'Pavúk je dohraný.' : `Odohrané ${pr.done} z ${pr.total} súbojov.${nm ? ` Ďalší súboj: ${nm.match.a} proti ${nm.match.b} (${roundName(bracket.rounds[nm.r].length)}).` : ''}`),
      h('div', { class: 'br-scroll' }, el),
      done ? h('div', { class: 'res-done' },
        h('p', {}, saved ? 'Výsledky z tohto pavúka sú uložené v rebríčku.' : 'Pavúk je hotový. Uložením sa výsledky započítajú do rebríčka.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: saved, onclick: saveRes }, saved ? 'Uložené' : 'Uložiť výsledky do rebríčka'))) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', onclick: del }, 'Zmazať pavúk')));
  }

  function savedResultsEl() {
    const list = ev.results[cat] || [];
    if (!list.length) return null;
    return h('section', { class: 'admin-sec' }, h('h2', { class: 'wide sub' }, 'Uložené výsledky'), h('div', { class: 'podium' }, placeList(list, { limit: 16 })),
      savedRaw().length
        ? h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!confirm('Zmazať uložené výsledky tejto kategórie?')) return; try { await store.deleteResults(ev.id, cat); await refreshRemote(); note = 'Výsledky zmazané.'; render(); } catch (err) { failed(err); } } }, 'Zmazať výsledky')
        : h('p', { class: 'note' }, 'Tieto výsledky sú zapísané v data.js. Novým uložením ich tu prepíšeš.'));
  }

  function awardsEditor() {
    const list = (ev.rawAwards || []).map(a => ({ name: a.name, rider_name: a.rider }));
    const nameIn = h('input', { type: 'text', value: 'Best Trick', maxlength: 40, 'aria-label': 'Názov ocenenia' });
    const riderIn = h('input', { type: 'text', list: 'rider-names', maxlength: 60, placeholder: 'Meno jazdca', 'aria-label': 'Jazdec' });
    const names = [...new Set([...(bracket?.riders || []), ...riders().map(r => r.name)])];
    const save = async next => { try { await store.saveAwards(ev.id, next); await refreshRemote(); note = 'Ocenenia uložené.'; render(); } catch (err) { failed(err); } };
    return h('section', { class: 'admin-sec' }, h('h2', { class: 'wide sub' }, 'Ocenenia'),
      list.length ? h('ul', { class: 'draft' }, list.map((a, i) => h('li', {}, h('span', { class: 'cond' }, a.name), a.rider_name,
        h('button', { type: 'button', class: 'x-mini', 'aria-label': `Zmazať ocenenie ${a.name}`, onclick: () => save(list.filter((_, j) => j !== i)) }, '✕')))) : h('p', { class: 'empty' }, 'Zatiaľ žiadne ocenenie.'),
      h('div', { class: 'res-add' }, nameIn, riderIn, h('datalist', { id: 'rider-names' }, names.map(n => h('option', { value: n }))),
        h('button', { class: 'btn small', type: 'button', onclick: () => {
          const n = nameIn.value.trim(), r = riderIn.value.replace(/\s+/g, ' ').trim();
          if (!n || !r) { say('Vyplň názov ocenenia aj jazdca.'); return; }
          save([...list, { name: n, rider_name: r }]);
        } }, 'Pridať')));
  }

  function render() {
    view.replaceChildren();
    put(view,
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/admin/vysledky' }, 'Iný event'), h('a', { class: 'btn', href: '#/tv/' + ev.id, target: '_blank', rel: 'noopener' }, 'TV mód')),
      h('h2', { class: 'wide sub' }, 'Kategória'),
      h('div', { class: 'chips' }, CATEGORIES.map(c => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(c.id === cat), onclick: () => { cat = c.id; draft = []; note = ''; loadBracket(); render(); } }, c.name))),
      h('p', { class: 'form-msg res-note', role: 'status' }, note),
      bracket ? bracketEditor() : setupEditor(),
      savedResultsEl(),
      awardsEditor());
  }
  loadBracket(); render();
}


/* =====================================================================
   KOMUNITA: profil jazdca, XP, trik týždňa, crew, spoty, rodičia
   ===================================================================== */
let RIDER_DB = new Map();
async function loadRiderProfiles() {
  try {
    const list = await store.riderProfiles();
    RIDER_DB = new Map(list.map(p => [p.slug, p]));
    for (const p of list) if (p.status === 'approved') RIDERS[p.slug] = { ...RIDERS[p.slug], ...(p.photo_url ? { photo: p.photo_url } : {}), ...(p.instagram ? { instagram: p.instagram.replace(/^@/, '') } : {}), ...(p.city ? { city: p.city } : {}), extra: p };
  } catch (err) { console.error(err); }
}
const STANCE = { regular: 'Regular', goofy: 'Goofy' };
const crewName = id => CREWS.find(c => c.id === id)?.name || id;
function riderFields(prefill = {}) {
  return [
    { name: 'instagram', label: 'Instagram', max: 40, placeholder: '@tvojmeno', value: prefill.instagram },
    { name: 'city', label: 'Mesto', max: 60, value: prefill.city },
    { name: 'stance', label: 'Postoj', type: 'select', value: prefill.stance || '', options: [{ value: '', label: 'Neviem / nepovieme' }, { value: 'regular', label: 'Regular' }, { value: 'goofy', label: 'Goofy' }] },
    { name: 'fav_trick', label: 'Obľúbený trik', max: 60, value: prefill.fav_trick },
    { name: 'home_spot', label: 'Domovský spot', max: 80, value: prefill.home_spot },
    { name: 'crew', label: 'Crew', type: 'select', value: prefill.crew || '', options: [{ value: '', label: 'Žiadna' }, ...CREWS.filter(c => !c.hidden).map(c => ({ value: c.id, label: c.name }))] },
    { name: 'bio', label: 'Pár slov o tebe', type: 'textarea', max: 400, value: prefill.bio },
  ];
}
const profileRow = v => ({ instagram: v.instagram || null, city: v.city || null, stance: v.stance || null, fav_trick: v.fav_trick || null, home_spot: v.home_spot || null, crew: v.crew || null, bio: v.bio || null });
function claimDialog(r) {
  formDialog({
    title: 'Som to ja', submit: 'Poslať na schválenie',
    intro: `Prevezmeš profil „${r.name}“. Crew ho overí (napr. cez tvoj Instagram) a potom si v profile doplníš fotku a info.`,
    fields: [...riderFields(), { name: 'note', label: 'Ako ťa overíme?', max: 300, required: true, placeholder: 'napr. napíšem vám z IG @… / bol som 2. v U16' }],
    onSubmit: async v => {
      try { await store.claimRider(r.slug, { ...profileRow(v), note: v.note }); }
      catch (err) { if (err.message === 'taken') throw new UserError('Tento profil už niekto prevzal. Ak je to omyl, napíš nám na Instagram.'); throw err; }
      await loadRiderProfiles();
      return 'Odoslané. Keď to crew schváli, profil si upravíš v sekcii Môj profil.';
    },
  });
}

/* XP a odznaky za aktivitu na webe */
const BADGES = [
  ['checkins', 1, 'Bol som tam', 'Check-in na GOSko evente'], ['tricks', 1, 'Natočené', 'Poslal si trik týždňa'], ['finalist', 1, 'Finalista', 'Tvoj trik išiel do finále'],
  ['spots', 1, 'Lovec spotov', 'Pridal si spot na mapu'], ['ratings', 5, 'Kritik', 'Ohodnotil si 5 spotov'], ['parks', 1, 'Staviteľ', 'Postavil si skatepark'],
  ['photos', 1, 'Fotograf', 'Poslal si fotku z eventu'], ['trick_votes', 3, 'Porotca', 'Hlasoval si 3× za trik týždňa'], ['rider', 1, 'Overený jazdec', 'Máš overený profil jazdca'],
];
function xpBox(a) {
  const xp = xpOf(a), lv = levelOfXp(xp), name = LEVELS[lv - 1][1], cur = LEVEL_XP[lv - 1], nextXp = LEVEL_XP[lv], nextName = LEVELS[lv]?.[1];
  const pct = nextXp ? Math.round((xp - cur) / (nextXp - cur) * 100) : 100;
  return h('div', { class: 'xp' },
    h('div', { class: 'xp-top' }, h('span', { class: 'xp-lvl' }, name), h('span', { class: 'mono' }, `Level ${lv} · ${xp} XP`)),
    h('div', { class: 'xp-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('i', { style: `width:${pct}%` })),
    h('p', { class: 'mono xp-next' }, nextXp ? `Do levelu ${lv + 1} (${nextName}): ${nextXp - xp} XP` : 'Najvyšší level. Rešpekt.'),
    h('ul', { class: 'badges-grid' }, BADGES.map(([k, min, t, d]) => { const on = (a?.[k] || 0) >= min; return h('li', { class: on ? 'on' : '' }, h('img', { src: 'img/ghost-cream.svg', alt: '' }), h('b', {}, t), h('small', {}, d)); })),
    h('details', { class: 'xp-how' }, h('summary', {}, 'Ako získať XP'), h('ul', {}, XP_RULES.map(([, w, t]) => h('li', {}, h('b', {}, `+${w}`), ' ', t)))));
}

/* trik týždňa */
function trickMedia(e) {
  if (e.video_url) return h('video', { class: 'tk-video', src: e.video_url, controls: true, playsinline: true, preload: 'metadata' });
  const y = ytId(e.clip_url); if (y) return videoEmbed(y, `Trik od ${e.name}`);
  return safeUrl(e.clip_url) ? h('a', { class: 'btn', href: e.clip_url, target: '_blank', rel: 'noopener' }, 'Pozrieť klip ↗') : null;
}
function trickDialog(ch, done) {
  let video = null;
  formDialog({
    title: 'Pošli trik', submit: 'Poslať',
    intro: `${ch.title}. Pošli odkaz na klip (Instagram, TikTok, YouTube) alebo nahraj video do 30 MB.`,
    fields: [
      { name: 'name', label: 'Meno alebo prezývka', required: true, max: 60, value: LSx.get('gosko:reg-me', {}).name },
      { name: 'instagram', label: 'Instagram', max: 40, placeholder: '@tvojmeno', value: LSx.get('gosko:reg-me', {}).instagram },
      { name: 'clip_url', label: 'Odkaz na klip', max: 400, placeholder: 'https://…' },
      { name: 'video', label: 'Alebo nahraj video', type: 'custom', hint: 'MP4, MOV alebo WEBM, najviac 30 MB, ideálne do 30 sekúnd.', render: () => {
        const input = h('input', { type: 'file', accept: 'video/mp4,video/quicktime,video/webm' });
        input.addEventListener('change', () => { video = input.files[0] || null; });
        return { el: input, value: () => video, validate: () => video && video.size > 30 * 1024 * 1024 ? 'Video má viac ako 30 MB. Skráť ho alebo pošli odkaz.' : null };
      } },
      { name: 'ok', label: 'Na videu som ja (alebo mám súhlas jazdca) a GOSko ho môže zverejniť.', type: 'checkbox', required: true },
    ],
    onSubmit: async v => {
      if (!v.video && !safeUrl(v.clip_url)) throw new UserError('Pridaj odkaz na klip alebo nahraj video.');
      await store.submitTrick(ch.id, { name: v.name, instagram: v.instagram || null, clip_url: v.clip_url || null }, v.video);
      done && done();
      return 'Máme to! Po uzávierke vyberieme troch finalistov a o víťazovi rozhodne hlasovanie.';
    },
  });
}
async function pageTrick(root) {
  root.append(pageHead('Trik týždňa', 'Pošli klip, my vyberieme troch finalistov a víťaza určíte vy hlasovaním. Víťaz dostane odznak a miesto v novinkách.'));
  const body = h('div', { class: 'wrap page-body tk' }); root.append(body);
  root.append(photoBand({ kicker: 'Z ihriska', title: 'Takto vyzerá dobrý trik', items: [['flip-fisheye', 'Flip nad rovinkou, širokouhlý záber', 'tall'], ['flip-lakers', 'Kickflip v dresovom tričku', 'tall'], ['flip-tank', 'Skejter v ľahkom predklone na ploche', 'tall']] }));
  let ch = null; try { ch = await store.currentChallenge(); } catch (err) { console.error(err); }
  if (!ch) { put(body, h('p', { class: 'empty' }, 'Nový trik týždňa čoskoro.')); return; }
  const STATUS = { open: ['Posielaj klipy', 'open'], voting: ['Hlasovanie', 'vote'], closed: ['Uzavreté', 'closed'] };
  const [stTxt, stCls] = STATUS[ch.status] || STATUS.open;
  const left = ch.ends_on ? dayDiff(todayStr(), ch.ends_on) : null;
  const mine = h('div'), finals = h('div', { class: 'tk-finals' });
  const send = () => requireLogin(() => trickDialog(ch, load)).then(ok => ok && trickDialog(ch, load));
  put(body,
    h('section', { class: 'tk-hero' },
      h('div', {}, h('span', { class: `tk-st ${stCls}` }, stTxt), left !== null && left >= 0 && ch.status !== 'closed' ? h('span', { class: 'mono tk-left' }, left === 0 ? 'Posledný deň' : `Ešte ${left} ${plural(left, 'deň', 'dni', 'dní')}`) : null,
        h('h2', {}, ch.title), ch.description ? h('p', { class: 'lead' }, ch.description) : null,
        ch.status === 'open' ? h('button', { class: 'btn primary', type: 'button', onclick: send }, 'Poslať môj trik') : null),
      h('ol', { class: 'tk-steps' }, [['Natoč', 'Klip do 30 sekúnd, odkaz alebo video.'], ['Výber', 'Crew vyberie troch finalistov.'], ['Hlasuj', 'Jeden hlas na účet.'], ['Víťaz', 'Odznak, novinky a rešpekt.']].map(([t, d]) => h('li', {}, h('b', {}, t), h('span', {}, d))))),
    mine, h('h2', { class: 'evw-h' }, ch.status === 'open' ? 'Finalisti budú tu' : 'Finalisti'), finals);
  async function load() {
    const [entries, results, myVote] = await Promise.all([store.myTrickEntries(ch.id).catch(() => []), store.trickResults(ch.id).catch(() => []), store.myTrickVote(ch.id).catch(() => null)]);
    mine.replaceChildren(...(entries.length ? [h('div', { class: 'tk-mine' }, h('b', {}, 'Tvoje pokusy: '), entries.map(e => h('span', { class: 'chip' }, e.finalist ? 'Finalista!' : 'Čaká na výber')))] : []));
    const showVotes = ch.status === 'closed' || !!myVote, max = Math.max(1, ...results.map(r => r.votes));
    const winner = ch.status === 'closed' ? [...results].sort((a, b) => b.votes - a.votes)[0] : null;
    finals.replaceChildren(...(results.length ? results.map(e => h('article', { class: 'tk-card' + (myVote === e.id ? ' mine' : '') + (winner === e ? ' win' : '') },
      winner === e ? h('span', { class: 'tk-crown' }, 'Víťaz') : null,
      trickMedia(e),
      h('div', { class: 'tk-meta' }, h('b', {}, e.name), e.instagram ? h('a', { href: `https://www.instagram.com/${e.instagram.replace(/^@/, '')}/`, target: '_blank', rel: 'noopener' }, '@' + e.instagram.replace(/^@/, '')) : null),
      showVotes ? h('div', { class: 'tk-bar' }, h('i', { style: `width:${Math.round(e.votes / max * 100)}%` }), h('span', { class: 'mono' }, `${e.votes} ${plural(e.votes, 'hlas', 'hlasy', 'hlasov')}`)) : null,
      ch.status === 'voting' ? h('button', { class: 'btn' + (myVote === e.id ? '' : ' primary'), type: 'button', disabled: myVote === e.id, onclick: async () => {
        if (!(await requireLogin(load))) return;
        try { await store.voteTrick(ch.id, e.id); toast('Hlas je tvoj. Ďakujeme!'); load(); } catch (err) { console.error(err); toast('Hlas sa nepodarilo uložiť.'); }
      } }, myVote === e.id ? 'Tvoj hlas' : 'Hlasovať') : null))
      : [h('p', { class: 'empty' }, ch.status === 'open' ? 'Po uzávierke tu budú traja finalisti a hlasovanie. Pošli svoj trik, môžeš byť medzi nimi.' : 'Finalistov ešte vyberáme.')]));
  }
  await load();
}

/* crew */
function crewMembers(c) {
  const all = riders();
  return all.filter(r => c.members?.includes(r.name) || RIDERS[r.slug]?.extra?.crew === c.id);
}
function pageCrews(root) {
  root.append(pageHead('Crew', 'Partie, ktoré ťahajú scénu. Každá crew má svojich jazdcov, eventy a spoty. Ste crew a chýbate tu? Napíšte nám.'),
    h('div', { class: 'wrap page-body' }, h('div', { class: 'crew-grid' }, CREWS.map(c => {
      const n = crewMembers(c).length;
      /* skryté crew (hidden: true v data.js): kým nemáme dohodu, karta je rozmazaná a bez odkazu */
      if (c.hidden) return h('div', { class: 'crew-card blur', 'aria-hidden': 'true' },
        h('span', { class: 'crew-mark' }, '??'), h('b', {}, 'Ďalšia crew'), h('span', { class: 'mono' }, 'čoskoro'), h('span', { class: 'crew-about' }, 'Pripravujeme spoluprácu s ďalšou partiou zo scény.'));
      return h('a', { class: 'crew-card', href: '#/crew/' + c.id },
        h('span', { class: 'crew-mark' }, c.name.slice(0, 2).toUpperCase()), h('b', {}, c.name),
        h('span', { class: 'mono' }, [c.city, n ? `${n} ${plural(n, 'jazdec', 'jazdci', 'jazdcov')}` : null].filter(Boolean).join(' · ') || 'Slovensko'),
        h('span', { class: 'crew-about' }, c.about));
    }))), photoBand({ kicker: 'Scéna', title: 'Partie, ktoré to ťahajú', items: [['bench-crew', 'Partia oddychuje na lavičke pri skateparku', 'tall'], ['bowl-portrait', 'Organizátor s vodou a jedlom v rukách', 'tall'], ['peace', 'Skejter zdvíha ruky pred plagátom partnera', 'tall']] }));
}
async function pageCrew(root, id) {
  const c = CREWS.find(x => x.id === id);
  if (!c || c.hidden) return pageNotFound(root);
  const members = crewMembers(c), evBox = h('ul', { class: 'cal-mini' }, h('li', { class: 'empty' }, 'Načítavam…'));
  root.append(pageHead(c.name, c.about,
    c.instagram ? h('a', { class: 'btn', href: `https://www.instagram.com/${c.instagram}/`, target: '_blank', rel: 'noopener' }, '@' + c.instagram) : null),
    h('div', { class: 'wrap page-body crew-page' },
      h('section', {}, h('h2', { class: 'evw-h' }, 'Jazdci'), members.length ? h('ul', { class: 'crew-members' }, members.map(r => h('li', {}, h('a', { href: '#/jazdec/' + r.slug }, avatarEl(r.name, r.slug), h('span', {}, r.name))))) :
        h('p', { class: 'empty' }, 'Členov doplníme. Jazdíš za túto crew? Prevezmi svoj profil jazdca a vyber si ju.')),
      h('section', {}, h('h2', { class: 'evw-h' }, 'Eventy'), evBox)));
  try {
    const list = (await store.listEvents()).filter(e => !e.pending && c.organizer && (e.organizer || '').toLowerCase().includes(c.organizer.toLowerCase()));
    const gosko = c.id === 'gosko' ? EVENTS.map(e => ({ name: e.name, date: e.date, city: e.city, country: 'Slovensko', href: '#/event/' + e.id })) : [];
    const all = [...gosko, ...list];
    evBox.replaceChildren(...(all.length ? all.map(e => { const p = parseDate(e.date); return h('li', {}, h('span', { class: 'cm-d' }, h('b', {}, p ? p.d : '?'), h('small', {}, p ? MON[p.m - 1] : '')), flag(e.country),
      h('span', { class: 'cm-t' }, h('b', {}, e.name), h('small', {}, [e.city, e.country].filter(Boolean).join(', '))),
      e.href ? h('a', { class: 'btn small', href: e.href }, 'Detail') : e.link ? h('a', { class: 'btn small', href: e.link, target: '_blank', rel: 'noopener' }, 'Info') : null); }) : [h('li', { class: 'empty' }, 'Zatiaľ žiadne eventy v kalendári.')]));
  } catch { evBox.replaceChildren(h('li', { class: 'empty' }, 'Eventy sa nepodarilo načítať.')); }
}

/* hodnotenie spotov */
const RATING_TAGS = ['hladký povrch', 'kryté (aj v daždi)', 'svetlo večer', 'málo ľudí', 'pre začiatočníkov', 'street', 'bowl', 'shop blízko'];
function starsEl(avg, n) { return h('span', { class: 'stars', title: n ? `${avg.toFixed(1)} z 5 (${n})` : 'Zatiaľ bez hodnotenia' }, h('span', { class: 'st-on', style: `width:${(avg / 5) * 100}%` }, '★★★★★'), h('span', { class: 'st-off' }, '★★★★★')); }
function ratingEl(key, R, refresh) {
  const r = R.get(key) || { sum: 0, n: 0, tags: {}, mine: null };
  const avg = r.n ? r.sum / r.n : 0;
  const top = Object.entries(r.tags).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  return h('div', { class: 'rate' },
    starsEl(avg, r.n), h('span', { class: 'mono rate-n' }, r.n ? `${avg.toFixed(1)} · ${r.n} ${plural(r.n, 'hodnotenie', 'hodnotenia', 'hodnotení')}` : 'Bez hodnotenia'),
    top.length ? h('span', { class: 'rate-tags' }, top.map(t => h('span', { class: 'chip' }, t))) : null,
    h('button', { class: 'linklike', type: 'button', onclick: () => requireLogin(() => rateDialog(key, r.mine, refresh)).then(ok => ok && rateDialog(key, r.mine, refresh)) }, r.mine ? 'Zmeniť hodnotenie' : 'Ohodnotiť'));
}
function rateDialog(key, mine, refresh) {
  let stars = mine?.stars || 0; const tags = new Set(mine?.tags || []);
  formDialog({
    title: 'Ohodnoť spot', submit: 'Uložiť',
    fields: [{ name: 'stars', label: 'Hviezdičky', type: 'custom', render: () => {
      const box = h('div', { class: 'star-pick', role: 'radiogroup', 'aria-label': 'Počet hviezdičiek' });
      const paint = () => box.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i < stars));
      for (let i = 1; i <= 5; i++) box.append(h('button', { type: 'button', role: 'radio', 'aria-label': `${i} z 5`, onclick: () => { stars = i; paint(); } }, '★'));
      paint(); return { el: box, value: () => stars, validate: () => stars ? null : 'Vyber počet hviezdičiek.' };
    } }, { name: 'tags', label: 'Čo platí?', type: 'custom', render: () => {
      const box = h('div', { class: 'chips' }, RATING_TAGS.map(t => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(tags.has(t)), onclick: e => { tags.has(t) ? tags.delete(t) : tags.add(t); e.currentTarget.setAttribute('aria-pressed', String(tags.has(t))); } }, t)));
      return { el: box, value: () => [...tags] };
    } }],
    onSubmit: async v => { await store.rateSpot(key, v.stars, v.tags); refresh && refresh(); return 'Ďakujeme! Hodnotenie pomôže ostatným.'; },
  });
}
async function ratingsMap() {
  const R = new Map(); let me = null;
  try { me = (await store.me())?.id; } catch {}
  try { for (const x of await store.spotRatings()) { const r = R.get(x.spot_key) || { sum: 0, n: 0, tags: {}, mine: null }; r.sum += x.stars; r.n++; for (const t of x.tags || []) r.tags[t] = (r.tags[t] || 0) + 1; if (me && x.user_id === me) r.mine = x; R.set(x.spot_key, r); } } catch (err) { console.error(err); }
  return R;
}

/* rodičia */
function pageParents(root) {
  const qa = (q, ...a) => h('details', { class: 'faq-i' }, h('summary', {}, q), h('div', {}, a));
  root.append(pageHead('Pre rodičov', 'Váš syn alebo dcéra chce jazdiť GOSko? Tu je všetko podstatné na jednom mieste.'),
    h('div', { class: 'wrap page-body parents' },
      h('div', { class: 'par-grid' },
        [['Čo je GOSko', 'Komunitná súťaž Game of S.K.A.T.E.: dvaja jazdci sa striedajú v trikoch, kto trik nezopakuje, dostane písmeno. Žiadne rampy na čas, žiadny tlak. Kategória U16 je pre jazdcov do 16 rokov.'],
         ['Bezpečnosť', 'Pre U16 odporúčame prilbu a chrániče. Na mieste je crew, ktorá jazdu riadi, a pri súťaži sa jazdí po jednom. Jazdí sa na skateparkoch, nie na ulici.'],
         ['Súhlas rodiča', 'Pri registrácii jazdca do 16 rokov potvrdzujete súhlas s účasťou a so zverejnením výsledkov. Bez neho jazdec v U16 nesúťaží.'],
         ['Čo priniesť', 'Dosku, prilbu a chrániče, vodu a niečo na zahryznutie. Registrácia je zadarmo, vstupný QR kód príde po registrácii.'],
         ['Fotky a súkromie', 'Na eventoch fotíme. Ak si neprajete, aby bolo dieťa na fotke alebo s celým menom v rebríčku, stačí nám napísať a upravíme to.'],
         ['Kontakt', `Najrýchlejšie cez Instagram @${SITE.instagram}${SITE.email ? ' alebo e-mail ' + SITE.email : ''}. Na evente sa pýtajte crew v tričku GOSko.`]].map(([t, d]) => h('section', { class: 'par-card' }, h('h2', {}, t), h('p', {}, d)))),
      h('h2', { class: 'evw-h' }, 'Časté otázky'),
      qa('Od koľkých rokov môže dieťa jazdiť?', h('p', {}, 'Vekovú hranicu nemáme. Dôležité je, aby jazdec zvládal základy a cítil sa na doske istý.')),
      qa('Stojí to niečo?', h('p', {}, 'Registrácia aj účasť sú zadarmo. Ceny pre víťazov dávajú partneri.')),
      qa('Musím byť pri tom?', h('p', {}, 'U mladších detí odporúčame, aby bol rodič alebo dospelý na mieste. Pri U16 stačí súhlas pri registrácii.')),
      qa('Ako zmením alebo zmažem údaje dieťaťa?', h('p', {}, h('button', { class: 'linklike', type: 'button', onclick: () => privacyDialog() }, 'Pošlite nám žiadosť'), ' a vybavíme ju.')),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/eventy' }, 'Najbližšie eventy'), RULES.length || FAQ.length ? h('a', { class: 'btn', href: '#/pravidla' }, 'Pravidlá') : null, h('a', { class: 'btn', href: '#/sukromie' }, 'Ochrana osobných údajov'))));
}

/* komunita */
function pageCommunity(root) {
  const park = SKATEPARKS.find(p => p.name === SITE.spotOfMonth);
  const card = (href, k, t, d, cls = '') => h('a', { class: 'cm-card ' + cls, href, target: /^https?:/.test(href) ? '_blank' : null, rel: /^https?:/.test(href) ? 'noopener' : null }, h('span', { class: 'mono' }, k), h('b', {}, t), h('span', {}, d), h('span', { class: 'cm-go', 'aria-hidden': 'true' }, '→'));
  root.append(photoHead(pageHead('Komunita', 'GOSko nie je len súťaž. Je to partia ľudí, ktorí jazdia, točia, stavajú a chodia na spoty.'), 'carry-table', '50% 55%'),
    h('div', { class: 'wrap page-body' },
      h('div', { class: 'cm-grid' },
        SITE.whatsapp ? card(SITE.whatsapp, 'WhatsApp', 'Pridaj sa do WhatsApp skupiny', 'Dohadovanie sessionov, novinky a info o GOSku skôr ako inde.', 'whatsapp')
          : card(`https://www.instagram.com/${SITE.instagram}/`, 'Instagram', '@' + SITE.instagram, 'Novinky, výsledky a klipy z eventov tu dávame ako prvé.', 'insta'),
        card('#/trik-tyzdna', 'Každý týždeň', 'Trik týždňa', 'Pošli klip, vyberieme troch finalistov a ty hlasuješ.', 'red'),
        card('#/crew', 'Partie', 'Crew', CREWS.filter(c => !c.hidden).map(c => c.name).join(', ') + ' a ďalšie. Jazdci, eventy, spoty.'),
        park ? card('#/mapa', 'Spot mesiaca', park.name, SITE.spotOfMonthNote || park.about, 'cream') : null,
        card('#/mapa', 'Mapa', 'Spoty s hodnotením', 'Pridaj spot, ohodnoť povrch, svetlo aj to, či je kryté.'),
        card('#/profil', 'Profil', 'XP a odznaky', 'Za check-in, triky, spoty aj parky zbieraš XP a odomykáš odznaky.'),
        card('#/rodicia', 'U16', 'Pre rodičov', 'Bezpečnosť, súhlas, čo priniesť. Všetko na jednom mieste.'),
        SITE.whatsapp ? null : h('div', { class: 'cm-card whatsapp soon' }, h('span', { class: 'mono' }, 'WhatsApp'), h('b', {}, 'WhatsApp skupina čoskoro'), h('span', {}, 'Chystáme skupinu na sessiony a novinky. Odkaz dáme aj na Instagram.')))));
  root.append(photoBand({ kicker: 'Partia', title: 'Ľudia, kvôli ktorým to robíme', items: [['hug', 'Dvaja skejteri sa objímajú po jazde', 'tall'], ['car-sitting', 'Partia oddychuje v tieni pri eventovom aute Red Bull', 'tall'], ['crowd-board', 'Skejteri v kruhu a doska v popredí', 'wide']] }));
}

/* ochrana osobných údajov (GDPR). Návrh: pred spustením ho nech skontroluje niekto, kto sa v tom vyzná. */
function pagePrivacy(root) {
  const O = SITE.org || {}, miss = 'doplníme';
  const contact = SITE.email ? h('a', { href: 'mailto:' + SITE.email }, SITE.email) : igLink(SITE.instagram);
  const sec = (t, ...kids) => h('section', { class: 'pv-sec' }, h('h2', {}, t), kids);
  const li = items => h('ul', {}, items.map(x => h('li', {}, x)));
  root.append(pageHead('Ochrana osobných údajov', 'Aké údaje o tebe máme, prečo, ako dlho a čo s nimi môžeš urobiť. Bez právnických kľučiek.'),
    h('div', { class: 'wrap page-body pv' },
      sec('Kto sa o údaje stará',
        h('p', {}, h('b', {}, O.name || 'GOSko'), O.address ? `, ${O.address}` : `, sídlo ${miss}`, O.ico ? `, IČO ${O.ico}` : `, IČO ${miss}`, '.'),
        h('p', {}, 'Kontakt na otázky a žiadosti: ', contact, '.')),
      sec('Čo zbierame a prečo',
        li([
          [h('b', {}, 'Registrácia na event: '), 'meno alebo prezývka, Instagram, mesto, kategória, e-mail alebo telefón a pri jazdcoch do 16 rokov súhlas rodiča. Potrebujeme ich na organizáciu eventu a check-in. Základ: tvoj súhlas pri registrácii.'],
          [h('b', {}, 'Výsledky a fotky z eventov: '), 'meno, kategória a umiestnenie sú verejne v rebríčku, na eventoch fotíme. Je to dokumentácia podujatia a história série (oprávnený záujem). Na požiadanie skrátime priezvisko alebo fotku odstránime.'],
          [h('b', {}, 'Odber noviniek: '), 'e-mail. Pošleme ti správu, keď vyhlásime ďalšie GOSko. Základ: tvoj súhlas, odhlásiť sa dá kedykoľvek.'],
          [h('b', {}, 'Účet: '), 'e-mail na prihlásenie a to, čo si sám doplníš do profilu jazdca (fotka, Instagram, mesto, spot, crew).'],
          [h('b', {}, 'Čo pošleš ty: '), 'fotky a klipy z eventov, spoty na mapu, parky, triky týždňa, hodnotenia a hlasy. Zobrazujú sa po schválení, pri obsahu uvádzame autora, ktorého zadáš.'],
          [h('b', {}, 'Formuláre: '), 'Zavolaj si GOSko, pridanie eventu a žiadosti o súkromie. Kontakt použijeme len na odpoveď.'],
        ])),
      sec('Jazdci do 16 rokov',
        h('p', {}, 'Jazdec v kategórii U16 sa registruje so súhlasom rodiča alebo zákonného zástupcu. Rodič môže kedykoľvek požiadať o skrátenie mena v rebríčku, odstránenie fotky alebo zmazanie údajov. ', h('a', { href: '#/rodicia' }, 'Viac pre rodičov'), '.')),
      sec('Kto ešte s údajmi pracuje',
        h('p', {}, 'Údaje ukladáme v databáze Supabase. Web beží na GitHub Pages. Pri načítaní stránky sa tvoja IP adresa dostane aj k službám, z ktorých web načítava písma, knižnice a mapy (Google Fonts, jsDelivr, OpenStreetMap, flagcdn). Video z YouTube sa načíta až po ťuknutí na prehrať. Údaje nepredávame a nedávame ich partnerom.')),
      sec('Ako dlho',
        li(['Registrácie: do konca sezóny, potom ich zmažeme. Výsledky ostávajú ako história série.', 'Odber noviniek: kým sa neodhlásiš.', 'Účet a obsah, ktorý pošleš: kým ich nezmažeš ty alebo nepožiadaš o zmazanie.', 'Správy z formulárov: najviac 2 roky.'])),
      sec('Cookies a úložisko v prehliadači',
        h('p', {}, 'Nepoužívame reklamné ani analytické cookies. V tvojom prehliadači si web pamätá len nastavenia, napríklad vzhľad tvojej dosky, prihlásenie a vstupný QR pass.')),
      sec('Tvoje práva',
        h('p', {}, 'Môžeš požiadať o prístup k údajom, ich opravu, vymazanie, obmedzenie spracovania alebo prenos, namietať proti spracovaniu a kedykoľvek odvolať súhlas. Ak máš pocit, že s údajmi nenarábame správne, môžeš sa obrátiť na Úrad na ochranu osobných údajov SR.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => privacyDialog() }, 'Poslať žiadosť'))),
      h('p', { class: 'note' }, 'Platné od 18. 10. 2026.')));
}

/* =====================================================================
   ROUTER
   ===================================================================== */
const ROUTES = [
  [/^#?\/?$/, pageHome, ''],
  [/^#\/rebricek$/, pageStandings, 'rebricek'],
  [/^#\/eventy$/, pageEvents, 'eventy'],
  [/^#\/novinky$/, pageNews, 'novinky'],
  [/^#\/novinka\/([\w-]+)$/, pagePost, 'novinky'],
  [/^#\/event\/([\w-]+)$/, pageEvent, 'eventy'],
  [/^#\/kalendar\/([\w-]+)$/, pageCalEvent, 'eventy'],
  [/^#\/jazdci$/, pageRiders, 'rebricek'],
  [/^#\/jazdec\/([\w-]+)$/, pageRider, 'jazdci'],
  [/^#\/parky$/, pageParks, 'parky'],
  [/^#\/doska$/, pageBoard, ''],
  [/^#\/shop$/, pageShop, 'shop'],
  [/^#\/partneri(?:\/(\w+))?$/, pagePartners, 'partneri'],
  [/^#\/mapa$/, pageMap, 'mapa'],
  [/^#\/pass$/, pagePasses, ''],
  [/^#\/checkin\/([\w-]+)$/, pageCheckin, ''],
  [/^#\/admin\/scan$/, pageScan, ''],
  [/^#\/admin\/vysledky(?:\/([\w-]+))?$/, pageAdminResults, ''],
  [/^#\/pravidla$/, pageRules, 'pravidla'],
  [/^#\/o-nas$/, pageAbout, 'o-nas'],
  [/^#\/komunita$/, pageCommunity, 'komunita'],
  [/^#\/trik-tyzdna$/, pageTrick, 'komunita'],
  [/^#\/crew$/, pageCrews, 'komunita'],
  [/^#\/crew\/([\w-]+)$/, pageCrew, 'komunita'],
  [/^#\/rodicia$/, pageParents, 'komunita'],
  [/^#\/sukromie$/, pagePrivacy, 'sukromie'],
  [/^#\/sien-slavy$/, root => pageStandings(root, 'sien-slavy'), 'rebricek'],
  [/^#\/partner\/([\w-]+)$/, pagePartner, 'partneri'],
  [/^#\/tv\/([\w-]+)(?:\/(\w+))?$/, pageTv, ''],
  [/^#\/admin$/, pageAdmin, ''],
  [/^#\/profil$/, pageProfile, 'profil'],
];
let store, cleanup = null, onAuthChange = null, renderId = 0;
/* Prvky pod okrajom obrazovky sa pri príchode jemne dosunú. Obsah je viditeľný stále. */
let revealIO = null;
function reveal(main) {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  revealIO ||= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('rv-pre'); revealIO.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  for (const el of main.querySelectorAll('.band, .home-sec, .tv-sec .wrap, .standings, .ev-list, .gallery, .cards, .pband .pb-grid')) {
    if (el.getBoundingClientRect().top < innerHeight) continue;
    el.classList.add('rv', 'rv-pre'); revealIO.observe(el);
  }
}
async function route() {
  const id = ++renderId;
  if (cleanup) { try { await cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  const rest = decodeURI(location.pathname.startsWith(APP_BASE) ? location.pathname.slice(APP_BASE.length) : '').replace(/^index\.html$/, '').replace(/\/$/, '');
  const hash = '#/' + rest;
  const [re, page, nav] = ROUTES.find(([re]) => re.test(hash)) || [null, pageNotFound, ''];
  const args = re ? hash.match(re).slice(1) : [];
  const main = $('#main'); main.replaceChildren(); window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === nav && !!nav));
  const tab = !rest ? 'home' : ({ jazdci: 'rebricek', 'sien-slavy': 'rebricek', 'o-nas': 'komunita' })[nav] || nav;
  document.querySelectorAll('.tabbar [data-tab]').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === tab));
  document.body.dataset.page = rest ? rest.split('/')[0] : 'home';
  setBack(rest);
  const res = await page(main, ...args);
  if (id !== renderId) { if (typeof res === 'function') res(); return; }
  if (page === pageHome) main.append(siteFeed());
  else if (![pageAdmin, pageAdminResults, pageScan, pageCheckin, pageTv, pagePasses, pageProfile, pageNotFound, pageMediaKit].includes(page)) main.append(newsStrip());
  reveal(main);
  cleanup = typeof res === 'function' ? res : null;
  main.focus({ preventScroll: true });
  document.documentElement.classList.add('ready');
  runIntro();
}

/* úvodná animácia na domovskej stránke (raz za reláciu): duch + GOSko ~2 s, potom doletia na miesto v hero a pozadie odroluje */
function runIntro() {
  const d = document.documentElement;
  if (!d.hasAttribute('data-intro') || d.classList.contains('intro-done') || d.dataset.introRun) return;
  d.dataset.introRun = '1';
  try { introSequence(d); } catch (err) { console.error(err); d.classList.add('intro-done'); }
}
function introSequence(d) {
  const finish = () => { d.classList.add('intro-done'); try { sessionStorage.setItem('gosko:intro', '1'); } catch { /* bez úložiska */ } };
  const boot = document.querySelector('.boot'), g = boot?.querySelector('.bi-ghost'), w = boot?.querySelector('.bi-word');
  const tg = document.querySelector('.vh-bigghost'), tw = document.querySelector('.vh-word');
  if (!g || !w || !tg || !tw) return finish();
  /* Duch a nápis letia na miesto v titulke. Cieľ sa meria znova v každom okamihu pohybu, takže
     dopadnú presne, aj keď sa rozloženie titulky medzitým posunie (novinky, písma, posuvník). */
  const go = () => {
    const DUR = REDUCED() ? 1 : 950;
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: el.offsetWidth }; };
    const items = [[g, tg, -8], [w, tw, 0]].map(([el, to, rot]) => {
      el.style.animation = 'none'; el.style.transition = 'none'; el.style.transform = 'none';
      void el.offsetWidth;
      return { el, to, rot, a: box(el) };
    });
    d.classList.add('boot-go');
    const t0 = performance.now(), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const frame = now => {
      const t = Math.min(1, (now - t0) / DUR), p = ease(t);
      for (const { el, to, rot, a } of items) {
        const b = box(to);
        el.style.transform = `translate(${((b.x - a.x) * p).toFixed(2)}px, ${((b.y - a.y) * p).toFixed(2)}px) scale(${(1 + (b.w / a.w - 1) * p).toFixed(4)}) rotate(${(rot * p).toFixed(2)}deg)`;
      }
      if (t < 1) requestAnimationFrame(frame); else finish();
    };
    requestAnimationFrame(frame);
  };
  const poster = new Image(); poster.src = SITE.heroPoster || 'img/hero-poster.jpg';
  const posterReady = new Promise(r => { poster.onload = poster.onerror = r; setTimeout(r, 3500); });
  Promise.all([posterReady, new Promise(r => setTimeout(r, Math.max(0, 2300 - performance.now())))]).then(go);
}

/* ---------- tlačidlo Späť ---------- */
/* Kam vedie Späť, keď človek prišiel rovno na podstránku (napr. z odkazu na Instagrame). */
function parentOf(rest) {
  const [a, b] = rest.split('/');
  if (!a) return null;
  if (a === 'event') return 'eventy';
  if (a === 'jazdec' || a === 'jazdci' || a === 'sien-slavy') return 'rebricek';
  if (a === 'novinka') return 'novinky';
  if (a === 'crew' && b) return 'crew';
  if (a === 'partner' || (a === 'partneri' && b)) return 'partneri';
  if (a === 'admin' && b) return 'admin';
  if (['trik-tyzdna', 'crew', 'rodicia'].includes(a)) return 'komunita';
  return '';
}
let backTarget = null;
function setBack(rest) {
  const btn = $('#tb-back');
  backTarget = parentOf(rest);
  if (btn) { btn.hidden = backTarget === null; if (backTarget !== null) btn.setAttribute('href', APP_BASE + backTarget); }
  document.body.classList.toggle('has-back', backTarget !== null);
}
function goBack() {
  if (backTarget === null) return;
  if (navDepth() > 0) history.back();
  else go('#/' + backTarget);
}

/* menu ako panel zo spodnej lišty */
function initMenu() {
  const menu = $('#menu'), tabBtn = $('#tab-menu') || h('button');
  if (!menu) return;
  const open = () => {
    if (menu.open) return close();
    menu.showModal(); menu.classList.remove('out');
    tabBtn.setAttribute('aria-expanded', 'true'); document.body.classList.add('menu-open');
  };
  const close = () => {
    if (!menu.open || menu.classList.contains('out')) return;
    menu.classList.add('out'); tabBtn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('menu-open');
    setTimeout(() => { menu.close(); menu.classList.remove('out'); }, REDUCED() ? 0 : 220);
  };
  $('#menu-open')?.addEventListener('click', open);
  tabBtn.addEventListener('click', open);
  menu.addEventListener('cancel', e => { e.preventDefault(); close(); });
  menu.addEventListener('click', e => { if (e.target === menu || e.target.closest('a,[data-close]')) close(); });
  // potiahnutie panelu dole ho zavrie
  let y0 = null;
  menu.addEventListener('touchstart', e => { y0 = (menu.querySelector('.sh-body')?.scrollTop || 0) <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  menu.addEventListener('touchmove', e => { if (y0 === null) return; const d = e.touches[0].clientY - y0; menu.style.transform = d > 0 ? `translateY(${d}px)` : ''; }, { passive: true });
  menu.addEventListener('touchend', e => { if (y0 === null) return; const d = e.changedTouches[0].clientY - y0; y0 = null; menu.style.transform = ''; if (d > 90) close(); }, { passive: true });
}

/* na ploche (appka bez prehliadača) nie je systémové potiahnutie späť: spravíme vlastné od ľavého okraja */
function initSwipeBack() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!standalone) return;
  const hint = h('div', { class: 'swipe-back', 'aria-hidden': 'true' }, icon('back'));
  document.body.append(hint);
  let s = null;
  addEventListener('touchstart', e => {
    const t = e.touches[0];
    s = e.touches.length === 1 && t.clientX < 26 && backTarget !== null && !document.querySelector('dialog[open]') ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!s) return;
    const t = e.touches[0], dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y);
    if (dy > 50 && dy > dx) { s = null; hint.classList.remove('on'); return; }
    hint.style.setProperty('--p', String(Math.max(0, Math.min(1, dx / 110)))); hint.classList.add('on');
  }, { passive: true });
  addEventListener('touchend', e => {
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x, quick = Date.now() - s.t < 900; s = null;
    hint.classList.remove('on');
    if (dx > 80 && quick) goBack();
  }, { passive: true });
}

(async function start() {
  // bez približovania stránky: iOS ignoruje maximum-scale pri dvoch prstoch, preto gesto zastavíme (okrem mapy a 3D)
  const zoomOk = t => t && t.closest && t.closest('.map, .picker, canvas, .leaflet-container');
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => { if (!zoomOk(e.target)) e.preventDefault(); }, { passive: false }));
  initPwa();
  $('#footer-news').addEventListener('click', () => newsletterDialog('footer'));
  updateMenu();
  initMenu();
  initSwipeBack();
  $('#tb-back')?.addEventListener('click', e => { e.preventDefault(); goBack(); });
  if (!history.state) history.replaceState({ n: 0 }, '');
  applyData();
  const roller = mountRoller($('#tb-cal') || $('#topbar')?.appendChild(h('div', { class: 'tb-cal', id: 'tb-cal' })) || h('div'));
  store = await getStore(CONFIG);
  roller.load();
  /* návrat z prihlasovacieho odkazu: #access_token=… alebo chyba */
  if (/access_token=|error_description=/.test(location.hash) || /[?&]code=/.test(location.search)) {
    await store.signedIn().catch(() => false);
    const err = new URLSearchParams(location.hash.replace(/^#/, '')).get('error_description');
    history.replaceState({ n: 0 }, '', APP_BASE + 'profil');
    if (err) setTimeout(() => toast('Prihlasovací odkaz nefungoval: ' + err.replace(/\+/g, ' ') + '. Pošli si nový.'), 800);
  }
  store.onAuth(() => { updateAccount(); syncProfile(); onAuthChange && onAuthChange(); });
  updateAccount();
  syncProfile();
  // profily jazdcov a výsledky z databázy načítame naraz; dlhšie ako 2,5 s na ne nečakáme
  let dataLate = false;
  const dataP = Promise.all([loadRiderProfiles(), refreshRemote()]);
  await Promise.race([dataP, new Promise(r => setTimeout(() => { dataLate = true; r(); }, 2500))]);
  // keď dáta prídu neskôr, prvú podstránku (nie úvodku s videom) prekreslíme, ak sa s ňou ešte nič nerobilo
  dataP.then(() => { if (dataLate && renderId === 1 && document.body.dataset.page !== 'home' && scrollY < 40 && !document.querySelector('dialog[open]')) route(); });
  // staré odkazy s #/ prepíšeme na skutočné adresy
  const legacy = () => { if (location.hash.startsWith('#/')) { history.replaceState({ n: navDepth() }, '', APP_BASE + location.hash.slice(2)); return true; } return false; };
  legacy();
  window.addEventListener('hashchange', () => { if (legacy()) route(); });
  window.addEventListener('popstate', route);
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !u.pathname.startsWith(APP_BASE)) return;
    const rest = u.pathname.slice(APP_BASE.length);
    if (/^(hub|ghoskate)(\/|$)/.test(rest) || /\.[a-z0-9]{2,5}$/i.test(rest)) return;
    if (u.pathname === location.pathname && u.search === location.search && u.hash && !u.hash.startsWith('#/')) return;
    e.preventDefault();
    if (u.pathname + u.search !== location.pathname + location.search) pushNav(u.pathname + u.search + u.hash);
    else if (u.hash) { document.getElementById(u.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); return; }
    route();
  });
  route();
})();

/* tlačidlo Hore: ukáže sa po odrolovaní o jednu obrazovku */
(() => {
  const b = document.getElementById('to-top'); if (!b) return;
  let raf = 0;
  const upd = () => { raf = 0; b.hidden = scrollY < innerHeight * .9; };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  b.addEventListener('click', () => scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' }));
  upd();
})();
