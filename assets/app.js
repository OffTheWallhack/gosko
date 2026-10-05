import { CONFIG, SITE, POINTS, CATEGORIES, EVENTS, PARTNERS, FACTS, PACKAGES, PRODUCTS, SEASONS, SEASON_RULES, RULES, FAQ, RIDER_PRIVACY, RIDERS, PLAN, SKATEPARKS } from '../data.js';
import { tvScene, polaroidStrip } from './crt.js';
import { makeBracket, setWinner, clearWinner, toggleCurrent, isComplete, progress, placements, nextMatch, roundName, cleanNames } from './bracket.js';
import { getStore, INBOX, isEmail } from './store.js';
import { badgesFor, badgeSvg } from './badges.js';
import { qrCanvas, startScanner, loadScript } from './qr.js';
import { mountMap, mountPicker, navLink } from './map.js';
import { initPwa } from './pwa.js';
import { deco } from './deco.js';
import * as RK from './ranking.js';
import { safeUrl, csvRows, icsText, decodePasses, mergePasses, importTarget, UserError } from './util.js';
import { NAME_MODES, COUNTRIES, isMinor, todayIn, validateRegistration, buildPayload, completeRegistration, fetchPass, upsertPass } from './register.js';
import { apiRequest, browserFetch } from './api.js';
import { pointsTable, rankingRules, PRIVACY } from './pages.js';
import { consumeReturn } from './game/return.js';
/* 3D (three.js, 1,3 MB z CDN) sa načítava cez import() len tam, kde sa kreslí:
   board.js (doska na úvode a u jazdca), park.js (stavebnica parkov), card.js (karta jazdca). */

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
const slug = RK.slug;
const MONTHS = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];
const MON = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec'];
const parseDate = d => { const [y, m, dd] = (d || '').split('-').map(Number); return y ? { y, m, d: dd } : null; };
const fmtDate = d => { const p = parseDate(d); return p ? `${p.d}. ${MONTHS[p.m - 1]} ${p.y}` : ''; };
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;
const catName = id => CATEGORIES.find(c => c.id === id)?.name || id;
const pointsFor = place => RK.pointsFor(place, POINTS);
const riderHref = x => '#/jazdec/' + RK.riderKey(x);
const awardHref = a => riderHref({ name: a.rider, rider_id: a.rider_id });
const igLink = handle => h('a', { href: `https://www.instagram.com/${handle}/`, target: '_blank', rel: 'noopener' }, '@' + handle);

/* ---------- súkromie a výsledky (data.js + databáza) ---------- */
const displayName = name => RK.displayName(name, RIDER_PRIVACY);
const BASE = new Map(EVENTS.map(ev => [ev.id, { status: ev.status, sticker: ev.sticker, results: ev.results || {}, awards: ev.awards || [] }]));
/* Dáta z databázy. Riadok výsledku: { event_id, category, rider_name, place, rider_id? }.
   Keď príde rider_id (pohľad results_public), rebríček a profil rozlíšia rovnako menovaných jazdcov. */
let REMOTE = { results: [], awards: [], brackets: [] };
const byPlace = (a, b) => a.place - b.place || a.name.localeCompare(b.name, 'sk');
/* Zloží výsledky z data.js a z databázy do EVENTS (databáza má prednosť pri tej istej kategórii eventu). */
function applyData() {
  for (const ev of EVENTS) Object.assign(ev, RK.mergeEvent(ev.id, BASE.get(ev.id), REMOTE, RIDER_PRIVACY));
}
/* Eventy z databázy (events_public): chýbajúce sa pridajú, pri známych databáza určí krajinu a otvorenú registráciu. */
function applyOfficial(rows) {
  const { added, updates } = RK.officialEvents(EVENTS, rows);
  for (const ev of added) { EVENTS.push(ev); BASE.set(ev.id, { status: ev.status, sticker: ev.sticker, results: {}, awards: [] }); }
  for (const ev of EVENTS) if (updates[ev.id]) Object.assign(ev, updates[ev.id]);
}
async function refreshRemote() {
  /* každý zdroj zvlášť: výpadok jedného (napr. pohľad ešte nie je v databáze) nezhodí ostatné */
  const got = await Promise.allSettled([store.listResults(), store.listAwards(), store.listBrackets(), store.listOfficialEvents()]);
  const [results, awards, brackets, official] = got.map((r, i) => (r.status === 'fulfilled' ? r.value : (console.error(r.reason), [REMOTE.results, REMOTE.awards, REMOTE.brackets, null][i])));
  REMOTE = { results, awards, brackets };
  if (official) applyOfficial(official);
  applyData();
}

/* ---------- výsledky, rebríček, jazdci (čisté funkcie sú v ranking.js) ---------- */
const RCFG = { points: POINTS, rules: SEASON_RULES, season: SITE.season, catName };
const allResults = () => RK.allResults(EVENTS);
const seasonYears = () => [...new Set(EVENTS.map(e => e.season))].sort((a, b) => b - a);
/* season = rok, null = všetky časy; opts.country = 'SK' | 'CZ' (prázdne = celkový rebríček) */
const standings = (cat, eventId, season = SITE.season, opts) => RK.standings(EVENTS, cat, eventId, season, RCFG, opts);
const nftLink = x => { const u = RK.explorerUrl(x.nft, CONFIG.NFT_CONTRACT_ADDRESS); return u ? h('a', { class: 'nft-link', href: u, target: '_blank', rel: 'noopener noreferrer' }, 'NFT') : null; };
const API = CONFIG.API_BASE || '';
const eventDate = id => EVENTS.find(e => e.id === id)?.date || '';
const riders = () => RK.riders(EVENTS, RCFG);
const seasonEvents = () => EVENTS.filter(e => e.status === 'done' && e.season === SITE.season && Object.values(e.results || {}).some(l => l.length));
const riderBadges = r => badgesFor(r, { seasonEvents: seasonEvents() });
const LSX = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const eventSticker = RK.eventSticker;
const riderStickers = r => RK.riderStickers(r, RCFG);

/* 3D doska: board.js a three.js sa stiahnu, až keď je plátno blízko obrazovky
   (na mobile je doska až dole, takže úvod sa načíta bez 1,3 MB). Vráti upratovaciu funkciu. */
let board3dP = null;
const board3d = () => (board3dP ||= import('./board.js').catch(err => { board3dP = null; throw err; }));
/* opts môže byť funkcia (B = modul board.js) -> opts, keď potrebuje vzhľady dosiek z board.js; onReady(api, B) po vykreslení */
function lazyBoard(canvas, opts, onReady) {
  let stop = null, dead = false;
  const fail = err => { console.error(err); const hint = canvas.parentElement?.querySelector('.hint'); if (hint) hint.textContent = 'Dosku sa nepodarilo načítať.'; return () => {}; };
  const io = new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) return;
    io.disconnect();
    stop = board3d().then(async B => {
      if (dead) return () => {};
      const api = await B.mountBoard(canvas, typeof opts === 'function' ? opts(B) : opts);
      if (dead) { api(); return () => {}; }
      if (onReady) onReady(api, B);
      return api;
    }).catch(fail);
  }, { rootMargin: '300px' });
  io.observe(canvas);
  return () => { dead = true; io.disconnect(); return stop && stop.then(f => f()); };
}

