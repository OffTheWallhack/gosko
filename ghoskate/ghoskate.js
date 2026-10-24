/* Ghoskate: prezentačný web. Registrácia je tá istá ako na GOSko webe (Supabase Auth, rovnaké prihlásenie),
   profil (duch, doska, loot) je spoločný: tabuľky profiles a inventory. */
import { CONFIG, SKATEPARKS } from '../data.js';
import { getStore, isEmail } from '../assets/store.js';
import { GHOST_SKINS, ITEMS, ghostOf, withSkin, ghostSvg, cacheProfile, cachedProfile, localGhost, localLoadout, DEFAULT_LOADOUT } from '../assets/profile.js';
import { STR, PARTS, LANGS, HTML_LANG } from './i18n.js';

/* ---------- pomocníci ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const LS = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bez úložiska to ide aj tak */ } },
};
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOW_END = (() => { try { const c = navigator.connection; return !!(c && (c.saveData || /2g/.test(c.effectiveType || ''))) || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2); } catch { return false; } })();
const NICK_RE = /^[A-Za-z0-9ÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽáäčďéěíĺľňóôŕřšťúůýž _.-]{2,24}$/;
const KINDS = ['Street spot', 'Skatepark', 'DIY', 'Iné'];
const FEATURES = ['stairs', 'rail', 'ledge', 'manual', 'gap', 'bank', 'kicker', 'bowl', 'flat'];

/* ---------- jazyk ---------- */
function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) return q;
  const saved = LS.get('ghoskate:lang', null);
  if (LANGS.includes(saved)) return saved;
  for (const x of (navigator.languages || [navigator.language || ''])) {
    const c = String(x).slice(0, 2).toLowerCase();
    if (c === 'sk') return 'sk'; if (c === 'cs') return 'cs'; if (c === 'en') return 'en';
  }
  return 'sk';
}
let lang = pickLang();
const t = (k, vars) => {
  let v = STR[lang][k] ?? STR.sk[k] ?? k;
  if (typeof v === 'string' && vars) v = v.replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? '');
  return v;
};
const partName = (part, key) => PARTS[lang][part]?.[key] || (key === 'photo' ? t('create.photoDeck') : /^#[0-9a-f]{6}$/i.test(key || '') ? t('create.customColor') : key);
/* vlastná fotka na doske žije len v zariadení, kde ju niekto nahral; do účtu ide farba */
const savableLoadout = l => ({ ...DEFAULT_LOADOUT, ...l, deck: l.deck === 'photo' ? (S.profile?.loadout?.deck !== 'photo' && S.profile?.loadout?.deck) || 'cream' : l.deck });

/* ---------- stav ---------- */
const DRAFT_KEY = 'ghoskate:draft';
function freshDraft() {
  const p = cachedProfile();
  return {
    nickname: p?.nickname || '', ghost: ghostOf(p?.ghost || localGhost()), loadout: { ...DEFAULT_LOADOUT, ...(p?.loadout || localLoadout()) },
    city: '', country: lang === 'cs' ? 'CZ' : 'SK', age_group: 'adult', parent_consent: false, crew_name: '', beta: false, news: false, pendingSave: false,
  };
}
const S = {
  store: null, signedIn: false, email: '', profile: null, inv: [], spots: [], offline: false,
  draft: { ...freshDraft(), ...LS.get(DRAFT_KEY, {}) },
  step: 'email', pendingEmail: '', pwMode: false, justFounder: false, spotSent: false, savingP: null,
  spot: null, picker: null, heroApi: null, previewApi: null, map: null,
};
S.draft.ghost = ghostOf(S.draft.ghost);
S.draft.loadout = { ...DEFAULT_LOADOUT, ...S.draft.loadout };
const saveDraft = () => LS.set(DRAFT_KEY, S.draft);
const has = item => S.inv.includes(item);
const newSpot = () => ({ name: '', city: S.draft.city || S.profile?.city || '', kind: 'Street spot', features: [], difficulty: null, bust: null, description: '', photo: null, point: null });

function toast(text) {
  const el = $('#toast'); el.textContent = text; el.hidden = false;
  clearTimeout(toast.tm); toast.tm = setTimeout(() => { el.hidden = true; }, 4200);
}
function authErr(err) {
  const m = String(err?.code || err?.message || '');
  if (/rate|429|over_email/i.test(m) || err?.status === 429) return t('create.err.rate');
  if (/invalid.*credentials|invalid_grant/i.test(m)) return t('create.err.creds');
  if (m === 'code') return t('create.err.code');
  if (m === 'link') return t('create.err.link');
  if (/expired|not found|invalid/i.test(m)) return t('create.err.expired');
  return t('create.err.login');
}

/* ---------- statické časti v jazyku ---------- */
function applyLang() {
  document.documentElement.lang = HTML_LANG[lang];
  document.title = t('meta.title');
  $('meta[name="description"]').setAttribute('content', t('meta.desc'));
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)));
  document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  renderGoals(); renderCareer(); renderFaq(); renderCreate(); updateAcct();
  if (S.map) { S.map(); S.map = null; mountWorld(); }
}
function renderGoals() {
  $('#goals').replaceChildren(...t('how.goals').map(([title, text, w]) => h('li', { class: 'goal' },
    h('span', { class: 'goal-box', 'aria-hidden': 'true' }),
    h('h3', {}, title, h('span', { class: 'wave w' + w }, t('how.wave', { n: w }))),
    h('p', {}, text))));
}
function renderCareer() {
  const items = t('career.items');
  $('#career').replaceChildren(...items.map(([when, title, text], i) => h('li', {
    class: 'lv' + (i === 0 ? ' now' : '') + ([1, 5, 6, 7].includes(i) ? ' event' : '') + (i === items.length - 1 ? ' final' : '') },
    h('span', { class: 'lv-when', 'data-now': i === 0 ? t('career.now') : null }, when), h('h3', { class: 'lv-t' }, title), h('p', { class: 'lv-d' }, text))));
}
function renderFaq() {
  $('#faq').replaceChildren(...t('faq.items').map(([q, a], i) => h('details', {},
    h('summary', {}, q), h('p', {}, a, i === 5 ? [' ', h('a', { href: 'rodicia' }, t('foot.parents'))] : null))));
}
async function updateAcct() {
  const a = $('#acct'); if (!a) return;
  const icon = h('span', { class: 'acct-ghost', 'aria-hidden': 'true' });
  icon.innerHTML = await ghostSvg(S.profile ? S.profile.ghost : S.draft.ghost);
  a.replaceChildren(icon, h('span', {}, S.profile ? S.profile.nickname || t('top.profile') : t('top.login')));
}

/* ---------- 3D duch (titulka + karta) ---------- */
const use3d = () => !LOW_END && !REDUCED && 'WebGLRenderingContext' in window;
async function mountGhost(slot, interactive) {
  const style = ghostOf(S.draft.ghost).style;
  const canvas = h('canvas', { 'aria-hidden': 'true', class: style === '3d' ? '' : style });
  slot.append(canvas);
  if (style === 'pixel') { const m = await import('../assets/pixel-ghost.js'); return m.mountPixelGhost(canvas, { look: S.draft.loadout, ghost: S.draft.ghost, interactive }); }
  const m = await import('../assets/mascot.js');
  return m.mountMascot(canvas, { look: S.draft.loadout, ghost: S.draft.ghost, interactive, ps1: style === 'ps1' });
}
let lookTimer = null;
async function updatePreview({ look = false } = {}) {
  for (const api of [S.heroApi, S.previewApi]) api?.setGhost?.(S.draft.ghost);
  if (look) { clearTimeout(lookTimer); lookTimer = setTimeout(() => { for (const api of [S.heroApi, S.previewApi]) api?.setLook?.(S.draft.loadout); }, 120); }
  const still = $('#preview .still');
  if (still) still.innerHTML = await ghostSvg(S.draft.ghost, { title: t('create.preview') });
  updateCard(); updateAcct();
}
function startHero() {
  const stage = $('#hero-stage');
  if (!use3d()) return;
  const go = () => mountGhost(stage, true).then(api => { S.heroApi = api; stage.classList.add('live'); }).catch(err => console.error(err));
  ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 400);
}
function startPreview() {
  const stage = $('#preview');
  const still = h('div', { class: 'still' }); stage.append(still);
  ghostSvg(S.draft.ghost, { title: t('create.preview') }).then(svg => { still.innerHTML = svg; });
  if (!use3d()) return;
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return; io.disconnect();
    mountGhost(stage, false).then(api => { S.previewApi = api; still.remove(); }).catch(err => console.error(err));
  }, { rootMargin: '300px 0px' });
  io.observe(stage);
}

/* ---------- karta ducha ---------- */
function updateCard() {
  const nick = S.draft.nickname.trim();
  const n = $('#card-nick'); n.textContent = nick || t('create.noNick'); n.classList.toggle('empty', !nick);
  $('#card-meta').textContent = GHOST_SKINS[S.draft.ghost.skin].name[lang] + ', ' + partName('deck', S.draft.loadout.deck);
  const card = $('#card');
  card.classList.toggle('is-founder', has('badge:founder'));
  const inv = $('#card-inv');
  const items = S.inv.filter(i => ITEMS[i]);
  inv.hidden = !items.length;
  if (items.length) inv.replaceChildren(h('p', { class: 'hint' }, t('create.inventory')),
    ...items.map(i => h('div', { class: 'loot' }, h('i', { 'aria-hidden': 'true' }), h('b', {}, ITEMS[i].name[lang]), h('span', {}, ITEMS[i].about[lang]))),
    S.profile ? h('button', { class: 'btn-line', type: 'button', onclick: downloadCard }, t('create.card')) : null);
}