/* ---------- kalendár ---------- */
function downloadFile(text, type, name) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function downloadIcs({ title, date, end, place, url }) {
  const p = /^\d{4}-\d{2}-\d{2}$/.test(date || '') && parseDate(date); if (!p) return;
  const d1 = date.replaceAll('-', '');
  const e = parseDate(end) || p;
  const n = new Date(Date.UTC(e.y, e.m - 1, e.d + 1));
  const d2 = `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, '0')}${String(n.getUTCDate()).padStart(2, '0')}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const link = safeUrl(url);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GOSko//SK', 'BEGIN:VEVENT', `UID:${d1}-${slug(title)}@gosko`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d1}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${icsText(title)}`, place && `LOCATION:${icsText(place)}`, link && `URL:${link}`,
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  downloadFile(ics, 'text/calendar', `${slug(title) || 'gosko'}.ics`);
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
  const values = () => Object.fromEntries(fields.map(f => [f.name, f.type === 'custom' ? custom[f.name].value() : f.type === 'checkbox' ? form.elements[f.name].checked : form.elements[f.name].value.trim()]));
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
function loginDialog(after) {
  formDialog({
    title: 'Prihlásenie', submit: 'Poslať kód',
    intro: 'Pošleme ti e-mail s kódom, heslo netreba. Prihlásený ostaneš aj nabudúce.',
    fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email' }],
    onSubmit: async v => {
      await store.login(v.email);
      const code = h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, placeholder: '123456', class: 'code-input' });
      const msg = h('p', { class: 'form-msg', role: 'alert' });
      const wrap = h('div', {},
        h('p', {}, `Poslali sme e-mail na ${v.email}. Zadaj kód z e-mailu, alebo klikni na odkaz v ňom.`),
        h('label', { class: 'field' }, 'Kód z e-mailu', code), msg,
        h('button', { class: 'btn primary', type: 'button', onclick: async e => {
          const btn = e.currentTarget;   // po await je e.currentTarget už null
          msg.textContent = ''; btn.disabled = true;
          try { await store.verifyCode(v.email, code.value.trim()); }
          catch { msg.textContent = 'Kód nesedí alebo už vypršal. Skús ho zadať znova.'; btn.disabled = false; return; }
          wrap.replaceChildren(h('p', {}, 'Si prihlásený.'));
          if (typeof after === 'function') after();
        } }, 'Prihlásiť'));
      return wrap;
    },
  });
}
async function requireLogin(after) { if (await store.signedIn()) return true; loginDialog(after); return false; }

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
const ghostTag = () => h('img', { class: 'ghost-tag', src: 'img/ghost.svg', alt: '', width: 92, height: 104, 'aria-hidden': 'true' });
const pageHead = (title, lead, ...extra) => h('div', { class: 'wrap page-head' }, ghostTag(), h('h1', { class: 'wide' }, title), lead && h('p', { class: 'lead' }, lead), extra);
function bands() {
  return h('nav', { class: 'bands', 'aria-label': 'Eventy GOSko' }, EVENTS.filter(e => e.status === 'done' || e.status === 'next').map(ev =>
    h('a', { class: 'band' + (ev.status === 'next' ? ' next' : ''), href: '#/event/' + ev.id },
      h('span', { class: 'city wide' }, ev.city),
      h('span', { class: 'meta cond' }, ev.status === 'next' ? (ev.date ? `Ďalší stop, ${fmtDate(ev.date)}` : 'Ďalší stop, dátum čoskoro') : [ev.place, fmtDate(ev.date)].filter(Boolean).join(', ') || 'Odjazdené'),
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
/* Profil z data.js RIDERS (kľúč = meno bez diakritiky). Jazdec z databázy má slug = rider_id, preto aj podľa mena. */
const riderInfo = (s, name) => RIDERS[s] || (name ? RIDERS[slug(name)] : null) || {};
function avatarEl(name, s, { rank } = {}) {
  const info = riderInfo(s, name);
  const cls = 'avatar' + (rank && rank <= 3 ? ' r' + rank : '');
  if (info.photo) return h('span', { class: cls }, h('img', { src: info.photo, alt: '', loading: 'lazy', width: 120, height: 120 }));
  return h('span', { class: cls + ' gen', style: `--av:${AV_TONES[hashStr(s) % AV_TONES.length]}`, 'aria-hidden': 'true' }, h('span', {}, initials(name)));
}
/* vzhľad dosky jazdca: z data.js, inak sa odvodí z mena, aby každý mal inú. B = modul board.js (načíta sa lenivo). */
function riderLook(B, s, name) {
  const info = riderInfo(s, name);
  if (info.look) return { ...B.DEFAULT_LOOK, ...info.look };
  const n = hashStr(s), pick = (o, k) => Object.keys(o)[Math.floor(n / k) % Object.keys(o).length];
  return { deck: pick(B.DECKS, 1), grip: pick(B.GRIPS, 5), wheels: pick(B.WHEELS, 15), trucks: pick(B.TRUCKS, 45) };
}
const boardImgCache = new Map();
let boardQueue = Promise.resolve(), boardIO = null;
function boardImg(r, cls = '') {
  const img = h('img', { class: 'board-img ' + cls, alt: `Doska jazdcu ${r.name}`, width: 150, height: 210, decoding: 'async' });
  if (boardImgCache.has(r.slug)) { img.src = boardImgCache.get(r.slug); return img; }
  img.classList.add('loading');
  img._load = () => {
    boardQueue = boardQueue.then(async () => {
      if (!boardImgCache.has(r.slug)) {
        const B = await board3d();
        const c = await B.renderBoardImage(riderStickers(r), { width: 300, height: 420, tilt: -.3, turn: -.55, look: riderLook(B, r.slug, r.name) });
        boardImgCache.set(r.slug, c.toDataURL('image/png'));
      }
      img.src = boardImgCache.get(r.slug); img.classList.remove('loading');
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
  `Body: ${pointsTable(POINTS).map(r => `${r.label} ${r.points}`).join(', ')}. `,
  SEASON_RULES.countBest ? `Do rebríčka sa rátajú ${SEASON_RULES.countBest} najlepšie výsledky jazdca. ` : '',
  'Z prvých eventov poznáme len top 3, od ďalšieho zapisujeme celý pavúk. Best Trick je ocenenie, nie body. ',
  h('a', { href: '#/rebricek/pravidla' }, 'Rebríčkový poriadok'), '.');
function photoGrid(photos, limit) {
  const list = limit ? photos.slice(0, limit) : photos;
  return h('div', { class: 'gallery' }, list.map((p, i) => h('button', { type: 'button', class: 'ph', onclick: () => lightbox(photos, i), 'aria-label': 'Zväčšiť: ' + p.alt },
    h('img', { src: p.src, alt: p.alt, loading: 'lazy', width: 1400, height: 933 }),
    p.credit ? h('span', { class: 'credit' }, p.credit) : null,
    p.pending ? h('span', { class: 'tag pend' }, 'Čaká na schválenie') : null)));
}
const ytId = u => { const m = String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/); return m ? m[1] : null; };

/* ---------- partneri ---------- */
const partnerNode = p => (p.logo ? h('img', { class: 'p-logo', src: p.logo, alt: p.name, loading: 'lazy' }) : h('span', { class: 'p-name' }, p.name));
const partnerItem = (id, p) => h('li', {}, partnerNode(p), p.about ? h('a', { href: '#/partner/' + id }, 'O partnerovi') : null, igLink(p.instagram));
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
  const row = x => h('li', {}, h('span', { class: 'rank wide' }, x.place), h('a', { href: riderHref(x) }, x.name), h('span', { class: 'cond' }, `${pointsFor(x.place)} b.`, nftLink(x) && [' ', nftLink(x)]));
  const rest = list.slice(limit);
  return h('div', {}, h('ol', {}, list.slice(0, limit).map(row)),
    rest.length ? h('details', { class: 'more-results' }, h('summary', {}, `Ďalší jazdci (${rest.length})`), h('ol', {}, rest.map(row))) : null);
}

/* ---------- cesta do finále ---------- */
const finaleTable = (cat, season) => RK.finaleTable(EVENTS, cat, season, RCFG);
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
    if (ev.status === 'next') items.push(`Ďalší stop: ${ev.city}${ev.date ? ' ' + fmtDate(ev.date) : ', dátum čoskoro'}`);
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

function pageHome(root) {
  const MY_LOOK = 'gosko:board-look', MY_SCENE = 'gosko:board-scene';
  /* chýbajúce časti vzhľadu doplní board.js (DEFAULT_LOOK), ten sa načíta lenivo */
  let look = { deck: LSx.get(MY_DECK, 'cream'), ...LSx.get(MY_LOOK, {}) };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const next = nextEvent();

  /* ---------- 1. hero s videom ---------- */
  let media;
  if (SITE.heroVideo && !reduced) media = h('video', { class: 'vh-video', poster: SITE.heroPoster, autoplay: true, muted: true, loop: true, playsinline: true, preload: 'auto', 'aria-hidden': 'true' },
    h('source', { src: SITE.heroVideo.replace(/\.mp4$/, '.webm'), type: 'video/webm' }), h('source', { src: SITE.heroVideo, type: 'video/mp4' }));
  else {
    media = h('div', { class: 'vh-yt' }, h('img', { class: 'vh-poster', src: SITE.heroPoster, alt: '' }));
    if (SITE.vlog && !reduced) {
      const q = new URLSearchParams({ autoplay: '1', mute: '1', loop: '1', playlist: SITE.vlog, controls: '0', modestbranding: '1', playsinline: '1', rel: '0', iv_load_policy: '3', disablekb: '1', start: '15' });
      const fr = h('iframe', { class: 'vh-frame', src: `https://www.youtube-nocookie.com/embed/${SITE.vlog}?${q}`, title: 'Video z GOSko eventov', tabindex: '-1', 'aria-hidden': 'true', allow: 'autoplay; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin' });
      fr.addEventListener('load', () => setTimeout(() => media.classList.add('on'), 1200));
      media.append(fr);
    }
  }
  if (media.tagName === 'VIDEO') media.muted = true;
  const heroBoard = h('a', { class: 'vh-board', href: '#doska', 'aria-label': 'Prejsť na svoju 3D dosku', onclick: ev => { ev.preventDefault(); document.getElementById('doska')?.scrollIntoView({ behavior: 'smooth' }); } });
  /* doska v hero sa kreslí cez three.js: až keď je prehliadač voľný, a na mobile vôbec (tam je skrytá, .vh-board v style.css) */
  let dead = false;
  if (!matchMedia('(max-width: 720px)').matches) (window.requestIdleCallback || (f => setTimeout(f, 300)))(() => {
    if (dead) return;
    board3d().then(B => B.renderBoardImage([...(LSx.get(MY_STICKERS, []).includes('skate') ? [SKATE_STICKER] : []), ...EVENTS.map(eventSticker)], { width: 360, height: 520, tilt: -.25, turn: -.6, look }))
      .then(c => heroBoard.append(h('img', { src: c.toDataURL('image/png'), alt: '' }))).catch(err => console.error(err));
  });
  const heroIn = h('div', { class: 'wrap vh-in' },
    h('span', { class: 'mono vh-k' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), `Sezóna ${SITE.season} · Slovensko a Česko`),
    h('h1', { class: 'vh-logo' }, h('img', { class: 'vh-ghost', src: 'img/ghost.svg', alt: '', width: 120, height: 135 }), h('img', { class: 'vh-word', src: 'img/gosko-wordmark-plain.svg', alt: 'GOSko', width: 426, height: 178 })),
    h('p', { class: 'vh-tag letterg' }, 'Game of S.K.A.T.E. po Slovensku'),
    h('div', { class: 'vh-cta' },
      next?.registration ? h('button', { class: 'btn primary', type: 'button', onclick: () => registerDialog(next) }, 'Chcem jazdiť', h('span', { 'aria-hidden': 'true' }, '→')) : null,
      h('a', { class: 'btn solid', href: '#/eventy' }, 'Eventy'),
      h('a', { class: 'btn', href: '#/rebricek' }, 'Rebríček')),
    h('p', { class: 'mono vh-next' }, h('span', {}, 'Ďalší stop:'), ' ', h('b', {}, 'coming soon')));
  const links = [
    ['#/rebricek', 'Pozri si rebríček najlepších jazdcov'], ['#/eventy', 'Pozri, aké ďalšie eventy plánujeme'], ['#/jazdci', 'Spoznaj GOSko skejterov!'],
    ['#/spoty', 'Poznáš nejaký skate spot? Pridaj ho na mapu!'], ['#/parky', 'Vytvor si svoj vlastný skatepark :D'], ['#/shop', 'Chceš nás podporiť? Merch a e-shop'],
  ];
  const tickIn = h('div', { class: 'ticker-in' });
  const fillTicker = posts => {
    const items = [...posts.slice(0, 3).map(p => ['#/novinka/' + p.id, p.title, true]), ...links];
    const run = () => items.map(([href, t, isNew]) => h('a', { href, class: isNew ? 'new' : '' }, isNew ? h('b', {}, 'Novinka ') : null, t));
    tickIn.replaceChildren(...run(), ...run());
  };
  fillTicker([]);
  loadPosts().then(fillTicker);
  const hero = h('header', { class: 'vh' },
    h('div', { class: 'vh-media' }, media), h('div', { class: 'vh-shade', 'aria-hidden': 'true' }),
    heroIn, heroBoard,
    h('nav', { class: 'ticker vh-ticker', 'aria-label': 'Novinky a odkazy' }, tickIn));
  let raf = 0;
  const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => {
    raf = 0; const p = Math.min(1, scrollY / (innerHeight * .75));
    heroIn.style.opacity = String(1 - p); heroIn.style.transform = `translateY(${-p * 60}px) scale(${1 - p * .06})`;
    media.style.opacity = String(1 - p * .85); heroBoard.style.transform = `translateY(${p * 120}px) rotate(${-74 + p * 20}deg)`;
    hero.classList.toggle('gone', p >= 1);
  }); };
  if (!reduced) addEventListener('scroll', onScroll, { passive: true });

  /* ---------- kto sme (krátko, celé na #/o-nas) ---------- */
  const about = h('section', { class: 'hs about-teaser' }, h('div', { class: 'wrap at-grid' },
    h('div', {}, h('span', { class: 'mono hs-k' }, 'Kto sme'), h('h2', {}, 'Komunita, ktorá robí skate eventy')),
    h('div', {}, h('p', { class: 'lead' }, 'GOSko robí pop-up súťaže Game of S.K.A.T.E. po Slovensku a v Česku, vedie rebríček jazdcov a stavia vlastný digitálny svet pre skejterov.'),
      h('a', { class: 'btn small', href: '#/o-nas' }, 'Viac o nás', h('span', { 'aria-hidden': 'true' }, '→')))));

  /* ---------- 3. eventy ---------- */
  const goskoEvents = [...EVENTS].sort((a, b) => (a.status === 'next' ? -1 : 0) - (b.status === 'next' ? -1 : 0) || (b.date || '').localeCompare(a.date || ''));
  const calBox = h('ul', { class: 'cal-mini' }, h('li', { class: 'empty' }, 'Načítavam kalendár…'));
  store.listEvents().then(list => {
    const t = todayStr(), up = list.filter(e => !e.pending && (e.end_date || e.date) >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    calBox.replaceChildren(...(up.length ? up.map(e => { const p = parseDate(e.date); return h('li', {},
      h('span', { class: 'cm-d' }, h('b', {}, p.d), h('small', {}, MON[p.m - 1])), flag(e.country),
      h('span', { class: 'cm-t' }, h('b', {}, e.name), h('small', {}, [e.city, e.country, e.organizer ? 'org. ' + e.organizer : null].filter(Boolean).join(' · '))),
      safeUrl(e.link) ? h('a', { class: 'btn small', href: safeUrl(e.link), target: '_blank', rel: 'noopener noreferrer' }, 'Info') : null); }) : [h('li', { class: 'empty' }, 'Kalendár doplníme.')]));
  }).catch(() => calBox.replaceChildren(h('li', { class: 'empty' }, 'Kalendár sa nepodarilo načítať.')));
  const eventsSec = h('section', { class: 'hs events-sec', id: 'eventy' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('div', {}, h('span', { class: 'mono hs-k' }, 'Naše eventy'), h('h2', {}, 'GOSko Game of S.K.A.T.E.')), h('a', { class: 'btn small', href: '#/eventy' }, 'Všetky eventy', h('span', { 'aria-hidden': 'true' }, '→'))),
    h('div', { class: 'gk-grid' }, goskoEvents.map(goskoEventCard)),
    h('div', { class: 'ev-two' },
      h('div', { class: 'plan-mini' }, h('h3', { class: 'mono' }, 'Náš plán 2026/27'),
        h('ol', {}, PLAN.map(p => h('li', { class: (p.red ? 'red' : '') + (p.dark ? ' dark' : '') }, h('span', { class: 'mono' }, p.when), h('b', {}, p.title), h('small', {}, p.place))))),
      h('div', { class: 'cal-box' },
        h('div', { class: 'cal-head' }, h('h3', { class: 'mono' }, 'Skate kalendár'), h('a', { class: 'linkish', href: '#/eventy' }, 'Celý kalendár →')),
        h('p', { class: 'cal-note' }, 'Ďalšie skate eventy doma aj vo svete. Organizujú ich iní, my ich len zbierame na jednom mieste, aby ti nič neuteklo.'),
        calBox))));

  /* ---------- 4. rebríček a ľudia ---------- */
  const top = standings('open'), crew = riders();
  const rankSec = h('section', { class: 'hs rank-sec' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('div', {}, h('span', { class: 'mono hs-k' }, 'Rebríček'), h('h2', {}, `Najlepší jazdci ${SITE.season}`)), h('a', { class: 'btn small', href: '#/rebricek' }, 'Celý rebríček', h('span', { 'aria-hidden': 'true' }, '→'))),
    top.length ? podiumEl(top) : h('p', { class: 'empty' }, 'Výsledky doplníme.'),
    h('div', { class: 'crew' }, h('span', { class: 'mono' }, `GOSko skejteri (${crew.length})`),
      h('ul', {}, crew.map(r => h('li', {}, h('a', { href: '#/jazdec/' + r.slug, title: r.name }, avatarEl(r.name, r.slug), h('span', {}, r.name.split(' ')[0]))))),
      h('a', { class: 'linkish', href: '#/jazdci' }, 'Spoznaj všetkých →'))));

  /* ---------- 5. doska: scény, garáž, S.K.A.T.E. ---------- */
  const canvas = h('canvas', { 'aria-label': 'Tvoja 3D skateboard doska. Ťahaj na otočenie, dvojklik ju prevráti.' });
  const canvasSlot = h('div', { class: 'board-stage scene-stage3d' }, canvas);
  let api = null;
  const myStickers = () => (LSx.get(MY_STICKERS, []).includes('skate') ? [SKATE_STICKER] : []);
  const allStickers = () => [...myStickers(), ...EVENTS.map(eventSticker)];
  let sceneName = LSx.get(MY_SCENE, 'wall');
  const bsStage = h('div', { class: 'bs-stage' }, canvasSlot);
  const stopBoard = lazyBoard(canvas, B => {
    look = { ...B.DEFAULT_LOOK, ...look };
    const { sceneBar, garage } = boardControls(B);
    bsStage.prepend(sceneBar); bsStage.append(garage);
    return { stickers: allStickers(), onSticker: go, look, scene: sceneName };
  }, a => { api = a; a.setAuto(LSx.get('gosko:board-auto', true)); });
  function boardControls({ SCENES, DECKS, GRIPS, WHEELS, TRUCKS, TRICK_NAMES }) {
    const sceneBar = h('div', { class: 'scene-bar', role: 'group', 'aria-label': 'Scéna' }, Object.entries(SCENES).map(([k, n]) =>
      h('button', { type: 'button', class: 'scn', 'aria-pressed': String(k === sceneName), onclick: e => { sceneName = k; LSx.set(MY_SCENE, k); api?.setScene(k); sceneBar.querySelectorAll('.scn').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, n)));
    const OPTS = [
      ['deck', 'Doska', DECKS, d => d.base, d => d.pattern === 'ghosts' ? 'url(img/ghost.svg) center / 70% no-repeat' : `linear-gradient(90deg,${d.stripe} 0 18%,${d.base} 18% 82%,${d.stripe} 82%)`],
      ['grip', 'Grip', GRIPS, g => g.tint ? `rgb(${g.tint})` : '#1b1b1b', g => g.ghost ? 'url(img/ghost.svg) center / 55% no-repeat' : 'none'],
      ['wheels', 'Kolieska', WHEELS, w => '#' + w.color.toString(16).padStart(6, '0'), w => `radial-gradient(circle,#${w.core.toString(16).padStart(6, '0')} 0 26%,transparent 27%)`],
      ['trucks', 'Podvozky', TRUCKS, t => '#' + t.color.toString(16).padStart(6, '0'), () => 'none'],
    ];
    const tabsBar = h('div', { class: 'gar-tabs', role: 'tablist', 'aria-label': 'Úpravy dosky' });
    const panel = h('div', { class: 'gar-panel' });
    let tab = 'tricks';
    function renderPanel() {
      tabsBar.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
      if (tab === 'tricks') {
        panel.replaceChildren(
          ...Object.entries(TRICK_NAMES).map(([k, n]) => h('button', { type: 'button', class: 'btn small', onclick: () => api?.trick(k) }, n)),
          h('button', { type: 'button', class: 'btn small', onclick: () => api?.flip() }, 'Otočiť'),
          h('button', { type: 'button', class: 'btn small ghostbtn', onclick: () => api?.reset(), title: 'Späť do základnej polohy' }, '↺'),
          h('button', { type: 'button', class: 'btn small ghostbtn', onclick: () => api?.zoomBy(.85), 'aria-label': 'Priblížiť' }, '+'),
          h('button', { type: 'button', class: 'btn small ghostbtn', onclick: () => api?.zoomBy(1.18), 'aria-label': 'Oddialiť' }, '−'));
        return;
      }
      const [key, , table, bg, deco2] = OPTS.find(o => o[0] === tab);
      panel.replaceChildren(...Object.entries(table).map(([k, v]) =>
        h('button', { type: 'button', class: 'gar-sw', 'aria-pressed': String(look[key] === k), title: v.name,
          onclick: () => { look = { ...look, [key]: k }; LSx.set(MY_LOOK, look); api?.setLook(look); renderPanel(); } },
          h('span', { class: 'gar-chip', style: `background:${deco2(v)},${bg(v)}`, 'aria-hidden': 'true' }), h('span', {}, v.name))));
    }
    [['tricks', 'Triky'], ...OPTS.map(([k, l]) => [k, l])].forEach(([k, l]) => tabsBar.append(h('button', { type: 'button', role: 'tab', 'data-t': k, onclick: () => { tab = k; renderPanel(); } }, l)));
    renderPanel();
    const autoBtn = h('button', { type: 'button', class: 'gar-mini', 'aria-pressed': String(LSx.get('gosko:board-auto', true)), onclick: e => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); LSx.set('gosko:board-auto', on); api?.setAuto(on); } }, 'Samo sa otáča');
    const saveBtn = h('button', { type: 'button', class: 'gar-mini', onclick: async e => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const { canvasToFile } = await import('./card.js');
        const c = await api.snapshot(); const file = await canvasToFile(c, 'moja-gosko-doska.png');
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Moja GOSko doska' });
        else { const l = h('a', { href: c.toDataURL('image/png'), download: 'moja-gosko-doska.png' }); document.body.append(l); l.click(); l.remove(); }
      } catch (err) { if (err?.name !== 'AbortError') console.error(err); }
      b.disabled = false;
    } }, 'Uložiť obrázok');
    const garage = h('div', { class: 'garage' }, tabsBar, panel, h('div', { class: 'gar-foot' }, h('span', { class: 'mono' }, 'Ťahaj · dvojklik otočí · klik na nálepku otvorí event'), autoBtn, saveBtn));
    return { sceneBar, garage };
  }

  const LETTERS = ['S', 'K', 'A', 'T', 'E'];
  const won = () => LSx.get(MY_STICKERS, []).includes('skate');
  const msg = h('p', { class: 'sg-msg', role: 'status' });
  const reward = h('div', { class: 'sg-reward', title: 'Nálepka Game of S.K.A.T.E.' }, h('img', { src: 'img/ghost.svg', alt: '' }));
  const game = h('div', { class: 'skate-game' + (won() ? ' won' : '') });
  const btns = LETTERS.map(L => h('button', { type: 'button', class: 'sg-l', 'aria-pressed': 'false', 'aria-label': 'Písmeno ' + L, onclick: e => hitLetter(e.currentTarget) }, L));
  function say() {
    const n = btns.filter(b => b.classList.contains('out')).length;
    if (won() && !n) msg.replaceChildren(h('strong', {}, 'Nálepka je na tvojej doske. '), 'Zahraj si znova, alebo skús kickflip.');
    else if (!n) msg.replaceChildren('Nedáš trik, dostaneš písmeno. ', h('strong', {}, 'Klikni na všetkých päť'), ' a odomkneš nálepku na svoju dosku.');
    else if (n < 5) msg.replaceChildren(h('strong', {}, LETTERS.filter((_, i) => btns[i].classList.contains('out')).join('.') + '.'), ` Ešte ${5 - n} a nálepka je tvoja.`);
  }
  function hitLetter(b) {
    const on = !b.classList.contains('out');
    b.classList.toggle('out', on); b.setAttribute('aria-pressed', String(on));
    if (btns.every(x => x.classList.contains('out'))) unlock(); else say();
  }
  async function unlock() {
    const first = !won();
    if (first) LSx.set(MY_STICKERS, [...LSx.get(MY_STICKERS, []), 'skate']);
    game.classList.add('won');
    msg.replaceChildren(h('strong', {}, 'S.K.A.T.E.! '), first ? 'Vypadol si, ale nálepka letí na tvoju dosku.' : 'Nálepku už máš na doske.');
    if (first) {
      try {
        const B = await board3d();
        const sticker = B.stickerCanvas(SKATE_STICKER, await B.loadLogo()).toDataURL();
        const from = game.querySelector('.sg-letters').getBoundingClientRect(), to = canvasSlot.getBoundingClientRect();
        const fly = h('img', { class: 'flying-sticker', src: sticker, alt: '', style: `left:${from.left + from.width / 2 - 48}px;top:${from.top + from.height / 2 - 48}px` });
        document.body.append(fly);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          fly.style.transform = `translate(${to.left + to.width / 2 - from.left - from.width / 2}px,${to.top + to.height / 2 - from.top - from.height / 2}px) rotate(380deg) scale(.6)`;
          fly.style.opacity = '0';
        }));
        setTimeout(() => { fly.remove(); api?.setStickers(allStickers()); api?.trick('kickflip'); toast('Nálepka Game of S.K.A.T.E. je na tvojej doske.', sticker); }, 950);
      } catch (err) { console.error(err); api?.setStickers(allStickers()); }
    }
    setTimeout(() => { btns.forEach(x => { x.classList.remove('out'); x.setAttribute('aria-pressed', 'false'); }); say(); }, 2600);
  }
  game.append(h('div', { class: 'sg-label' }, h('b', {}, 'Game of'), h('span', { class: 'mono' }, 'zahraj si')),
    h('div', { class: 'sg-letters', role: 'group', 'aria-label': 'Písmená S.K.A.T.E.' }, btns), h('div', { class: 'sg-bar' }, reward, msg));
  say();
  const boardSec = h('section', { class: 'hs board-sec2', id: 'doska' }, h('div', { class: 'wrap bs-grid' },
    h('div', { class: 'bs-copy' },
      h('span', { class: 'mono hs-k' }, 'Tvoja 3D doska'),
      h('h2', {}, 'Postav si dosku a skús trik'),
      h('p', { class: 'lead' }, 'Každý GOSko event nechá na doske nálepku. Vyber si scénu, uprav dosku a zahraj si S.K.A.T.E.: za päť písmen dostaneš nálepku navyše.'),
      game),
    bsStage));

  /* ---------- 6. novinky ---------- */
  const newsGrid = h('div', { class: 'post-grid three' });
  loadPosts().then(posts => newsGrid.replaceChildren(...(posts.length ? posts.slice(0, 3).map(p => postCard(p)) : [h('p', { class: 'empty' }, 'Zatiaľ žiadne novinky.')])));
  const newsSec = h('section', { class: 'hs news-sec' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('div', {}, h('span', { class: 'mono hs-k' }, 'Novinky'), h('h2', {}, 'Čo je nové')), h('a', { class: 'btn small', href: '#/novinky' }, 'Všetky novinky', h('span', { 'aria-hidden': 'true' }, '→'))),
    newsGrid));

  /* ---------- 7. TV ---------- */
  const last = EVENTS.filter(e => e.status === 'done' && e.photos?.length).at(-1);
  const tv = last && tvScene({ videoId: last.video?.youtubeId, title: `${last.name}: video`, photos: last.photos, stamp: `${last.city} ${last.season}`, onPhoto: lightbox });
  const lastMeta = last ? [last.place, fmtDate(last.date)].filter(Boolean).join(', ') : '';
  const tvSec = tv && h('section', { class: 'sec tv-sec' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('h2', { class: 'letterg tv-title' }, 'GOSko TV'), h('a', { class: 'btn small', href: '#/event/' + last.id }, 'Výsledky a fotky', h('span', { 'aria-hidden': 'true' }, '→'))),
    h('p', { class: 'lead' }, `${last.name}${lastMeta ? ': ' + lastMeta : ''}. Ovládaš ju tlačidlami pod obrazovkou alebo ťuknutím na obrazovku.`),
    tv));

  /* ---------- 8. park, mapa, partneri ---------- */
  const moreSec = h('section', { class: 'hs more-sec' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('div', {}, h('span', { class: 'mono hs-k' }, 'Ďalej na webe'), h('h2', {}, 'Postav, pridaj, zavolaj'))),
    h('nav', { class: 'quick wide4', 'aria-label': 'Ďalšie časti webu' },
      quickTile('#/parky', 'Postav si park', 'Najlepšie parky podľa hlasov idú do top 10'),
      quickTile('#/spoty', 'Mapa spotov', 'Skateparky a spoty, pridaj aj svoj'),
      quickTile('#/shop', 'Merch a e-shop', 'Podpor GOSko'),
      quickTile('#/partneri/zavolaj', 'Zavolaj si GOSko', 'Pop-up v tvojom meste'))));
  const ps = partnersStrip();
  const news = h('section', { class: 'sec light news' }, h('div', { class: 'wrap' },
    h('h2', { class: 'letterg news-title' }, 'Nezmeškaj ďalšie GOSko'),
    h('p', { class: 'lead' }, 'Keď vyhlásime dátum a miesto, pošleme ti jeden e-mail. Žiadny spam.'),
    newsletterInline('home'),
    h('div', { class: 'news-ghosts', 'aria-hidden': 'true' }, h('img', { src: 'img/ghost.svg', alt: '' }), h('img', { src: 'img/ghost.svg', alt: '' }), h('img', { src: 'img/ghost.svg', alt: '' }))));

  const after = h('div', { class: 'after-hero' }, boardSec, eventsSec, rankSec, newsSec, tvSec, moreSec, about, ps, news);
  root.append(hero, after);
  return () => { dead = true; removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); return stopBoard(); };
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