/* ---------- Vytvor ducha: ciele A, B, C ---------- */
const field = (label, input, hint) => h('label', { class: 'field' }, label, input, hint ? h('small', {}, hint) : null);
function setGoal(id, done, locked = false) {
  const li = $('#' + id); li.classList.toggle('done', done); li.classList.toggle('locked', locked);
  li.querySelector('[data-state]').textContent = ', ' + (done ? t('create.done') : t('create.todo'));
}
const nickOk = () => NICK_RE.test(S.draft.nickname.trim());
function renderCreate() {
  renderA(); renderB(); renderC(); updateCard();
  setGoal('goal-a', nickOk());
  setGoal('goal-b', !!S.profile);
  setGoal('goal-c', S.spots.length > 0, !S.profile);
}

function renderA() {
  const d = S.draft;
  const nickMsg = h('p', { class: 'msg', id: 'nick-msg', 'aria-live': 'polite' });
  const nick = h('input', { type: 'text', name: 'nickname', value: d.nickname, maxlength: 24, autocomplete: 'nickname', autocapitalize: 'off', spellcheck: 'false', 'aria-describedby': 'nick-msg' });
  nick.addEventListener('input', () => { d.nickname = nick.value; saveDraft(); nickMsg.textContent = ''; nickMsg.className = 'msg'; updateCard(); setGoal('goal-a', nickOk()); });
  nick.addEventListener('change', async () => {
    const v = nick.value.trim();
    if (!v) return;
    if (!NICK_RE.test(v)) { nickMsg.textContent = t('create.nickInvalid'); return; }
    if (S.store?.mode !== 'live') return;
    try { const free = await S.store.nicknameFree(v); nickMsg.textContent = free ? t('create.nickFree') : t('create.nickTaken'); nickMsg.className = 'msg' + (free ? ' ok' : ''); } catch { /* kontrola je len pomoc */ }
  });

  const skinName = h('p', { class: 'skin-name', 'aria-live': 'polite' });
  const skins = h('div', { class: 'skins', role: 'group', 'aria-label': t('create.skin') });
  const drawSkins = () => {
    skinName.textContent = GHOST_SKINS[d.ghost.skin].name[lang];
    skins.replaceChildren(...Object.entries(GHOST_SKINS).map(([k, s]) => {
      const locked = s.locked && !has(s.locked);
      const b = h('button', { type: 'button', class: 'skin', 'aria-pressed': String(d.ghost.skin === k), 'aria-disabled': locked ? 'true' : null,
        'aria-label': s.name[lang] + (locked ? '. ' + t('create.skinLocked') : ''), title: s.name[lang],
        onclick: () => {
          if (locked) { skinName.textContent = s.name[lang] + ': ' + t('create.skinLocked'); return; }
          d.ghost = withSkin(d.ghost, k); saveDraft(); drawSkins(); updatePreview(); autosave();
        } },
        locked ? h('span', { class: 'lock', 'aria-hidden': 'true' }) : null,
        !locked && s.locked && S.justFounder ? h('span', { class: 'new' }, t('create.skinNew')) : null);
      ghostSvg({ skin: k }).then(svg => b.insertAdjacentHTML('afterbegin', svg));
      return b;
    }));
  };
  drawSkins();

  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('create.board') });
  const parts = h('div', { class: 'parts', role: 'group' });
  let tab = 'deck';
  const drawParts = async () => {
    const B = await import('../assets/looks.js');
    const TABLE = { deck: B.DECKS, grip: B.GRIPS, wheels: B.WHEELS, trucks: B.TRUCKS };
    const hex = n => '#' + n.toString(16).padStart(6, '0');
    const chip = (part, v) => part === 'deck' ? (v.pattern === 'ghosts' ? `url(img/ghost.svg) center/70% no-repeat,${v.base}` : `linear-gradient(90deg,${v.stripe} 0 18%,${v.base} 18% 82%,${v.stripe} 82%)`)
      : part === 'grip' ? (v.ghost ? `url(img/ghost.svg) center/55% no-repeat,#1b1b1b` : v.tint ? `rgb(${v.tint})` : '#1b1b1b')
      : part === 'wheels' ? `radial-gradient(circle,${hex(v.core)} 0 26%,${hex(v.color)} 27%)` : hex(v.color);
    tabs.replaceChildren(...['deck', 'grip', 'wheels', 'trucks'].map(p => h('button', { type: 'button', role: 'tab', 'aria-selected': String(p === tab), onclick: () => { tab = p; drawParts(); } }, t('create.tab.' + p))));
    parts.setAttribute('aria-label', t('create.tab.' + tab));
    parts.replaceChildren(...Object.entries(TABLE[tab]).map(([k, v]) => h('button', { type: 'button', class: 'part', 'aria-pressed': String(d.loadout[tab] === k),
      onclick: () => { d.loadout = { ...d.loadout, [tab]: k }; saveDraft(); drawParts(); updatePreview({ look: true }); autosave(); } },
      h('i', { style: `background:${chip(tab, v)}`, 'aria-hidden': 'true' }), partName(tab, k))));
  };
  drawParts();

  $('#body-a').replaceChildren(
    field(t('create.nick'), nick, t('create.nickHint')), nickMsg,
    h('div', { class: 'field' }, t('create.skin'), skins, skinName, h('p', { class: 'hint' }, h('a', { href: '../#/profil' }, t('create.moreGhost')))),
    h('div', { class: 'field' }, t('create.board'), tabs, parts));
}

/* uložený profil: zmeny ducha a dosky sa ukladajú samé */
let autoTimer = null;
function autosave() {
  if (!S.profile || S.store?.mode !== 'live') return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(async () => {
    try { const p = await S.store.saveProfile({ ghost: ghostOf(S.draft.ghost), loadout: savableLoadout(S.draft.loadout) }); S.profile = p; cacheProfile(p, S.inv); updateAcct(); }
    catch (err) { console.error(err); }
  }, 800);
}

function detailsFields() {
  const d = S.draft;
  const bind = (el, key, read = e => e.value) => { el.addEventListener('input', () => { d[key] = read(el); saveDraft(); }); el.addEventListener('change', () => { d[key] = read(el); saveDraft(); }); return el; };
  const country = bind(h('select', { name: 'country' }, Object.entries(t('create.countries')).map(([v, l]) => h('option', { value: v, selected: d.country === v }, l))), 'country');
  const parent = h('label', { class: 'check', hidden: d.age_group !== 'u16' }, bind(h('input', { type: 'checkbox', checked: d.parent_consent }), 'parent_consent', e => e.checked), h('span', {}, t('create.parent')));
  const age = h('div', { class: 'seg', role: 'group', 'aria-label': t('create.age') }, [['adult', t('create.adult')], ['u16', t('create.u16')]].map(([v, l]) =>
    h('button', { type: 'button', 'aria-pressed': String(d.age_group === v), onclick: e => {
      d.age_group = v; saveDraft(); age.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); parent.hidden = v !== 'u16';
    } }, l)));
  return [
    h('div', { class: 'row2' },
      field(t('create.city'), bind(h('input', { type: 'text', name: 'city', value: d.city, maxlength: 40, autocomplete: 'address-level2' }), 'city')),
      field(t('create.country'), country)),
    h('div', { class: 'field' }, t('create.age'), age), parent,
    field(t('create.crew'), bind(h('input', { type: 'text', name: 'crew', value: d.crew_name, maxlength: 40, placeholder: t('create.crewPh') }), 'crew_name')),
    h('label', { class: 'check' }, bind(h('input', { type: 'checkbox', checked: d.beta }), 'beta', e => e.checked), h('span', {}, t('create.beta'))),
    h('label', { class: 'check' }, bind(h('input', { type: 'checkbox', checked: d.news }), 'news', e => e.checked), h('span', {}, t('create.news'))),
  ];
}
function profileError() {
  const v = S.draft.nickname.trim();
  if (!v) return t('create.err.nick');
  if (!NICK_RE.test(v)) return t('create.nickInvalid');
  if (S.draft.age_group === 'u16' && !S.draft.parent_consent) return t('create.err.u16');
  return '';
}
function focusNick(text) {
  const m = $('#nick-msg'); if (m) { m.textContent = text; m.className = 'msg'; }
  $('#goal-a input[name=nickname]')?.focus();
}