const COUNTRY_CHIPS = [['', 'Celkový'], ['SK', 'Slovensko'], ['CZ', 'Česko']];
function pageStandings(root, focus) {
  /* season = rok alebo 'all' (všetky časy); scope = 'season' alebo id eventu; country = '' (celkový), 'SK', 'CZ' */
  let season = SITE.season, scope = 'season', cat = 'open', country = '';
  const years = seasonYears();
  const body = h('div');
  const chips = (label, items, current, set) => h('div', { class: 'chips', role: 'group', 'aria-label': label }, items.map(([v, text]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === current), onclick: () => { set(v); render(); } }, text)));
  const all = riders(), doneEv = EVENTS.filter(e => e.status === 'done' && e.season === SITE.season);
  const placings = allResults().filter(r => r.ev.season === SITE.season).length;
  const stat = (n, t) => h('li', {}, h('b', {}, String(n)), h('span', {}, t));
  const stats = h('ul', { class: 'rk-stats' },
    stat(all.length, plural(all.length, 'jazdec', 'jazdci', 'jazdcov')),
    stat(doneEv.length, plural(doneEv.length, 'odjazdený event', 'odjazdené eventy', 'odjazdených eventov')),
    stat(placings, 'umiestnení v rebríčku'),
    stat(CATEGORIES.length, plural(CATEGORIES.length, 'kategória', 'kategórie', 'kategórií')),
    all[0] ? stat(all[0].points, `bodov má líder ${all[0].name}`) : null);
  function render() {
    const all = season === 'all';
    const doneEvents = all ? [] : EVENTS.filter(e => e.status === 'done' && e.season === season);
    if (scope !== 'season' && !doneEvents.some(e => e.id === scope)) scope = 'season';
    const ev = EVENTS.find(e => e.id === scope);
    const rows = standings(cat, scope === 'season' ? null : scope, all ? null : season, { country }), em = scope !== 'season';
    body.replaceChildren(); put(body,
      h('div', { class: 'controls' },
        chips('Sezóna', [...years.map(y => [y, String(y)]), ['all', 'Všetky časy']], season, v => { season = v; scope = 'season'; }),
        all ? null : chips('Event', [['season', `Sezóna ${season}`], ...doneEvents.map(e => [e.id, e.city + (e.date ? ` ${parseDate(e.date).d}. ${parseDate(e.date).m}.` : '')])], scope, v => { scope = v; }),
        chips('Kategória', CATEGORIES.map(c => [c.id, c.name]), cat, v => { cat = v; }),
        chips('Krajina', COUNTRY_CHIPS, country, v => { country = v; })),
      ev && ev.awards?.length ? h('p', { class: 'note' }, ev.awards.map(a => [`${a.name}: `, h('a', { href: awardHref(a) }, a.rider), '. '])) : null,
      rows.length ? [podiumEl(rows), standingsList(rows, { eventMode: em, from: 3 })] : standingsList(rows),
      scope === 'season' && !all && !country ? finaleEl(cat, season) : null);
  }
  const pts = h('div', { class: 'rk-points' }, h('h3', { class: 'mono' }, 'Bodovanie'),
    h('ul', {}, [[1, '1.'], [2, '2.'], [3, '3. – 4.'], [5, '5. – 8.'], [9, '9. – 16.'], [99, 'účasť']].map(([p, l]) => h('li', {}, h('span', {}, l), h('b', {}, `${pointsFor(p)}`)))),
    h('p', { class: 'note' }, SEASON_RULES.countBest ? `Do rebríčka sa rátajú ${SEASON_RULES.countBest} najlepšie výsledky jazdca. ` : '', 'Body sú len za Game of S.K.A.T.E. Best Trick je ocenenie.'),
    h('p', {}, h('a', { class: 'btn small', href: '#/rebricek/pravidla' }, 'Rebríčkový poriadok')));

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
  root.append(pageHead('Rebríček a jazdci', 'Body, výsledky a profily všetkých jazdcov GOSka.'),
    h('div', { class: 'wrap page-body' },
      stats,
      h('section', { class: 'rk-sec' }, h('div', { class: 'sec-head' }, h('h2', {}, 'GOSko Ranking'), h('span', { class: 'mono lead' }, 'Sezóna alebo všetky časy, event, kategória a krajina')), h('div', { class: 'rk-grid' }, body, pts)),
      h('section', { class: 'rk-sec', id: 'sien-slavy' }, h('div', { class: 'sec-head' }, h('h2', {}, 'Sieň slávy'), h('span', { class: 'mono lead' }, 'Víťazi eventov a ocenenia')), hallEl()),
      ridersSec));
  render(); renderRiders();
  if (focus) requestAnimationFrame(() => document.getElementById(focus)?.scrollIntoView());
}
function riderRow(r) {
  const badges = riderBadges(r), st = riderStickers(r);
  const rankIn = r.cats.map(c => { const s2 = standings(c); const i = s2.findIndex(x => x.slug === r.slug); return i >= 0 ? `${i + 1}. ${catName(c)}` : null; }).filter(Boolean);
  const info = riderInfo(r.slug, r.name);
  const body = h('div', { class: 'rd-body' });
  const det = h('details', { class: 'rd' },
    h('summary', {},
      avatarEl(r.name, r.slug),
      h('span', { class: 'rd-main' }, h('b', {}, r.name), h('span', { class: 'mono' }, [r.cats.map(catName).join(', ') || 'Ocenenie', info.city].filter(Boolean).join(' · '))),
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
          h('li', {}, h('b', {}, String(st.length)), h('span', {}, plural(st.length, 'nálepka', 'nálepky', 'nálepiek'))),
          rankIn.length ? h('li', {}, h('b', {}, rankIn[0].split('.')[0] + '.'), h('span', {}, 'v rebríčku ' + rankIn[0].split('. ')[1])) : null),
        h('h4', { class: 'mono' }, 'Výsledky'),
        h('ul', { class: 'rd-res' }, r.results.map(x => h('li', {}, h('span', { class: 'rd-place' }, `${x.place}.`), h('a', { href: '#/event/' + x.ev.id }, x.ev.name), h('span', { class: 'mono' }, `${catName(x.cat)} · ${pointsFor(x.place)} b.`))),
          r.awards.map(a => h('li', {}, h('span', { class: 'rd-place' }, '★'), h('a', { href: '#/event/' + a.ev.id }, a.ev.name), h('span', { class: 'mono' }, a.name)))),
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

async function pageEvents(root) {
  let when = 'upcoming';
  const list = h('div', { class: 'event-list' });
  const ours = EVENTS.map(e => ({ ...e, ours: true, country: 'Slovensko', title: e.name, end_date: e.endDate || null, prize: e.prize || null, kind: 'Game of Skate' }));
  let community = [];
  const load = async () => { try { community = (await store.listEvents()).map(e => ({ ...e, title: e.name, ours: false })); } catch (err) { console.error(err); } };
  await load();
  const today = todayStr();
  const lastDay = e => e.end_date && e.end_date > e.date ? e.end_date : e.date;

  function dateBlock(e) {
    const p = parseDate(e.date); if (!p) return h('div', { class: 'ev-date' }, h('span', { class: 'm cond' }, 'čoskoro'));
    const q = parseDate(lastDay(e));
    const d = q.d !== p.d || q.m !== p.m ? (q.m === p.m ? `${p.d}–${q.d}` : `${p.d}. ${p.m}.–${q.d}. ${q.m}.`) : String(p.d);
    return h('div', { class: 'ev-date' + (d.length > 5 ? ' long' : d.includes('–') ? ' range' : '') }, h('span', { class: 'd wide' }, d), h('span', { class: 'm cond' }, MON[p.m - 1] + (q.m !== p.m ? '–' + MON[q.m - 1] : '')));
  }
  function when_(e) {
    if (!e.date) return null;
    if (e.date <= today && lastDay(e) >= today) return h('span', { class: 'evb live' }, 'Práve prebieha');
    if (e.date > today) { const n = dayDiff(today, e.date); return n <= 60 ? h('span', { class: 'evb soon' }, n === 1 ? 'zajtra' : `o ${n} ${plural(n, 'deň', 'dni', 'dní')}`) : null; }
    return null;
  }
  /* krycia grafika pre eventy bez fotky: rozmazaná textúra zo skateparku + mesto veľkým písmom (nie je to fotka z eventu) */
  const TEX = ['img/ba-trick-1.webp', 'img/ba-trick-3.webp', 'img/ba-trick-5.webp', 'img/ba-boards.webp'];
  const cover = e => safeUrl(e.image_url)
    ? h('span', { class: 'ec-img' }, h('img', { src: safeUrl(e.image_url), alt: '', loading: 'lazy' }))
    : h('span', { class: 'ec-img gen', style: `--tex:url(${TEX[hashStr(e.name) % TEX.length]})` }, h('span', { class: 'ec-city' + ((e.city || '').length > 9 ? ' long' : '') }, e.city || ''));
  const daysOf = e => e.date ? dayDiff(e.date, lastDay(e)) + 1 : 0;
  const icsBtn = e => e.date && lastDay(e) >= today ? h('button', { class: 'btn small', type: 'button', onclick: () => downloadIcs({ title: e.title, date: e.date, end: lastDay(e), place: [e.place, e.city].filter(Boolean).join(', '), url: e.link }) }, 'Do kalendára') : null;
  const badges = e => h('div', { class: 'ev-badges' },
    e.kind && h('span', { class: 'evb' }, e.kind),
    daysOf(e) > 1 && h('span', { class: 'evb' }, `${daysOf(e)} ${plural(daysOf(e), 'deň', 'dni', 'dní')}`),
    e.prize && h('span', { class: 'evb prize', title: 'Prize pool' }, '🏆 ', e.prize),
    when_(e), e.pending && h('span', { class: 'evb' }, 'Čaká na schválenie'));
  const dateText = e => { const p = parseDate(e.date); if (!p) return 'Dátum čoskoro'; const q = parseDate(lastDay(e)); return q.d !== p.d || q.m !== p.m ? `${p.d}. ${p.m}. – ${q.d}. ${q.m}. ${q.y}` : `${p.d}. ${p.m}. ${p.y}`; };

  function localCard(e) {
    return h('li', { class: 'ec' + (e.date && e.date <= today && lastDay(e) >= today ? ' live' : '') },
      cover(e),
      h('span', { class: 'ec-date' }, dateBlock(e)),
      h('div', { class: 'ec-body' },
        h('div', { class: 'ev-title' }, flag(e.country), h('b', { class: 'ec-name' }, e.title)),
        h('span', { class: 'ev-meta' }, [[e.place, e.city].filter(Boolean).join(', '), e.organizer ? `organizuje ${e.organizer}` : null].filter(Boolean).join(' · ')),
        badges(e),
        h('div', { class: 'actions' }, safeUrl(e.link) && h('a', { class: 'btn small', href: safeUrl(e.link), target: '_blank', rel: 'noopener noreferrer' }, 'Viac info'), icsBtn(e))));
  }
  function abroadRow(e) {
    return h('li', { class: 'ab-row' + (e.date && e.date <= today && lastDay(e) >= today ? ' live' : '') },
      h('span', { class: 'ab-flag' }, flag(e.country)),
      h('span', { class: 'ab-main' }, h('span', { class: 'ab-city' }, e.city), h('span', { class: 'ab-name' }, e.title), h('span', { class: 'mono ab-meta' }, [dateText(e), e.country, e.place].filter(Boolean).join(' · '))),
      h('span', { class: 'ab-side' }, badges(e), h('span', { class: 'actions' }, safeUrl(e.link) && h('a', { class: 'btn small', href: safeUrl(e.link), target: '_blank', rel: 'noopener noreferrer' }, 'Viac'), icsBtn(e))));
  }
  function render() {
    const isUp = e => (e.date ? lastDay(e) >= today : true);
    const sortUp = (a, b) => (a.date || '9').localeCompare(b.date || '9'), sortDown = (a, b) => (b.date || '').localeCompare(a.date || '');
    const pick = arr => arr.filter(e => when === 'upcoming' ? isUp(e) : !isUp(e)).sort(when === 'upcoming' ? sortUp : sortDown);
    const local = pick(community.filter(e => e.country === 'Slovensko' || e.country === 'Česko'));
    const abroad = pick(community.filter(e => e.country !== 'Slovensko' && e.country !== 'Česko'));
    const gosko = [...ours].sort((a, b) => (a.status === 'next' ? -1 : 0) - (b.status === 'next' ? -1 : 0) || sortDown(a, b));
    list.replaceChildren(
      h('section', { class: 'ev-sec gk' },
        h('div', { class: 'sec-head' }, h('h2', {}, 'GOSko eventy'), h('span', { class: 'mono lead' }, 'Naša séria Game of S.K.A.T.E.')),
        h('div', { class: 'gk-grid' }, gosko.map(goskoEventCard))),
      h('div', { class: 'ev-divider' }, h('span', { class: 'mono hs-k' }, 'Skate kalendár'), h('h2', {}, 'Ďalšie eventy doma a vo svete'),
        h('p', { class: 'lead' }, 'Tieto eventy neorganizujeme. Robia ich iné crew, skateshopy a federácie a my ich zbierame na jednom mieste, aby ti nič neuteklo.')),
      h('div', { class: 'controls ev-when' }, chipGroup('Čas', [['upcoming', 'Nadchádzajúce'], ['past', 'Odjazdené']], () => when, v => { when = v; })),
      h('section', { class: 'ev-sec' },
        h('div', { class: 'sec-head' }, h('h2', {}, 'Slovensko a Česko'), h('span', { class: 'mono lead' }, `${local.length} ${plural(local.length, 'event', 'eventy', 'eventov')}`)),
        local.length ? h('ul', { class: 'ec-grid' }, local.map(localCard)) : h('p', { class: 'empty' }, 'Zatiaľ nič. Poznáš event? Pridaj ho.')),
      h('section', { class: 'ev-sec' },
        h('div', { class: 'sec-head' }, h('h2', {}, 'Zahraničie'), h('span', { class: 'mono lead' }, `${abroad.length} ${plural(abroad.length, 'event', 'eventy', 'eventov')}`)),
        abroad.length ? h('ul', { class: 'ab-list' }, abroad.map(abroadRow)) : h('p', { class: 'empty' }, 'Zatiaľ nič.')));
  }
  const chipGroup = (label, items, get, set) => {
    const g = h('div', { class: 'chips', role: 'group', 'aria-label': label }, items.map(([v, t]) =>
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === get()), onclick: ev => { set(v); g.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === ev.currentTarget))); render(); } }, t)));
    return g;
  };
  root.append(pageHead('Eventy', 'Hore naše GOSko zastávky. Pod nimi skate kalendár: eventy iných organizátorov na Slovensku, v Česku aj vo svete. Poznáš event, ktorý tu chýba? Pridaj ho.',
    h('button', { class: 'btn primary', type: 'button', onclick: addEventDialog }, 'Pridať event')),
    h('div', { class: 'wrap page-body' }, list));
  render();

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