function renderB() {
  const body = $('#body-b');
  const msg = h('p', { class: 'msg', role: 'alert' });
  const busy = async (btn, fn) => { msg.textContent = ''; btn.disabled = true; try { await fn(); } catch (err) { console.error(err); msg.textContent = authErr(err); } finally { btn.disabled = false; } };
  const out = [];
  if (S.store?.mode === 'demo') out.push(h('p', { class: 'hint' }, t('create.err.offline')));
  if (S.signedIn && S.store?.mode === 'live') {
    out.push(h('p', { class: 'signed' }, t('create.signedAs', { e: '' }).replace(/\s*\.$/, ' '), h('b', {}, S.email), '. ',
      h('button', { class: 'btn-text', type: 'button', onclick: async () => { await S.store.logout(); S.step = 'email'; await refreshAuth(); } }, t('create.logout'))));
  }
  out.push(...detailsFields());
  if (S.signedIn) {
    const save = h('button', { class: 'btn-start', type: 'button', onclick: async () => {
      const err = profileError(); if (err) { msg.textContent = err; if (!nickOk()) focusNick(err); return; }
      save.disabled = true; save.textContent = t('create.saving');
      await ensureSaved(msg);
      save.disabled = false; save.textContent = S.profile ? t('create.saveChanges') : t('create.save');
    } }, S.profile ? t('create.saveChanges') : t('create.save'));
    out.push(h('div', { class: 'actions' }, save));
  } else if (S.step === 'code') {
    const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, placeholder: '123456', name: 'code' });
    const link = h('textarea', { rows: 3, placeholder: 'https://…' });
    const verify = h('button', { class: 'btn-start', type: 'button', onclick: () => busy(verify, async () => { await S.store.verifyCode(S.pendingEmail, code.value); await refreshAuth(); }) }, t('create.verify'));
    const linkBtn = h('button', { class: 'btn-line', type: 'button', onclick: () => busy(linkBtn, async () => { await S.store.verifyLink(link.value); await refreshAuth(); }) }, t('create.linkBtn'));
    out.push(h('p', { class: 'hint' }, t('create.codeSent', { e: S.pendingEmail })),
      field(t('create.code'), code),
      h('div', { class: 'actions' }, verify, h('button', { class: 'btn-text', type: 'button', onclick: () => { S.step = 'email'; renderB(); } }, t('create.otherEmail'))),
      h('details', { class: 'help' }, h('summary', {}, t('create.linkHelp')), h('p', {}, t('create.linkHelpText')), link, h('div', { class: 'actions' }, linkBtn)));
  } else {
    const email = h('input', { type: 'email', name: 'email', autocomplete: 'email', value: S.pendingEmail, inputmode: 'email' });
    email.addEventListener('input', () => { S.pendingEmail = email.value.trim(); });
    const pw = h('input', { type: 'password', name: 'password', autocomplete: 'current-password' });
    const check = () => { const err = profileError(); if (err) { msg.textContent = err; if (!nickOk()) focusNick(err); return false; } if (!isEmail(email.value.trim())) { msg.textContent = t('create.err.email'); email.focus(); return false; } return true; };
    const send = h('button', { class: 'btn-start', type: 'button', onclick: () => { if (!check()) return; busy(send, async () => {
      S.pendingEmail = email.value.trim(); S.draft.pendingSave = true; saveDraft();
      await S.store.login(S.pendingEmail); S.step = 'code'; renderB();
      $('#body-b input[name=code]')?.focus();
    }); } }, t('create.sendCode'));
    const pwLogin = h('button', { class: 'btn-start', type: 'button', onclick: () => { if (!check()) return; busy(pwLogin, async () => {
      S.pendingEmail = email.value.trim(); S.draft.pendingSave = true; saveDraft();
      await S.store.loginPassword(S.pendingEmail, pw.value); await refreshAuth();
    }); } }, t('create.pwLogin'));
    out.push(field(t('create.email'), email));
    if (S.pwMode) out.push(field(t('create.password'), pw), h('div', { class: 'actions' }, pwLogin, h('button', { class: 'btn-text', type: 'button', onclick: () => { S.pwMode = false; renderB(); } }, t('create.sendCode'))));
    else out.push(h('div', { class: 'actions' }, send, h('button', { class: 'btn-text', type: 'button', onclick: () => { S.pwMode = true; renderB(); } }, t('create.pwToggle'))));
  }
  out.push(msg);
  if (S.justFounder) out.push(h('div', { class: 'reward', role: 'status' }, h('b', {}, t('create.founderT')), h('p', {}, t('create.founderD'))));
  else if (S.profile) out.push(h('p', { class: 'msg ok' }, t('create.saved')));
  body.replaceChildren(...out);
}

/* uloženie profilu (raz naraz, aj po návrate z e-mailu) */
function ensureSaved(msgEl) {
  if (S.savingP) return S.savingP;
  S.savingP = (async () => {
    const d = S.draft, before = S.profile;
    try {
      const row = {
        nickname: d.nickname.trim(), city: d.city.trim() || null, country: d.country || null, lang,
        age_group: d.age_group, parent_consent: d.age_group === 'u16' && !!d.parent_consent,
        ghost: ghostOf(d.ghost), loadout: savableLoadout(d.loadout), crew_name: d.crew_name.trim() || null, beta: !!d.beta,
      };
      if (!before) row.source = 'ghoskate';
      const p = await S.store.saveProfile(row);
      S.profile = p;
      S.inv = (await S.store.myInventory().catch(() => [])).map(i => i.item);
      d.ghost = ghostOf(p.ghost); d.pendingSave = false; saveDraft();
      cacheProfile(p, S.inv);
      if (d.news && S.email) S.store.subscribe(S.email, 'ghoskate').catch(() => {});
      if (!before && has('badge:founder')) {
        S.justFounder = true;
        const card = $('#card'); card.classList.add('just-founder'); setTimeout(() => card.classList.remove('just-founder'), 900);
      }
      renderCreate(); updateAcct(); updatePreview();
      toast(before ? t('create.saved') : has('badge:founder') ? t('create.founderT') : t('create.saved'));
    } catch (err) {
      console.error(err);
      d.pendingSave = false; saveDraft();
      if (err.message === 'nickname') { renderCreate(); focusNick(t('create.nickTaken')); }
      else { const m = msgEl || $('#body-b .msg'); if (m) m.textContent = t('create.err.generic'); }
    } finally { S.savingP = null; }
  })();
  return S.savingP;
}