/* Registrácia na event v2 (assets/register.js, POST /api/register). Volá sa z countdownEl, pageEvent a #/registracia/:eventId.
   Pass vzniká LEN z odpovede servera; pri chybe API formulár ukáže hlášku a žiadny pass sa neuloží.
   Vek (U16) sa ráta z dátumu narodenia k dátumu eventu, polia rodiča sa ukážu samé. */
const TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
function captchaField() {
  let token = '', id = null;
  const el = h('div', { class: 'captcha' }, h('span', { class: 'empty' }, 'Načítavam overenie…'));
  loadScript(TURNSTILE_JS).then(() => {
    el.replaceChildren();
    id = window.turnstile.render(el, { sitekey: CONFIG.TURNSTILE_SITE_KEY, language: 'sk', callback: t => { token = t; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; } });
  }).catch(() => el.replaceChildren(h('p', { class: 'form-msg' }, 'Overenie sa nenačítalo. Obnov stránku.')));
  return { el, value: () => token, reset: () => { token = ''; if (id != null) window.turnstile?.reset(id); }, destroy: () => { if (id != null) window.turnstile?.remove(id); } };
}
const linkTo = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
function registerDialog(ev) {
  const minor = v => isMinor(v.birth_date, ev.date, todayIn());
  let captcha = null;
  formDialog({
    title: 'Chcem jazdiť', submit: 'Zaregistrovať sa',
    intro: `${ev.name}${ev.date ? ', ' + fmtDate(ev.date) : ''}. Po registrácii dostaneš QR pass na vstup.`,
    fields: [
      { name: 'legal_name', label: 'Meno a priezvisko', required: true, max: 60, autocomplete: 'name' },
      { name: 'birth_date', label: 'Dátum narodenia', type: 'date', required: true, hint: 'Podľa veku v deň eventu ťa zaradíme do kategórie. Pod 16 rokov treba súhlas rodiča.' },
      { name: 'email', label: 'E-mail', type: 'email', required: true, max: 254, autocomplete: 'email', hint: 'Pošleme naň potvrdenie a pass.' },
      { name: 'country', label: 'Krajina', type: 'select', options: COUNTRIES },
      { name: 'city', label: 'Mesto', max: 60, placeholder: 'nepovinné' },
      { name: 'instagram', label: 'Instagram', max: 31, placeholder: '@tvojmeno, nepovinné' },
      { name: 'public_name_mode', label: 'Ako sa má tvoje meno zobraziť vo výsledkoch', type: 'select', options: NAME_MODES },
      { name: 'nickname', label: 'Prezývka', max: 30, placeholder: 'nepovinné', hint: 'Povinná, ak chceš byť vo výsledkoch pod prezývkou.' },
      { name: 'women', label: 'Chcem jazdiť v Babskej kategórii (jazdkyne od 16 rokov).', type: 'checkbox', showIf: v => !minor(v) },
      { name: 'guardian_name', label: 'Meno rodiča alebo zákonného zástupcu', max: 60, showIf: minor, requiredIfShown: true },
      { name: 'guardian_email', label: 'E-mail rodiča', type: 'email', max: 254, showIf: minor, requiredIfShown: true, hint: 'Jazdec do 16 rokov: rodičovi pošleme odkaz na potvrdenie súhlasu. Registrácia platí až po ňom.' },
      { name: 'rules', label: ['Súhlasím s ', linkTo('#/pravidla', 'pravidlami súťaže'), ' a ', linkTo('#/rebricek/pravidla', 'rebríčkovým poriadkom'), '.'], type: 'checkbox', required: true },
      { name: 'privacy', label: ['Beriem na vedomie ', linkTo('#/sukromie', 'zásady ochrany osobných údajov'), ' a súhlasím so spracúvaním údajov na registráciu a zverejnenie výsledkov.'], type: 'checkbox', required: true },
      { name: 'photo', label: 'Súhlasím so zverejnením fotiek a videí z eventu, na ktorých som (nepovinné).', type: 'checkbox' },
      { name: 'nft', label: 'Chcem záznam o účasti a výsledku aj ako neprenosné NFT na blockchaine Base. Neobsahuje žiadne osobné údaje (nepovinné).', type: 'checkbox' },
      { name: 'newsletter', label: 'Pošlite mi e-mail aj o ďalších GOSko eventoch.', type: 'checkbox' },
      CONFIG.TURNSTILE_SITE_KEY ? { name: 'captcha', label: 'Overenie', type: 'custom', render: () => (captcha = captchaField()), validate: () => (captcha.value() ? '' : 'Potvrď, že nie si robot.') } : null,
    ].filter(Boolean),
    onSubmit: async v => {
      const check = validateRegistration(v, { eventDate: ev.date, today: todayIn(), captchaRequired: !!CONFIG.TURNSTILE_SITE_KEY });
      if (!check.ok) throw new UserError(Object.values(check.errors)[0]);
      /* polia rodiča a babská kategória sa posielajú len tam, kde platia */
      const data = check.minor ? { ...v, women: false } : { ...v, guardian_name: '', guardian_email: '' };
      let r;
      try {
        r = await completeRegistration({ fetch: browserFetch, apiBase: API, ev, payload: buildPayload(data, ev.id, v.captcha),
          save: p => LSX.set('gosko:passes', upsertPass(LSX.get('gosko:passes', []), p)) });
      } catch (err) {
        captcha?.reset();   // token Turnstile je jednorazový
        const detail = err.data?.errors && Object.values(err.data.errors)[0];
        throw detail ? new UserError(`${err.message} ${detail}`) : err;
      }
      if (v.newsletter) store.subscribe(v.email.trim().toLowerCase(), 'registracia').catch(() => {});
      updateMenu();
      if (r.status === 'check_email') return h('div', { class: 'pass-done' },
        h('p', {}, 'Registráciu sme prijali. Pass ti pošleme e-mailom na adresu, ktorú si zadal. Pozri aj spam.'));
      return h('div', { class: 'pass-done' },
        h('p', {}, r.status === 'pending_guardian'
          ? 'Registrácia čaká na súhlas rodiča. Poslali sme mu e-mail s odkazom na potvrdenie. Pass platí až po potvrdení, ukáž ho crew pri príchode.'
          : 'Si zaregistrovaný. Toto je tvoj vstupný QR kód. Na evente ho ukážeš crew pri príchode.'),
        passCard(r.pass),
        h('p', { class: 'note dark' }, 'Pass nájdeš v menu pod „Môj pass“ a poslali sme ti ho aj e-mailom. Pre istotu si sprav screenshot.'));
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

async function pageEvent(root, id) {
  const ev = EVENTS.find(e => e.id === id);
  if (!ev) return pageNotFound(root);
  const meta = [ev.place, fmtDate(ev.date)].filter(Boolean).join(', ') || (ev.status === 'next' ? 'Dátum a miesto čoskoro' : '');
  root.append(h('header', { class: 'ev-hero' }, h('div', { class: 'wrap' },
    deco('round', 'd-evhero'),
    h('a', { class: 'back', href: '#/eventy' }, 'Všetky eventy'),
    h('h1', { class: 'wide' }, ev.name), meta && h('p', { class: 'cond ev-hero-meta' }, meta))));
  const body = h('div', { class: 'wrap page-body' }, h('p', { class: 'lead' }, ev.about));
  if (ev.status === 'next') put(body, h('div', { class: 'actions' },
    ev.registration && h('button', { class: 'btn primary', type: 'button', onclick: () => registerDialog(ev) }, 'Chcem jazdiť'),
    ev.date && h('button', { class: 'btn', type: 'button', onclick: () => downloadIcs({ title: ev.name, date: ev.date, place: ev.place }) }, 'Do kalendára'),
    h('button', { class: 'btn', type: 'button', onclick: () => newsletterDialog('event') }, 'Daj mi vedieť e-mailom'),
    h('a', { class: 'btn', href: `https://www.instagram.com/${SITE.instagram}/`, target: '_blank', rel: 'noopener' }, 'Sleduj Instagram')));
  const cats = CATEGORIES.filter(c => ev.results?.[c.id]?.length);
  if (ev.status === 'done') {
    put(body, h('h2', { class: 'wide sub' }, 'Výsledky'));
    if (!cats.length) put(body, h('p', { class: 'empty' }, 'Výsledky doplníme.'));
    else put(body, h('div', { class: 'podiums' }, cats.map(c => h('div', { class: 'podium' },
      h('h3', {}, c.name, c.note && h('span', { class: 'cond' }, ` ${c.note}`)), placeList(ev.results[c.id])))));
    if (ev.awards?.length) put(body, h('p', { class: 'note' }, ev.awards.map(a => [`${a.name}: `, h('a', { href: awardHref(a) }, a.rider), '. '])));
  }
  const withBracket = CATEGORIES.filter(c => ev.brackets?.[c.id]);
  if (withBracket.length) put(body, h('h2', { class: 'wide sub' }, 'Pavúk'),
    withBracket.map((c, i) => h('details', { class: 'br-details', open: i === 0 }, h('summary', {}, c.name + (c.note ? ` (${c.note})` : '')),
      h('div', { class: 'br-scroll' }, bracketEl(ev.brackets[c.id], { name: displayName })))));
  if (ev.video?.youtubeId) put(body, h('h2', { class: 'wide sub' }, 'Video'),
    tvScene({ videoId: ev.video.youtubeId, title: `${ev.name}: video`, photos: ev.photos || [], stamp: `${ev.city} ${ev.season}`, polaroids: false, onPhoto: lightbox }));
  if (ev.photos?.length) put(body, h('h2', { class: 'wide sub' }, 'Fotky'), photoGrid(ev.photos), SITE.photoCredit ? h('p', { class: 'note' }, `Foto: ${SITE.photoCredit}`) : null);

  if (ev.status === 'done') {
    const sec = h('div', { class: 'community' });
    put(body, h('h2', { class: 'wide sub' }, 'Fotky a klipy od komunity'), sec);
    const load = async () => {
      let items = []; try { items = await store.listEventPhotos(ev.id); } catch (err) { console.error(err); }
      const photos = items.filter(x => x.photo_url).map(x => ({ src: x.photo_url, alt: x.caption || `Fotka od ${x.author}`, credit: x.author, pending: x.pending }));
      const clips = items.filter(x => x.clip_url).map(clipEl).filter(Boolean);
      sec.replaceChildren(...[
        photos.length ? photoGrid(photos) : null,
        clips.length ? h('ul', { class: 'clip-list' }, clips) : null,
        !items.length ? h('p', { class: 'empty' }, 'Zatiaľ tu nič nie je. Máš vlastnú fotku alebo klip z eventu? Pošli ho.') : null,
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => requireLogin(() => photoDialog(ev, load)).then(ok => ok && photoDialog(ev, load)) }, 'Pošli svoju fotku alebo klip')),
        h('p', { class: 'note' }, 'Si na fotke a nechceš tam byť? ', h('button', { class: 'linklike', type: 'button', onclick: () => privacyDialog({ target: ev.name }) }, 'Napíš nám'), ' a odstránime ju.'),
      ].filter(Boolean));
    };
    await load();
  }
  if (ev.partners?.length) put(body, h('h2', { class: 'wide sub' }, 'Partneri'),
    h('ul', { class: 'partner-list' }, ev.partners.filter(k => PARTNERS[k]).map(k => partnerItem(k, PARTNERS[k]))));
  root.append(body);
}

function pageRiders(root) { return pageStandings(root, 'jazdci'); }

function pageRider(root, s) {
  const r = riders().find(x => x.slug === s);
  if (!r) return pageNotFound(root);
  const canvas = h('canvas', { 'aria-label': `Doska jazdca ${r.name} s nálepkami` });
  const rankIn = r.cats.map(c => { const st = standings(c); const i = st.findIndex(x => x.slug === r.slug); return i >= 0 ? `${i + 1}. v rebríčku ${catName(c)}` : null; }).filter(Boolean);
  root.append(h('header', { class: 'hero rider-hero' }, h('div', { class: 'wrap hero-grid' },
    h('div', {},
      h('a', { class: 'back', href: '#/jazdci' }, 'Všetci jazdci'),
      h('div', { class: 'rider-id' }, avatarEl(r.name, r.slug), h('h1', { class: 'wide' }, r.name)),
      h('p', { class: 'cond big-meta' }, Object.keys(r.pointsByCat).length > 1
        ? `Sezóna ${SITE.season}: ` + Object.entries(r.pointsByCat).map(([c, p]) => `${catName(c)} ${p} b.`).join(', ')
        : `${r.points} bodov v sezóne ${SITE.season}`),
      rankIn.length ? h('p', {}, rankIn.join(', ') + '.') : null,
      h('h2', { class: 'sub' }, 'Výsledky'),
      h('ul', { class: 'r-results' },
        r.results.map(x => h('li', {}, h('a', { href: '#/event/' + x.ev.id }, x.ev.name), ` ${x.place}. miesto, ${catName(x.cat)}, ${pointsFor(x.place)} b.`, nftLink(x) && [' ', nftLink(x)])),
        r.awards.map(a => h('li', {}, h('a', { href: '#/event/' + a.ev.id }, a.ev.name), ` ${a.name}`))),
      h('h2', { class: 'sub' }, 'Odznaky'),
      h('ul', { class: 'badges' }, riderBadges(r).map(b => h('li', { class: 'badge' }, h('span', { class: 'b-ico', html: badgeSvg(b, 22) }),
        h('span', {}, h('strong', {}, b.name), h('small', {}, b.detail ? `${b.text}: ${b.detail}` : b.text))))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => shareCardDialog(r, rankIn) }, 'Zdieľať kartu jazdca')),
      h('p', { class: 'note' }, 'Si to ty? Napíš nám na Instagram a doplníme tvoj profil. ',
        h('button', { class: 'linklike', type: 'button', onclick: () => privacyDialog({ target: r.name }) }, r.cats.includes('u16') ? 'Súkromie a odstránenie údajov (U16)' : 'Súkromie a odstránenie údajov'))),
    h('div', { class: 'board-stage' }, canvas, deco('land', 'd-stage-tl'), h('p', { class: 'hint cond' }, 'Ťukni na nálepku a otvorí sa event')))));
  return lazyBoard(canvas, B => ({ stickers: riderStickers(r), onSticker: go, look: riderLook(B, r.slug, r.name) }));
}

async function pageParks(root) {
  const tools = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Prekážky' });
  const section = h('section', { class: 'builder light' }, h('div', { class: 'wrap rel' },
    deco('oval', 'd-head'),
    h('h1', { class: 'wide red' }, 'Postav si skatepark'),
    h('p', { class: 'lead' }, 'Vyber prekážku a ťukni na plochu, alebo ju myšou rovno potiahni. Položené prekážky chytíš a presunieš. Keď je park hotový, pošli ho. Najlepšie parky podľa hlasov budú v top 10.'),
    h('div', { class: 'viewing', hidden: true }, h('p', { class: 'viewing-text' }), h('button', { class: 'btn viewing-exit', type: 'button' }, 'Späť na môj park')),
    h('div', { class: 'builder-stage' }, h('canvas', { class: 'park-canvas', 'aria-label': 'Stavebná plocha skateparku' }),
      h('div', { class: 'stage-tools' },
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'zoom-in', 'aria-label': 'Priblížiť', title: 'Priblížiť (+)' }, '+'),
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'zoom-out', 'aria-label': 'Oddialiť', title: 'Oddialiť (−)' }, '−'),
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'reset-view', title: 'Celá plocha (F)' }, 'Celá plocha'),
        h('button', { class: 'btn solid stage-btn', type: 'button', 'data-act': 'view', title: 'Otočiť pohľad (Q / E)' }, 'Otočiť pohľad'))),
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

  let builder, P = null;
  try { P = await import('./park.js'); builder = P.mountBuilder(section); }
  catch (err) { console.error(err); $('.status', section).textContent = P ? 'Tvoj prehliadač nevie zobraziť 3D. Skús iný prehliadač.' : 'Stavebnicu sa nepodarilo načítať. Skontroluj pripojenie a obnov stránku.'; }

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
        const res = await store.submitPark({ ...v, layout: P.slimLayout(lay), thumb: P.renderThumb(lay) });
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
    if (store.mode === 'offline') { note.textContent = store.message; return; }
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
      let src = p.thumb; if (!src && P) { try { src = P.renderThumb(P.cleanLayout(p.layout), p.id); } catch { src = ''; } }
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
  if (sub === 'mediakit') return pageMediaKit(root);
  const form = h('div', { class: 'book', id: 'zavolaj' });
  const num = (n, t) => h('li', { class: 'pf-item' }, h('span', { class: 'pf-n' }, n), h('span', { class: 'pf-t' }, t));
  root.append(
    h('header', { class: 'pt-hero' },
      h('div', { class: 'pt-bg', 'aria-hidden': 'true' }, h('img', { src: 'img/ba-trick-1.webp', alt: '' })),
      h('div', { class: 'wrap pt-in' },
        h('span', { class: 'mono pt-k' }, 'Pre partnerov · sezóna 2026/27'),
        h('h1', { class: 'pt-h' }, 'Séria skate súťaží na Slovensku a v Česku'),
        h('p', { class: 'lead' }, 'GOSko je nový organizátor skate eventov. Komunitná značka, ktorá robí pop-up súťaže Game of S.K.A.T.E., rebríček jazdcov a vlastný digitálny svet.'),
        h('p', {}, 'Organizačne za projektom stojí Slovenská Federácia Skateboardingu, občianske združenie, ktoré práve zakladáme.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#zavolaj', onclick: e => { e.preventDefault(); form.scrollIntoView({ behavior: 'smooth' }); } }, 'Chcem spolupracovať'), h('a', { class: 'btn', href: '#/partneri/mediakit' }, 'Media kit (PDF)')))),

    h('section', { class: 'sec' }, h('div', { class: 'wrap pt-three' },
      [['01', 'Eventy', 'Pop-up súťaže po mestách na Slovensku a v Česku.'], ['02', 'Rebríček a web', 'Body, výsledky a profil každého jazdca.'], ['03', 'Komunita', 'Mapa spotov, parky a klipy.']].map(([n, t, d]) =>
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
      h('p', { class: 'lead' }, 'Tri krajské mestá, prvý stop v Česku a finále. Mestá vyberáme spolu s partnermi.'),
      h('ol', { class: 'pt-plan' }, PLAN.map(p => h('li', { class: (p.dark ? 'dark' : '') + (p.red ? ' red' : '') }, h('span', { class: 'mono' }, p.when), h('b', {}, p.title), h('span', {}, p.place), p.note ? h('small', {}, p.note) : null))),
      h('div', { class: 'pt-three small' },
        [['Expanzia do Česka', 'Prvý zahraničný stop a rebríček pre SK aj CZ.'], ['Komunitné eventy', 'GOSko pop-upy na festivaloch a jamoch, ako Shred Fest Žilina.'], ['Naše ďalšie projekty', 'GOSko sa objaví aj tam. A partner spolu s ním.']].map(([t, d]) => h('div', { class: 'pt-card' }, h('h3', {}, t), h('p', {}, d)))))),

    h('section', { class: 'sec pt-secret' }, h('div', { class: 'wrap' },
      h('span', { class: 'mono pt-k' }, 'Plánované projekty 2027'),
      h('h2', {}, 'Pripravujeme appku. Bude úplne sick.'),
      h('p', { class: 'lead' }, 'Viac zatiaľ neprezradíme. Partneri sa o nej dozvedia ako prví.'),
      h('div', { class: 'pt-lock', 'aria-hidden': 'true' }, h('img', { src: 'img/ghost.svg', alt: '' }), h('span', { class: 'mono' }, 'Top secret')))),

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
      { name: 'title', label: 'Nadpis', required: true, max: 120, value: post?.title, placeholder: 'napr. GOSko #3 bude 21. novembra' },
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
      { name: 'author', label: 'Kto píše', max: 60, value: post?.author || 'GOSko crew' },
      { name: 'pinned', label: 'Pripnúť navrch', type: 'checkbox', value: post?.pinned },
      { name: 'published', label: 'Zverejnené (odškrtni a novinka bude skrytá)', type: 'checkbox', value: post ? post.published !== false : true },
    ],
    onSubmit: async v => {
      if (v.link && !/^(https?:\/\/|#\/)/i.test(v.link)) throw new UserError('Odkaz musí začínať https:// alebo #/');
      await store.savePost({ id: post?.id, title: v.title, summary: v.summary || null, body: v.body || null, link: v.link || null, link_label: v.link_label || null,
        author: v.author || null, pinned: !!v.pinned, published: !!v.published, image_url: post?.image_url || null }, v.photo);
      POSTS = null; done && done();
      return post ? 'Uložené.' : 'Novinka je na webe.';
    },
  });
}
function postCard(p, { big } = {}) {
  return h('a', { class: 'post-card' + (big ? ' big' : ''), href: '#/novinka/' + p.id },
    p.image_url ? h('span', { class: 'pc-img' }, h('img', { src: p.image_url, alt: '', loading: 'lazy' })) : h('span', { class: 'pc-img empty', 'aria-hidden': 'true' }, h('img', { src: 'img/ghost.svg', alt: '' })),
    h('span', { class: 'pc-body' },
      h('span', { class: 'mono pc-date' }, fmtDateTime(p.created_at), p.pinned ? ' · dôležité' : ''),
      h('span', { class: 'pc-title' }, p.title),
      p.summary ? h('span', { class: 'pc-sum' }, p.summary) : null));
}
async function pageNews(root) {
  const list = h('div', { class: 'post-grid' }, h('p', { class: 'empty' }, 'Načítavam…'));
  root.append(pageHead('Novinky', 'Čo sa deje v GOSku: eventy, výsledky, nové veci na webe.'), h('div', { class: 'wrap page-body' }, list));
  POSTS = null;
  const posts = await loadPosts();
  list.replaceChildren(...(posts.length ? posts.map((p, i) => postCard(p, { big: i === 0 })) : [h('p', { class: 'empty' }, 'Zatiaľ žiadne novinky.')]));
}
async function pagePost(root, id) {
  const p = await store.getPost(id).catch(() => null);
  if (!p) return pageNotFound(root);
  const link = p.link ? (p.link.startsWith('#/') ? h('a', { class: 'btn primary', href: p.link }, p.link_label || 'Viac', h('span', { 'aria-hidden': 'true' }, '→')) : safeUrl(p.link) && h('a', { class: 'btn primary', href: p.link, target: '_blank', rel: 'noopener' }, p.link_label || 'Otvoriť odkaz')) : null;
  root.append(h('article', { class: 'post' },
    p.image_url ? h('div', { class: 'post-hero' }, h('img', { src: p.image_url, alt: '' })) : null,
    h('div', { class: 'wrap post-in' },
      h('a', { class: 'back', href: '#/novinky' }, '← Všetky novinky'),
      h('p', { class: 'mono post-meta' }, [fmtDateTime(p.created_at), p.author].filter(Boolean).join(' · ')),
      h('h1', { class: 'post-title' }, p.title),
      p.summary ? h('p', { class: 'post-lead' }, p.summary) : null,
      h('div', { class: 'post-body' }, paras(p.body)),
      link ? h('div', { class: 'actions' }, link) : null)));
}