async function refreshAuth() {
  const st = S.store; if (!st) return;
  S.signedIn = await st.signedIn().catch(() => false);
  if (S.signedIn) {
    S.email = await st.email().catch(() => '');
    try {
      const [p, inv, spots] = await Promise.all([st.myProfile(), st.myInventory(), st.mySpots()]);
      S.profile = p; S.inv = inv.map(i => i.item); S.spots = spots; S.offline = false;
    } catch (err) { console.error(err); S.offline = true; }
    if (S.profile) {
      const p = S.profile, d = S.draft;
      Object.assign(d, { nickname: p.nickname, ghost: ghostOf(p.ghost), loadout: { ...DEFAULT_LOADOUT, ...p.loadout }, city: p.city || '', country: p.country || d.country,
        age_group: p.age_group, parent_consent: p.parent_consent, crew_name: p.crew_name || '', beta: p.beta, pendingSave: false });
      saveDraft(); cacheProfile(p, S.inv);
    } else if (S.draft.pendingSave && !S.offline) {
      if (!profileError()) { await ensureSaved(); return; }
      S.draft.pendingSave = false; saveDraft();
    }
  } else { S.email = ''; S.profile = null; S.inv = []; S.spots = []; S.justFounder = false; }
  renderCreate(); updateAcct(); updatePreview({ look: true });
}

/* ---------- prvý spot ---------- */
async function resizePhoto(file, max = 1600, quality = .82) {
  const img = new Image(); img.src = URL.createObjectURL(file); await img.decode();
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}
function scaleEl(key, lo, hi) {
  const sp = S.spot;
  const seg = h('div', { class: 'seg', role: 'group' }, [1, 2, 3, 4, 5].map(n => h('button', { type: 'button', 'aria-pressed': String(sp[key] === n), 'aria-label': t('map.of5', { n }),
    onclick: e => { sp[key] = sp[key] === n ? null : n; seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(sp[key] === i + 1))); } }, String(n))));
  return h('div', { class: 'scale' }, seg, h('div', { class: 'scale-ends', 'aria-hidden': 'true' }, h('span', {}, lo), h('span', {}, hi)));
}
function mySpotsEl() {
  if (!S.spots.length) return null;
  return h('div', { class: 'field' }, t('spot.mine'), h('ul', { class: 'hint', style: 'margin:0;padding-left:18px' },
    S.spots.map(s => h('li', {}, h('b', { style: 'color:var(--cream)' }, s.name), ', ', s.city, ', ', s.approved ? t('spot.approved') : t('spot.pending')))));
}
function renderC() {
  const body = $('#body-c');
  if (S.picker) { S.picker.destroy(); S.picker = null; }
  if (!S.profile) { body.replaceChildren(h('p', {}, t('create.lockedC'))); return; }
  if (S.spotSent) {
    body.replaceChildren(h('p', { class: 'msg ok' }, t('spot.sent')), mySpotsEl() || '',
      h('div', { class: 'actions' }, h('button', { class: 'btn-line', type: 'button', onclick: () => { S.spotSent = false; S.spot = newSpot(); renderC(); } }, t('spot.another'))));
    return;
  }
  S.spot ||= newSpot();
  const sp = S.spot;
  const msg = h('p', { class: 'msg', role: 'alert' });
  const txt = (key, attrs) => { const el = h(attrs.tag || 'input', { ...attrs, tag: null, value: sp[key] }); el.addEventListener('input', () => { sp[key] = el.value; }); return el; };
  const kind = h('div', { class: 'seg', role: 'group', 'aria-label': t('spot.kind') }, KINDS.map(k => h('button', { type: 'button', 'aria-pressed': String(sp.kind === k),
    onclick: e => { sp.kind = k; kind.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, t('spot.kinds')[k])));
  const feats = h('div', { class: 'chips', role: 'group', 'aria-label': t('spot.features') }, FEATURES.map(f => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(sp.features.includes(f)),
    onclick: e => { sp.features = sp.features.includes(f) ? sp.features.filter(x => x !== f) : [...sp.features, f]; e.currentTarget.setAttribute('aria-pressed', String(sp.features.includes(f))); } }, t('spot.feat')[f])));
  const file = h('input', { type: 'file', accept: 'image/*' });
  const prev = h('img', { alt: '', hidden: true, style: 'max-width:180px;margin-top:8px;display:block' });
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) { sp.photo = null; prev.hidden = true; return; } try { sp.photo = await resizePhoto(f); prev.src = URL.createObjectURL(sp.photo); prev.hidden = false; } catch { sp.photo = null; } });
  const mapEl = h('div', { class: 'picker' });
  const status = h('span', {}, sp.point ? t('spot.pinSet') : t('spot.pinNone'));
  const locate = h('button', { class: 'btn-line', type: 'button', onclick: async () => {
    status.textContent = t('spot.locating');
    try { await S.picker.locate(); } catch { status.textContent = t('spot.locateFail'); }
  } }, t('spot.locate'));
  import('../assets/map.js').then(m => m.mountPicker(mapEl, p => { sp.point = p; status.textContent = t('spot.pinSet'); })).then(pk => {
    S.picker = pk;
  }).catch(() => { status.textContent = t('map.fail'); });
  const submit = h('button', { class: 'btn-start', type: 'button', onclick: async () => {
    msg.textContent = '';
    if (!sp.name.trim() || !sp.city.trim()) { msg.textContent = t('spot.req'); return; }
    if (!sp.point) { msg.textContent = t('spot.pinNeeded'); return; }
    submit.disabled = true; submit.textContent = t('spot.sending');
    try {
      await S.store.submitSpot({ name: sp.name.trim(), city: sp.city.trim(), kind: sp.kind, description: sp.description.trim() || null, lat: sp.point.lat, lng: sp.point.lng,
        source: 'ghoskate', difficulty: sp.difficulty, bust: sp.bust, features: sp.features }, sp.photo);
      S.spots = await S.store.mySpots().catch(() => S.spots);
      S.spotSent = true; S.spot = null; renderC(); setGoal('goal-c', true); toast(t('spot.sent'));
      loadStats();
    } catch (err) { console.error(err); msg.textContent = t('spot.err'); submit.disabled = false; submit.textContent = t('spot.submit'); }
  } }, t('spot.submit'));
  body.replaceChildren(
    h('div', { class: 'row2' },
      field(t('spot.name'), txt('name', { type: 'text', maxlength: 60, placeholder: t('spot.namePh') })),
      field(t('spot.city'), txt('city', { type: 'text', maxlength: 40 }))),
    h('div', { class: 'field' }, t('spot.kind'), kind),
    h('div', { class: 'field' }, t('spot.features'), feats),
    h('div', { class: 'row2' },
      h('div', { class: 'field' }, t('spot.difficulty'), scaleEl('difficulty', t('spot.diffLo'), t('spot.diffHi'))),
      h('div', { class: 'field' }, t('spot.bust'), scaleEl('bust', t('spot.bustLo'), t('spot.bustHi')), h('small', {}, t('spot.bustHint')))),
    field(t('spot.desc'), txt('description', { tag: 'textarea', maxlength: 400, rows: 3, placeholder: t('spot.descPh') })),
    h('div', { class: 'field' }, t('spot.photo'), file, prev, h('small', {}, t('spot.photoHint'))),
    h('div', { class: 'field' }, t('spot.pin'), h('small', {}, t('spot.pinHint')), mapEl, h('div', { class: 'picker-bar' }, locate, status)),
    msg, h('div', { class: 'actions' }, submit), mySpotsEl() || '');
}