async function pageAdmin(root) {
  root.append(pageHead('Admin', store.mode === 'demo' ? 'Ukážkový režim: vidíš len to, čo sa uložilo v tomto prehliadači.' : 'Schvaľovanie a doručené formuláre.'));
  const body = h('div', { class: 'wrap page-body' }); root.append(body);
  if (!(await adminGate(body, 'Tento účet nemá prístup do adminu.'))) return;
  const section = (t, ...kids) => h('section', { class: 'admin-sec' }, h('h2', { class: 'wide sub' }, t), kids);
  const [parks, events, spots, photos] = await Promise.all([store.pendingParks().catch(() => []), store.pendingEvents().catch(() => []), store.pendingSpots().catch(() => []), store.pendingEventPhotos().catch(() => [])]);
  put(body, h('div', { class: 'actions' },
    h('button', { class: 'btn primary', type: 'button', onclick: () => postDialog(null, renderPosts) }, '+ Pridať novinku'),
    h('a', { class: 'btn primary', href: '#/admin/vysledky' }, 'Zapisovať výsledky'),
    h('a', { class: 'btn primary', href: '#/admin/scan' }, 'Check-in (skener)')));
  /* registrácie v2 na najbližšie eventy (mená z riders, len pre admina) s check-inom cez API */
  for (const ev of registrationEvents()) {
    const regs = await store.eventRegistrations(ev.id).then(r => r, err => { console.error(err); return null; });
    const box = h('div', { class: 'scan-result' });
    const row = r => h('tr', {}, h('td', {}, r.name), h('td', {}, catName(r.category)), h('td', {}, PASS_STATUS[r.status] || r.status),
      h('td', {}, r.status === 'checked_in' ? '' : h('button', { class: 'btn small', type: 'button', onclick: async e => { const b = e.currentTarget; b.disabled = true; if (await doCheckin({ registration_id: r.id }, box)) b.replaceWith('zapísaný'); else b.disabled = false; } }, 'Check-in')));
    put(body, h('section', { class: 'admin-sec' }, h('h2', { class: 'wide sub' }, `Registrácie: ${ev.name}${ev.date ? ', ' + fmtDate(ev.date) : ''}`),
      regs === null ? h('p', { class: 'form-msg' }, 'Registrácie sa nepodarilo načítať.')
        : regs.length ? [h('p', { class: 'note' }, `Na evente zapísaných: ${regs.filter(r => r.status === 'checked_in').length} z ${regs.length}.`),
          h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Jazdec', 'Kategória', 'Stav', ''].map(k => h('th', {}, k)))), h('tbody', {}, regs.map(row)))), box]
          : h('p', { class: 'empty' }, 'Zatiaľ nikto.')));
  }
  /* li a tlačidlá sa berú pred await: po ňom je e.currentTarget už null */
  const moderate = (fn, ask) => async e => {
    const li = e.currentTarget.closest('li'), btns = [...li.querySelectorAll('button')];
    if (ask && !confirm(ask)) return;
    li.querySelector('.form-msg')?.remove(); btns.forEach(b => { b.disabled = true; });
    try { await fn(); li.remove(); }
    catch (err) { console.error(err); btns.forEach(b => { b.disabled = false; }); li.append(h('span', { class: 'form-msg', role: 'alert' }, 'Nepodarilo sa uložiť. Skús znova.')); }
  };
  const postsBox = h('div');
  async function renderPosts() {
    const list = await store.allPosts().catch(() => []);
    postsBox.replaceChildren(list.length ? h('ul', { class: 'admin-list' }, list.map(p => h('li', {},
      p.image_url && h('img', { class: 'thumb', src: p.image_url, alt: '' }),
      h('span', {}, h('b', {}, p.title), ` · ${fmtDateTime(p.created_at)}`, p.pinned ? ' · pripnuté' : '', p.published === false ? ' · skryté' : ''),
      h('a', { href: '#/novinka/' + p.id }, 'pozrieť'),
      h('button', { class: 'btn small', type: 'button', onclick: () => postDialog(p, renderPosts) }, 'Upraviť'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!confirm(`Zmazať novinku „${p.title}“?`)) return; await store.deletePost(p.id); renderPosts(); } }, 'Zmazať')))) : h('p', { class: 'empty' }, 'Zatiaľ žiadne novinky.'));
  }
  put(body, section('Novinky a články', h('p', { class: 'note' }, 'Novinka sa hneď zobrazí na webe v časti Novinky a v páse noviniek na úvodke. Pripnutá je vždy prvá.'), postsBox));
  renderPosts();
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
    h('button', { class: 'btn small', type: 'button', onclick: moderate(() => store.approve(kind, id)) }, 'Schváliť'),
    h('button', { class: 'btn small', type: 'button', onclick: moderate(() => store.reject(kind, id), 'Naozaj zamietnuť a zmazať?') }, 'Zamietnuť')];
  const none = () => h('p', { class: 'empty' }, 'Nič nečaká.');
  put(body, section('Fotky a klipy na schválenie', photos.length ? h('ul', { class: 'admin-list' }, photos.map(x => h('li', {},
    x.photo_url && h('img', { class: 'thumb', src: x.photo_url, alt: '' }), h('span', {}, `${x.author}${x.caption ? ': ' + x.caption : ''}`),
    safeUrl(x.clip_url) && h('a', { href: safeUrl(x.clip_url), target: '_blank', rel: 'noopener noreferrer' }, 'klip'), modBtns('photos', x.id)))) : none()));
  put(body, section('Spoty na schválenie', spots.length ? h('ul', { class: 'admin-list' }, spots.map(s => h('li', {},
    s.photo_url && h('img', { class: 'thumb', src: s.photo_url, alt: '' }), h('span', {}, `${s.name}, ${s.city}`), h('a', { href: navLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, 'na mape'), modBtns('spots', s.id)))) : none()));
  put(body, section('Parky na schválenie', parks.length ? h('ul', { class: 'admin-list' }, parks.map(p => h('li', {},
    p.thumb && h('img', { class: 'thumb', src: p.thumb, alt: '' }), h('span', {}, `${p.name}, od ${p.author}, ${p.location}`), modBtns('parks', p.id)))) : none()));
  put(body, section('Eventy na schválenie', events.length ? h('ul', { class: 'admin-list' }, events.map(e => h('li', {},
    h('span', {}, `${e.name}, ${fmtDate(e.date)}, ${e.city}, ${e.country}`), safeUrl(e.link) && h('a', { href: safeUrl(e.link), target: '_blank', rel: 'noopener noreferrer' }, 'odkaz'), modBtns('events', e.id)))) : none()));
  for (const [table, label] of Object.entries(INBOX)) {
    const rows = await store.inbox(table).catch(() => []);
    const keys = rows.length ? Object.keys(rows[0]).filter(k => !['id', 'created'].includes(k)) : [];
    const extra = table === 'registrations_legacy' && rows.length ? h('p', { class: 'note' }, `Na evente zapísaných: ${rows.filter(r => r.checked_in_at).length} z ${rows.length}.`) : null;
    const csv = () => downloadFile(csvRows(keys, rows), 'text/csv;charset=utf-8', `${table}.csv`);   // csvRows escapuje vzorce (= + - @)
    put(body, section(`${label} (${rows.length})`, rows.length ? [extra,
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, keys.map(k => h('th', {}, k)))), h('tbody', {}, rows.map(r => h('tr', {}, keys.map(k => h('td', {}, String(r[k] ?? '')))))))),
      h('button', { class: 'btn small', type: 'button', onclick: csv }, 'Stiahnuť CSV')] : h('p', { class: 'empty' }, 'Zatiaľ nič.')));
  }
}