/* ---------- Founder karta na Instagram story ---------- */
async function downloadCard() {
  const W = 1080, H = 1920, c = h('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  await Promise.all([document.fonts.load('120px Anton'), document.fonts.load('900 60px Archivo')]).catch(() => {});
  x.fillStyle = '#16122B'; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, 980, 40, W / 2, 980, 620); glow.addColorStop(0, 'rgba(212,55,46,.45)'); glow.addColorStop(1, 'rgba(212,55,46,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  const holo = x.createLinearGradient(0, 0, W, H); [['#9ff3ff', 0], ['#ffc6f1', .42], ['#fff2a8', .72], ['#b9ffcf', 1]].forEach(([col, o]) => holo.addColorStop(o, col));
  x.strokeStyle = holo; x.lineWidth = 18; x.strokeRect(60, 60, W - 120, H - 120);
  x.save(); x.translate(110, 330); x.transform(1, 0, -.14, 1, 0, 0);
  x.font = '230px Anton'; x.fillStyle = '#A01D21'; x.fillText('GHOSKATE', 10, 10); x.fillStyle = '#F3EBDD'; x.fillText('GHOSKATE', 0, 0);
  x.restore();
  const svg = await ghostSvg(S.draft.ghost);
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
  x.drawImage(img, W / 2 - 300, 560, 600, 675);
  x.textAlign = 'center'; x.fillStyle = '#F3EBDD';
  let size = 150; const nick = S.draft.nickname.trim();
  do { x.font = `${size}px Anton`; size -= 6; } while (x.measureText(nick).width > W - 220 && size > 60);
  x.fillText(nick, W / 2, 1420);
  x.fillStyle = holo; x.fillRect(W / 2 - 300, 1480, 600, 96);
  x.fillStyle = '#16122B'; x.font = 'italic 900 58px Archivo'; x.fillText(t('create.cardFounder'), W / 2, 1548);
  x.fillStyle = '#ADA5CB'; x.font = '700 40px Archivo';
  x.fillText(location.hostname.endsWith('gosko.sk') ? 'gosko.sk/ghoskate' : 'Instagram @gosko.sk', W / 2, 1720);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const fileObj = new File([blob], 'ghoskate-founder.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [fileObj] })) { await navigator.share({ files: [fileObj], title: 'Ghoskate' }); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  const a = h('a', { href: URL.createObjectURL(blob), download: 'ghoskate-founder.png' }); document.body.append(a); a.click(); a.remove();
}

/* ---------- mapa sveta ---------- */
function mountWorld() {
  const el = $('#world');
  const run = async () => {
    try {
      const [m, spots] = await Promise.all([import('../assets/map.js'), S.store ? S.store.listSpots().catch(() => []) : []]);
      const meter = (label, n) => n ? h('span', { class: 'meter' }, h('span', {}, label), h('span', {}, t('map.of5', { n }))) : null;
      const parks = SKATEPARKS.map(p => ({ lat: p.lat, lng: p.lng, kind: 'park', title: p.name,
        popup: h('div', { class: 'pop' }, h('b', {}, p.name), h('small', {}, [p.area, p.city].filter(Boolean).join(', ')), h('span', {}, t('map.checkin')),
          h('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + p.city)}`, target: '_blank', rel: 'noopener' }, t('map.navigate'))) }));
      const comm = spots.filter(s => !s.pending).map(s => ({ lat: s.lat, lng: s.lng, kind: 'spot', title: s.name,
        popup: h('div', { class: 'pop' }, h('b', {}, s.name), h('small', {}, [s.kind ? t('spot.kinds')[s.kind] || s.kind : '', s.city].filter(Boolean).join(', ')),
          meter(t('spot.difficulty'), s.difficulty), meter(t('spot.bust'), s.bust),
          (s.features || []).length ? h('span', {}, s.features.map(f => t('spot.feat')[f] || f).join(', ')) : null,
          h('a', { href: m.navLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, t('map.navigate'))) }));
      S.map = await m.mountMap(el, [...parks, ...comm]);
    } catch (err) { console.error(err); el.replaceChildren(h('p', { class: 'hint', style: 'padding:16px' }, t('map.fail'))); }
  };
  if (!('IntersectionObserver' in window)) return run();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '400px 0px' });
  io.observe(el);
}

/* ---------- menu: kde práve si ---------- */
function watchMenu() {
  const links = [...document.querySelectorAll('.ps-menu a')];
  const mark = id => links.forEach(a => a.toggleAttribute('aria-current', a.dataset.sec === id));
  const seen = new Map();
  const io = new IntersectionObserver(es => {
    es.forEach(e => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
    const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) {
      mark(best[0]);
      const cur = links.find(a => a.dataset.sec === best[0]);
      const bar = cur?.parentElement;
      if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: cur.offsetLeft - 16, behavior: REDUCED ? 'auto' : 'smooth' });
    }
  }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, .01, .2, .5] });
  document.querySelectorAll('.content .sec').forEach(s => io.observe(s));
}

async function loadStats() {
  try {
    const s = await S.store.ghoskateStats();
    const spots = (s?.spots_live || 0) + SKATEPARKS.length;
    $('#st-f').textContent = String(s?.founders || 0); $('#st-s').textContent = String(spots);
    $('#stats').hidden = !(s?.founders > 0);
  } catch { /* čísla sú len ozdoba */ }
}

/* ---------- štart ---------- */
(async function start() {
  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.lang; LS.set('ghoskate:lang', lang);
    const u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null, '', u);
    applyLang();
  }));
  applyLang();
  startHero(); startPreview(); watchMenu();
  const back = /access_token=|error_description=/.test(location.hash) || /[?&]code=/.test(location.search);
  const err = back ? new URLSearchParams(location.hash.replace(/^#/, '')).get('error_description') : null;
  S.store = await getStore(CONFIG);
  if (back) {
    await S.store.signedIn().catch(() => false);
    const u = new URL(location.href); u.hash = 'vytvor'; u.searchParams.delete('code'); history.replaceState(null, '', u);
    if (err) setTimeout(() => toast(t('create.err.expired')), 600);
    requestAnimationFrame(() => $('#vytvor').scrollIntoView());
  }
  S.store.onAuth(async () => { const now = await S.store.signedIn().catch(() => false); if (now !== S.signedIn) refreshAuth(); });
  await refreshAuth();
  loadStats();
  mountWorld();
})();