function pageNotFound(root) {
  root.append(pageHead('Tu nič nie je', 'Stránka neexistuje alebo sa presunula.'), h('div', { class: 'wrap page-body' }, h('a', { class: 'btn', href: '#/' }, 'Na úvod')));
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
    { name: 'consent', label: 'Súhlasím so zasielaním správ o GOSko eventoch. Odhlásiť sa dá kedykoľvek.', type: 'checkbox', required: true },
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
    h('div', { class: 'news-row' }, email, h('button', { class: 'btn primary', type: 'submit' }, 'Chcem vedieť')),
    h('label', { class: 'check' }, consent, h('span', {}, 'Súhlasím so zasielaním správ o GOSko eventoch. Odhlásiť sa dá kedykoľvek.')), msg);
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
    const { riderCard, canvasToFile } = await import('./card.js');
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
async function pageMap(root) {
  const mapEl = h('div', { class: 'map' });
  const list = h('ul', { class: 'spot-list' }), parksList = h('ul', { class: 'park-list' });
  root.append(pageHead('Mapa spotov', 'Známe skateparky na Slovensku a street spoty od komunity. Poznáš dobrý spot? Pošli ho aj s fotkou.',
    h('button', { class: 'btn primary', type: 'button', onclick: () => requireLogin(() => spotDialog(load)).then(ok => ok && spotDialog(load)) }, 'Pridať spot'),
    h('a', { class: 'btn', href: '#/mapa' }, 'Herná mapa')),
    h('div', { class: 'wrap page-body' }, mapEl,
      h('p', { class: 'map-legend mono' }, h('span', { class: 'lg lg-park' }), 'Skatepark', h('span', { class: 'lg lg-spot' }), 'Spot od komunity', h('span', { class: 'lg lg-event' }), 'GOSko event'),
      h('h2', { class: 'wide sub' }, 'Skateparky'), parksList, h('h2', { class: 'wide sub' }, 'Spoty od komunity'), list));
  let stopMap = null;
  async function load() {
    let spots = [];
    try { spots = await store.listSpots(); } catch (err) { console.error(err); }
    const visible = spots.filter(s => !s.pending || store.mode === 'demo');
    const evPoints = EVENTS.filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng)).map(e => ({ lat: e.lat, lng: e.lng, kind: 'event', title: e.name,
      popup: h('div', { class: 'pop' }, h('strong', {}, e.name), h('span', {}, [e.place, fmtDate(e.date)].filter(Boolean).join(', ')), h('a', { href: '#/event/' + e.id }, 'Detail eventu')) }));
    const parkLink = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + p.city)}`;
    const parkPoints = SKATEPARKS.map(p => ({ lat: p.lat, lng: p.lng, kind: 'park', title: p.name,
      popup: h('div', { class: 'pop' }, h('strong', {}, p.name), h('span', {}, [p.area, p.city].filter(Boolean).join(', ')), h('span', {}, p.about), h('a', { href: parkLink(p), target: '_blank', rel: 'noopener' }, 'Navigovať')) }));
    parksList.replaceChildren(...SKATEPARKS.map(p => h('li', { class: 'park-card' },
      h('span', { class: 'pk-tag mono' + (p.tag === 'GOSko' ? ' hot' : '') }, p.tag),
      h('b', {}, p.name), h('span', { class: 'pk-city' }, [p.area, p.city].filter(Boolean).join(', ')), h('p', {}, p.about),
      h('a', { class: 'btn small', href: parkLink(p), target: '_blank', rel: 'noopener' }, 'Navigovať'))));
    const spotPoints = visible.filter(s => !s.pending).map(s => ({ lat: s.lat, lng: s.lng, kind: 'spot', title: s.name,
      popup: h('div', { class: 'pop' }, s.photo_url && h('img', { src: s.photo_url, alt: '' }), h('strong', {}, s.name), h('span', {}, [s.kind, s.city].filter(Boolean).join(', ')),
        h('a', { href: navLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, 'Navigovať')) }));
    if (stopMap) stopMap();
    stopMap = await mountMap(mapEl, [...parkPoints, ...evPoints, ...spotPoints]).catch(err => { console.error(err); mapEl.replaceChildren(h('p', { class: 'empty' }, 'Mapu sa nepodarilo načítať.')); return null; });
    list.replaceChildren(...(visible.length ? visible.map(s => h('li', { class: 'spot' },
      s.photo_url ? h('img', { src: s.photo_url, alt: `Spot ${s.name}`, loading: 'lazy' }) : h('div', { class: 'spot-nophoto', 'aria-hidden': 'true' }),
      h('div', {}, h('p', { class: 'spot-name' }, s.name), h('p', { class: 'spot-meta' }, [s.kind, s.city].filter(Boolean).join(', ')),
        s.description && h('p', { class: 'spot-desc' }, s.description), s.pending && h('span', { class: 'tag' }, 'Čaká na schválenie'),
        h('a', { class: 'btn small', href: navLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, 'Navigovať')))) : [h('li', { class: 'empty' }, 'Zatiaľ tu nie je žiadny spot. Pošli prvý.')]));
  }
  await load();
  return () => stopMap && stopMap();
}

/* ---------- pass a check-in ---------- */
function passCard(p) {
  const holder = h('div', { class: 'qr' }, h('span', { class: 'empty' }, 'Načítavam QR…'));
  const url = `${location.origin}${location.pathname}#/checkin/${p.token}`;
  qrCanvas(url, 520).then(c => { c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'QR kód vstupenky'); holder.replaceChildren(c); })
    .catch(() => holder.replaceChildren(h('p', {}, 'QR sa nepodarilo načítať. Kód vstupenky: ', h('code', {}, p.token.slice(0, 8)))));
  return h('div', { class: 'pass' },
    h('div', { class: 'pass-head' }, h('span', { class: 'wide' }, p.event), h('span', { class: 'cond' }, [catName(p.category), p.date ? fmtDate(p.date) : 'dátum čoskoro'].join(', '))),
    holder, h('p', { class: 'pass-name wide' }, p.name), h('p', { class: 'pass-code cond' }, 'Kód: ' + p.token.slice(0, 8).toUpperCase()),
    PASS_STATUS[p.status] ? h('p', { class: 'pass-status' + (p.status === 'pending_guardian' || p.status === 'cancelled' ? ' warn' : '') }, PASS_STATUS[p.status]) : null);
}
const PASS_STATUS = { pending_guardian: 'Čaká na potvrdenie rodiča', confirmed: 'Potvrdená registrácia', checked_in: 'Zapísaný na evente', no_show: 'Neprišiel', cancelled: 'Registrácia je zrušená' };
const registrationEvents = () => EVENTS.filter(e => e.status === 'next');
function passResendDialog() {
  const evs = registrationEvents();
  formDialog({
    title: 'Poslať pass znova', submit: 'Poslať',
    intro: 'Ak sme tvoju registráciu našli, pošleme pass na e-mail, ktorý si zadal pri registrácii.',
    fields: [
      { name: 'email', label: 'E-mail z registrácie', type: 'email', required: true, autocomplete: 'email' },
      evs.length > 1 ? { name: 'event_id', label: 'Event', type: 'select', options: evs.map(e => ({ value: e.id, label: `${e.name}${e.date ? ', ' + fmtDate(e.date) : ''}` })) } : null,
    ].filter(Boolean),
    onSubmit: async v => {
      if (!isEmail(v.email)) throw new UserError('Skontroluj e-mail.');
      await apiRequest(browserFetch, `${API}/api/pass`, { method: 'POST', body: { email: v.email.toLowerCase(), event_id: v.event_id || evs[0]?.id || '' } });
      return 'Ak registrácia s týmto e-mailom existuje, pass je na ceste. Pozri aj spam.';
    },
  });
}
function pagePasses(root) {
  const passes = LSX.get('gosko:passes', []);
  root.append(pageHead('Môj pass', 'Vstupné QR kódy na eventy, na ktoré si sa zaregistroval v tomto telefóne.'),
    h('div', { class: 'wrap page-body' }, passes.length ? h('div', { class: 'passes' }, passes.map(passCard))
      : h('p', { class: 'empty' }, 'Zatiaľ tu nič nie je. Zaregistruj sa na ', h('a', { href: '#/eventy' }, 'najbližší event'), '.'),
      registrationEvents().length ? h('p', { class: 'note' }, 'Registroval si sa v inom telefóne? ', h('button', { class: 'linklike', type: 'button', onclick: passResendDialog }, 'Pošleme ti pass znova e-mailom'), '.') : null));
}
/* #/pass/<token>: odkaz z e-mailu. Pass sa načíta zo servera a uloží do tohto telefónu (cache). */
async function pagePass(root, token) {
  root.append(pageHead('Môj pass', null));
  const body = h('div', { class: 'wrap page-body' }, h('p', {}, 'Načítavam pass…')); root.append(body);
  try {
    const p = await fetchPass(browserFetch, token, { apiBase: API, eventDate });
    LSX.set('gosko:passes', upsertPass(LSX.get('gosko:passes', []), p)); updateMenu();
    body.replaceChildren(h('div', { class: 'passes' }, passCard(p)), h('p', { class: 'note' }, 'Pass je uložený v tomto telefóne v menu pod „Môj pass“.'));
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    body.replaceChildren(h('p', { class: 'form-msg', role: 'alert' }, err instanceof UserError ? err.message : 'Pass sa nepodarilo načítať.'),
      h('p', {}, h('a', { class: 'btn', href: '#/pass' }, 'Moje passy')));
  }
}

/* ---------- registrácia: stránky z odkazov ---------- */
function pageRegister(root, id) {
  const ev = EVENTS.find(e => e.id === id);
  if (!ev) return pageNotFound(root);
  root.append(pageHead('Registrácia', `${ev.name}${ev.date ? ', ' + fmtDate(ev.date) : ''}${ev.place ? ', ' + ev.place : ''}`));
  const open = ev.status === 'next' && ev.registration;
  root.append(h('div', { class: 'wrap page-body' },
    open ? h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => registerDialog(ev) }, 'Chcem jazdiť'))
      : h('p', { class: 'empty' }, 'Registrácia na tento event nie je otvorená.'),
    h('p', { class: 'note' }, 'Pred registráciou si prečítaj ', h('a', { href: '#/pravidla' }, 'pravidlá'), ' a ', h('a', { href: '#/sukromie' }, 'zásady ochrany osobných údajov'), '.'),
    h('p', {}, h('a', { class: 'btn', href: '#/event/' + ev.id }, 'Detail eventu'))));
  if (open) registerDialog(ev);
}
function pageRegisterDone(root) {
  root.append(pageHead('Súhlas potvrdený', 'Ďakujeme. Registrácia jazdca je potvrdená a pass platí.'),
    h('div', { class: 'wrap page-body' }, h('p', {}, 'Jazdcovi sme poslali e-mail s passom. Uvidíme sa na evente.'), h('a', { class: 'btn', href: '#/eventy' }, 'Eventy')));
}
function pageRegisterBadLink(root) {
  root.append(pageHead('Odkaz neplatí', 'Odkaz na potvrdenie už bol použitý alebo je neplatný.'),
    h('div', { class: 'wrap page-body' }, h('p', {}, 'Ak si súhlas už potvrdil, netreba robiť nič. Inak nám napíš na Instagram ', igLink(SITE.instagram), '.')));
}
function updateMenu() {
  const has = LSX.get('gosko:passes', []).length > 0;
  document.querySelectorAll('[data-pass-link]').forEach(a => { a.hidden = !has; });
  const rules = RULES.length > 0 || FAQ.length > 0;
  document.querySelectorAll('[data-rules-link]').forEach(a => { a.hidden = !rules; });
}
const NFT_STATUS = { no_consent: 'NFT: jazdec nesúhlasil', guardian_pending: 'NFT: čaká na súhlas rodiča', pending: 'NFT: vydáva sa', minted: 'NFT: vydané',
  result_pending: 'NFT: vydané', result_set: 'NFT: vydané', failed: 'NFT: zatiaľ sa nepodarilo, server to skúsi znova' };
/* Check-in cez POST /api/admin/checkin (Supabase JWT admina). body = {token} | {registration_id} | {event_id, rider_name}. */
async function doCheckin(body, box) {
  try {
    const r = await store.adminCheckin(body), g = r.registration;
    box.replaceChildren(h('div', { class: 'ci ci-good' }, h('p', { class: 'wide' }, 'Zapísané'), h('p', { class: 'ci-name wide' }, g.public_name), h('p', {}, catName(g.category)),
      g.guardian_ok ? null : h('p', { class: 'ci-warn' }, 'POZOR: rodič ešte nepotvrdil súhlas'),
      NFT_STATUS[r.nft?.status] ? h('p', { class: 'cond' }, NFT_STATUS[r.nft.status]) : null));
    return true;
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    if (err.code === 'ambiguous' && err.data?.candidates?.length) {
      box.replaceChildren(h('p', { class: 'form-msg', role: 'alert' }, err.message), h('ul', { class: 'admin-list' }, err.data.candidates.map(c => h('li', {},
        h('span', {}, `${c.public_name}, ${catName(c.category)}, ${PASS_STATUS[c.status] || c.status}`),
        h('button', { class: 'btn small', type: 'button', onclick: () => doCheckin({ registration_id: c.id }, box) }, 'Zapísať tohto')))));
      return false;
    }
    box.append(h('p', { class: 'form-msg', role: 'alert' }, err instanceof UserError ? err.message : 'Nepodarilo sa zapísať. Skús znova.'));
    return false;
  }
}
async function checkinView(token, box) {
  box.replaceChildren(h('p', {}, 'Hľadám registráciu…'));
  let p;
  try { p = await fetchPass(browserFetch, token, { apiBase: API, eventDate }); }
  catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    box.replaceChildren(h('div', { class: 'ci ci-bad' }, h('p', { class: 'wide' }, err.status === 404 ? 'Neplatný kód' : 'Chyba'), h('p', {}, err.status === 404 ? 'Takú registráciu nemáme.' : err.message)));
    return;
  }
  const info = [h('p', { class: 'ci-name wide' }, p.name), h('p', {}, catName(p.category)), h('p', { class: 'cond' }, p.event)];
  if (p.status === 'pending_guardian') info.push(h('p', { class: 'ci-warn' }, 'POZOR: rodič ešte nepotvrdil súhlas'));
  if (p.status === 'checked_in') { box.replaceChildren(h('div', { class: 'ci ci-warn-box' }, h('p', { class: 'wide' }, 'Už zapísaný'), info)); return; }
  if (p.status === 'cancelled') { box.replaceChildren(h('div', { class: 'ci ci-bad' }, h('p', { class: 'wide' }, 'Zrušená registrácia'), info)); return; }
  const confirm = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    confirm.disabled = true;
    if (!(await doCheckin({ token }, box))) confirm.disabled = false;
  } }, 'Potvrdiť príchod');
  box.replaceChildren(h('div', { class: 'ci' }, info, confirm));
}
/* Ručný check-in podľa mena (jazdec bez telefónu). Pri rovnakom mene ponúkne konkrétne registrácie. */
function manualCheckin() {
  const evs = registrationEvents().length ? registrationEvents() : EVENTS;
  const sel = h('select', { 'aria-label': 'Event' }, evs.map(e => h('option', { value: e.id }, `${e.name}${e.date ? ', ' + fmtDate(e.date) : ''}`)));
  const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Meno jazdca', 'aria-label': 'Meno jazdca', autocomplete: 'off' });
  const box = h('div', { class: 'scan-result' });
  const btn = h('button', { class: 'btn small', type: 'button', onclick: async () => {
    const n = name.value.replace(/\s+/g, ' ').trim();
    if (n.length < 2) { box.replaceChildren(h('p', { class: 'form-msg' }, 'Napíš meno jazdca.')); return; }
    btn.disabled = true; box.replaceChildren(h('p', {}, 'Hľadám…'));
    await doCheckin({ event_id: sel.value, rider_name: n }, box);
    btn.disabled = false;
  } }, 'Zapísať príchod');
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
  return h('section', { class: 'admin-sec' }, h('h2', { class: 'wide sub' }, 'Ručný check-in'),
    h('p', { class: 'note' }, 'Keď jazdec nemá pass, zapíš ho podľa mena z registrácie.'), h('div', { class: 'res-add' }, sel, name, btn), box);
}
async function adminGate(body, denied = 'Tento účet nemá prístup. Check-in robí len crew.') {
  if (store.mode === 'offline') { put(body, h('p', { class: 'form-msg', role: 'alert' }, store.message)); return false; }
  if (store.mode === 'live' && !(await store.signedIn())) { put(body, h('button', { class: 'btn primary', type: 'button', onclick: () => loginDialog(() => route()) }, 'Prihlásiť sa')); return false; }
  if (!(await store.isAdmin())) { put(body, h('p', {}, denied)); return false; }
  return true;
}
async function pageCheckin(root, token) {
  root.append(pageHead('Check-in', 'Pre crew na evente.'));
  const body = h('div', { class: 'wrap page-body' }); root.append(body);
  if (!(await adminGate(body))) return;
  const box = h('div'); put(body, box, h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/admin/scan' }, 'Skenovať ďalšieho')), manualCheckin());
  checkinView(token, box);
}
async function pageScan(root) {
  root.append(pageHead('Skener', 'Namier kameru na QR kód jazdca.'));
  const body = h('div', { class: 'wrap page-body' }); root.append(body);
  if (!(await adminGate(body))) return;
  const video = h('video', { class: 'scan-video', muted: true, playsinline: true });
  const box = h('div', { class: 'scan-result' }, h('p', { class: 'empty' }, 'Čakám na QR kód…'));
  put(body, h('div', { class: 'scan-wrap' }, video, h('span', { class: 'scan-frame', 'aria-hidden': 'true' })), box, manualCheckin());
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
    [String(list.length), plural(list.length, 'jazdec v rebríčku', 'jazdci v rebríčku', 'jazdcov v rebríčku'), 'po prvej sezóne'],
    [String(cats.size), plural(cats.size, 'kategória', 'kategórie', 'kategórií'), CATEGORIES.filter(c => cats.has(c.id)).map(c => c.name).join(', ')],
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
      h('p', {}, SITE.email ? SITE.email + '   ' : '', 'Instagram @' + SITE.instagram, '   ', location.origin + location.pathname)));
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
        h('ul', {}, wins.map(([c, l]) => l.map(x => h('li', {}, avatarEl(x.name, slug(x.name), { rank: 1 }), h('span', {}, h('small', { class: 'mono' }, c.name), h('a', { href: riderHref(x) }, x.name))))),
          ev.awards.map(a => h('li', {}, avatarEl(a.rider, slug(a.rider)), h('span', {}, h('small', { class: 'mono' }, a.name), h('a', { href: awardHref(a) }, a.rider)))))));
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
  root.append(pageHead('Kto sme', 'Nový organizátor skate eventov na Slovensku. Komunitná značka, ktorá robí skate pre skejterov.'),
    h('div', { class: 'wrap page-body' },
      h('section', { class: 'about ab-grid' },
        h('div', { class: 'ab-copy' },
          h('p', { class: 'lead' }, 'GOSko je komunitná značka. Robíme pop-up súťaže Game of S.K.A.T.E. po mestách na Slovensku a v Česku, vedieme rebríček jazdcov a staviame vlastný digitálny svet pre skejterov.'),
          h('p', {}, 'Začali sme v roku 2026 v Bratislave, nasledovala Žilina na Shred Feste. V novembri štartuje pilot novej sezóny a v roku 2027 chceme obísť krajské mestá a prvý stop v Česku.'),
          h('p', { class: 'ab-oz mono' }, 'Za GOSkom stojí Slovenská Federácia Skateboardingu (občianske združenie v príprave).'),
          h('ul', { class: 'ab-stats' }, FACTS.slice(0, 4).map(f => h('li', {}, h('b', {}, f.num), h('span', {}, f.label))))),
        h('div', { class: 'ab-pillars' },
          pillar('#/eventy', '01', 'Eventy', 'Pop-up súťaže po mestách SK a CZ.'),
          pillar('#/rebricek', '02', 'Rebríček a jazdci', 'Body, výsledky a profil každého jazdca.'),
          pillar('#/spoty', '03', 'Komunita', 'Mapa spotov, parky a klipy.'),
          pillar('#/partneri', '04', 'Pre partnerov', 'Čo robíme a ako sa môžete pridať.')))));
}

const draftTag = () => h('span', { class: 'tag' }, 'Návrh, na kontrolu');
function pageRules(root) {
  const any = RULES.length > 0 || FAQ.length > 0;
  root.append(pageHead('Pravidlá', any ? 'Súťažný poriadok GOSko: ako sa hrá a čo treba vedieť.' : 'Pravidlá a odpovede na časté otázky dopĺňame.'));
  const body = h('div', { class: 'wrap page-body' });
  const paras = txt => String(txt).split(/\n\s*\n/).map(x => h('p', {}, x));
  for (const r of RULES) put(body, h('section', { class: 'rule' }, h('h2', { class: 'wide sub' }, r.title, r.draft ? [' ', draftTag()] : null), paras(r.text)));
  if (FAQ.length) put(body, h('h2', { class: 'wide sub' }, 'Časté otázky'), FAQ.map(f => h('details', { class: 'faq' }, h('summary', {}, f.q), h('div', {}, paras(f.a)))));
  put(body, h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/rebricek/pravidla' }, 'Rebríčkový poriadok'), ' ', h('a', { class: 'btn', href: '#/sukromie' }, 'Ochrana osobných údajov')),
    h('p', { class: 'note' }, 'Nenašiel si odpoveď? Napíš nám na Instagram ', igLink(SITE.instagram), '.'));
  root.append(body);
}
/* Stránka zo sekcií assets/pages.js: { title, paras, items, table, draft } */
function docSections(sections) {
  return sections.map(s => h('section', { class: 'rule' },
    h('h2', { class: 'wide sub' }, s.title, s.draft ? [' ', draftTag()] : null),
    (s.paras || []).map(p => h('p', {}, p)),
    s.items?.length ? h('ul', { class: 'doc-list' }, s.items.map(i => h('li', {}, i))) : null,
    s.table ? h('div', { class: 'table-wrap' }, h('table', { class: 'points-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Umiestnenie'), h('th', {}, 'Body'))),
      h('tbody', {}, s.table.map(r => h('tr', {}, h('td', {}, r.label), h('td', {}, String(r.points))))))) : null));
}
function pageRankingRules(root) {
  root.append(pageHead('Rebríčkový poriadok', 'Ako sa počíta GOSko Ranking: body, kategórie, krajiny a rovnosť bodov.'),
    h('div', { class: 'wrap page-body' }, docSections(rankingRules({ points: POINTS, rules: SEASON_RULES, categories: CATEGORIES })),
      h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/rebricek' }, 'GOSko Ranking'), ' ', h('a', { class: 'btn', href: '#/pravidla' }, 'Súťažný poriadok'))));
}
function pagePrivacy(root) {
  root.append(pageHead('Ochrana osobných údajov', 'Aké údaje GOSko zbiera, prečo a aké máš práva.'),
    h('div', { class: 'wrap page-body' }, docSections(PRIVACY),
      h('p', { class: 'more' }, h('button', { class: 'btn primary', type: 'button', onclick: () => privacyDialog() }, 'Súkromie a odstránenie údajov'))));
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
  const poll = setInterval(async () => { await refreshRemote(); render(); }, 30000);   // databázu čítame raz za 30 s
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
      h('h2', { class: 'card-title' }, e.name), h('p', {}, [fmtDate(e.date) || (e.status === 'next' ? 'dátum čoskoro' : 'dátum doplníme'), e.status === 'next' ? 'pripravovaný' : 'odjazdený'].join(', ')),
      h('a', { class: 'btn primary', href: '#/admin/vysledky/' + e.id }, 'Zapisovať'))))));
    put(body, h('p', { class: 'more' }, h('a', { class: 'btn', href: '#/admin' }, 'Späť do adminu')));
    return;
  }
  let cat = 'open', bracket = null, draft = [], note = '', drawMode = 'random';
  const view = h('div'); put(body, view);
  const clone = o => JSON.parse(JSON.stringify(o));
  const loadBracket = () => { bracket = ev.brackets?.[cat] ? clone(ev.brackets[cat]) : null; };
  const say = m => { note = m; const el = view.querySelector('.res-note'); if (el) el.textContent = m; };
  const failed = err => { if (!(err instanceof UserError)) console.error(err); say(err instanceof UserError ? err.message : 'Nepodarilo sa uložiť. Skús znova.'); };
  /* Výsledky sa spárujú s registráciami podľa mena (len jednoznačná zhoda), aby mali rider_id a NFT. */
  const withRegistrations = async rows => {
    let regs = [];
    try { regs = (await store.eventRegistrations(ev.id)).filter(r => r.category === cat && r.name); } catch (err) { console.error(err); }
    const by = new Map();
    for (const r of regs) by.set(same(r.name), by.has(same(r.name)) ? null : r.id);
    return rows.map(x => (by.get(same(x.name)) ? { ...x, registration_id: by.get(same(x.name)) } : x));
  };
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
      let rows = []; try { rows = await store.eventRegistrations(ev.id); } catch (err) { failed(err); return; }
      rows = rows.filter(r => r.category === cat);
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
      try { await store.saveResults(ev.id, cat, await withRegistrations(names.map((name, i) => ({ name, place: i + 1 })))); await refreshRemote(); note = `Uložené: ${names.length} jazdcov v poradí.`; render(); } catch (err) { failed(err); }
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
    const saveRes = async () => { try { await store.saveResults(ev.id, cat, await withRegistrations(pl)); await refreshRemote(); note = 'Výsledky sú v rebríčku.'; render(); } catch (err) { failed(err); } };
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

/* ---------- prenos passov zo starej adresy ----------
   redirect/index.html na GitHub Pages pošle passy z localStorage ako #/import-passes/<base64url>?to=<pôvodný hash>.
   Uložia sa k passom na tejto doméne (podľa tokenu) a stránka pokračuje na pôvodnú adresu, inak na úvod. */
function pageImportPasses(root, data, to) {
  const incoming = decodePasses(data);
  if (incoming.length) { LSX.set('gosko:passes', mergePasses(LSX.get('gosko:passes', []), incoming)); updateMenu(); }
  location.replace(importTarget(to));
}

/* =====================================================================
   ROUTER
   ===================================================================== */
/* Polaroidy z eventov na spodku stránok: zábava ide až za hlavný obsah. */
function funStrip() { return polaroidStrip(EVENTS.flatMap(e => e.photos || []), lightbox); }
/* Hra Ghoskate (assets/game/): načíta sa až na herných stránkach. */
const gamePage = name => async (root, ...args) => (await import('./game/index.js'))[name](root, {
  store, login: loginDialog, go, rerender: route, setOnAuth: fn => { onAuthChange = fn; }, events: EVENTS, apiBase: API,
}, ...args);
const gameSoon = which => async root => (await import('./game/index.js')).pageSoon(root, {}, which);

/* [regex hashu, stránka(root, ...skupiny z regexu), aktívna položka menu]. Nové stránky pridaj sem. */
const ROUTES = [
  [/^#?\/?$/, pageHome, ''],
  [/^#\/rebricek$/, pageStandings, 'rebricek'],
  [/^#\/rebricek\/pravidla$/, pageRankingRules, 'rebricek'],
  [/^#\/sukromie$/, pagePrivacy, ''],
  [/^#\/registracia\/potvrdene$/, pageRegisterDone, 'eventy'],
  [/^#\/registracia\/neplatny-odkaz$/, pageRegisterBadLink, 'eventy'],
  [/^#\/registracia\/([\w-]+)$/, pageRegister, 'eventy'],
  [/^#\/pass\/([\w-]+)$/, pagePass, ''],
  [/^#\/eventy$/, pageEvents, 'eventy'],
  [/^#\/novinky$/, pageNews, 'novinky'],
  [/^#\/novinka\/([\w-]+)$/, pagePost, 'novinky'],
  [/^#\/event\/([\w-]+)$/, pageEvent, 'eventy'],
  [/^#\/jazdci$/, pageRiders, 'rebricek'],
  [/^#\/jazdec\/([\w-]+)$/, pageRider, 'jazdci'],
  [/^#\/parky$/, pageParks, 'parky'],
  [/^#\/shop$/, pageShop, 'shop'],
  [/^#\/partneri(?:\/(\w+))?$/, pagePartners, 'partneri'],
  [/^#\/mapa$/, gamePage('pageGameMap'), 'mapa'],
  [/^#\/spot\/([\w-]+)$/, gamePage('pageGameMap'), 'mapa'],
  [/^#\/spoty$/, pageMap, 'mapa'],
  [/^#\/hra\/profil$/, gamePage('pageOnboarding'), 'mapa'],
  [/^#\/hra\/rebricek$/, gamePage('pageCrewBoard'), 'mapa'],
  [/^#\/hra\/potvrdene$/, gamePage('pageGameConsentDone'), 'mapa'],
  [/^#\/feed$/, gameSoon('feed'), 'mapa'],
  [/^#\/crew$/, gameSoon('crew'), 'mapa'],
  [/^#\/loadout$/, gameSoon('loadout'), 'mapa'],
  [/^#\/pass$/, pagePasses, ''],
  [/^#\/checkin\/([\w-]+)$/, pageCheckin, ''],
  [/^#\/import-passes\/([\w-]+)(?:\?to=(.*))?$/, pageImportPasses, ''],
  [/^#\/admin\/scan$/, pageScan, ''],
  [/^#\/admin\/vysledky(?:\/([\w-]+))?$/, pageAdminResults, ''],
  [/^#\/pravidla$/, pageRules, 'pravidla'],
  [/^#\/o-nas$/, pageAbout, 'o-nas'],
  [/^#\/sien-slavy$/, root => pageStandings(root, 'sien-slavy'), 'rebricek'],
  [/^#\/partner\/([\w-]+)$/, pagePartner, 'partneri'],
  [/^#\/tv\/([\w-]+)(?:\/(\w+))?$/, pageTv, ''],
  [/^#\/admin$/, pageAdmin, ''],
];
let store, cleanup = null, onAuthChange = null, renderId = 0;
/* Prvky pod okrajom obrazovky sa pri príchode jemne dosunú. Obsah je viditeľný stále. */
let revealIO = null;
function reveal(main) {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  revealIO ||= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('rv-pre'); revealIO.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  for (const el of main.querySelectorAll('.band, .home-sec, .tv-sec .wrap, .standings, .ev-list, .gallery, .cards')) {
    if (el.getBoundingClientRect().top < innerHeight) continue;
    el.classList.add('rv', 'rv-pre'); revealIO.observe(el);
  }
}
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
  if ([pageStandings, pageEvents, pageRiders].includes(page)) { const fs = funStrip(); if (fs) main.append(fs); }
  reveal(main);
  cleanup = typeof res === 'function' ? res : null;
  main.focus({ preventScroll: true });
}

(async function start() {
  initPwa();
  $('#footer-news').addEventListener('click', () => newsletterDialog('footer'));
  $('.skip-link')?.addEventListener('click', e => { e.preventDefault(); $('#main').focus(); });   // #main by inak zmenil hash routu
  updateMenu();
  const menu = $('#menu');
  $('#menu-open').addEventListener('click', () => menu.showModal());
  menu.addEventListener('click', e => { if (e.target === menu || e.target.closest('a,[data-close]')) menu.close(); });
  applyData();
  store = await getStore(CONFIG);
  store.onAuth(() => onAuthChange && onAuthChange());
  // prihlásenie odkazom z e-mailu otvorí úvod: hráča vráť tam, odkiaľ sa prihlasoval (assets/game/return.js)
  if (await store.signedIn()) { const back = consumeReturn(); if (back) history.replaceState(null, '', back); }
  await Promise.race([refreshRemote(), new Promise(r => setTimeout(r, 4000))]);
  window.addEventListener('hashchange', route);
  route();
})();
