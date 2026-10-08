/* Herná mapa (#/hra, #/hra/spot/:id): MapLibre GL (assets/vendor, bez CDN) s tmavými dlaždicami OpenFreeMap.
   Piny zo spot_summary: farba a TAG crew, pulz podľa ľudí na spote, ikona lootu. Detail spotu je holo karta
   (spot.js), check-in cez GPS (checkin.js), nový spot dlhým podržaním na mape.
   Keď sa mapový štýl nenačíta (offline, blokované dlaždice), piny a karta fungujú ďalej; bez WebGL sa
   ukáže zoznam spotov. Mapa sa načíta až na tejto stránke (dynamický import, ~1 MB). */
import { T } from './i18n-sk.js';
import { OBSTACLES, SPOT_KINDS, isActiveCheckin, pinsFromSummary, prefersReducedMotion, validateNewSpot } from './logic.js';
import { gameApi, loadPlayer, rememberReturn, currentRoute, routeUrl } from './auth.js';
import { doCheckIn, doCheckOut, currentPosition } from './checkin.js';
import { spotSheet } from './spot.js';
import { clipSheet } from './clips.js';
import { clipList } from './feed.js';
import { achievement, gameShell, h, icon, leaveGame, toast } from './ui.js';
import { loadCss } from '../qr.js';
import { UserError } from '../util.js';

const MAPLIBRE = 'assets/vendor/maplibre-gl-6.12.0/';
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const BRATISLAVA = [17.1077, 48.1486];
const LONG_PRESS_MS = 550;

export const loadGameCss = () => loadCss('assets/game/game.css');
async function loadMapLibre() {
  await loadCss(MAPLIBRE + 'maplibre-gl.css');
  return import('../vendor/maplibre-gl-6.12.0/maplibre-gl.mjs');
}

const userMessage = err => (err instanceof UserError ? err.message : T.err.UNKNOWN);

function pinEl(pin, here) {
  const el = h('button', {
    type: 'button', class: `g-pin${pin.tag ? ' crew' : ''}${pin.loot ? ' loot' : ''}${here ? ' is-here' : ''}`,
    'data-spot-id': pin.id, 'data-pulse': pin.pulse, 'aria-label': pin.label,
    style: pin.color ? { '--pin': pin.color } : null,
  },
  pin.pulse > 0 && h('span', { class: 'g-ring', 'aria-hidden': 'true' }),
  h('span', { class: 'g-drop', 'aria-hidden': 'true' }),
  pin.tag && h('span', { class: 'g-pin-tag', 'aria-hidden': 'true' }, pin.tag),
  pin.people > 0 && h('span', { class: 'g-pin-count', 'aria-hidden': 'true' }, pin.people),
  pin.loot && h('span', { class: 'g-pin-loot', 'aria-hidden': 'true' }, icon('loot')));
  return el;
}

const eventPinEl = ev => h('a', { class: 'g-pin g-pin-event', href: `#/event/${ev.id}`, 'aria-label': `${T.pin.event}: ${ev.name}` },
  h('span', { class: 'g-drop', 'aria-hidden': 'true' }), h('span', { class: 'g-pin-tag', 'aria-hidden': 'true' }, 'GOSko'));

/* Formulár nového spotu v sheete. onSubmit(value) vráti Promise. */
function newSpotSheet(host, { lngLat, city, onSubmit, onClose }) {
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  const field = (label, input, err) => h('label', { class: 'g-field', 'data-field': err }, h('span', {}, label), input);
  const name = h('input', { name: 'name', maxlength: 60, required: true, placeholder: T.newSpot.namePh, autocomplete: 'off' });
  const kind = h('select', { name: 'kind' }, SPOT_KINDS.map(k => h('option', { value: k }, T.kinds[k])));
  const cityIn = h('input', { name: 'city', maxlength: 40, required: true, autocomplete: 'address-level2' });
  cityIn.value = city || '';
  const note = h('textarea', { name: 'note', rows: 2, maxlength: 300, placeholder: T.newSpot.notePh });
  const obstacles = h('fieldset', { class: 'g-chips g-obstacles' }, h('legend', {}, T.newSpot.obstacles),
    OBSTACLES.map(o => h('label', { class: 'g-chip' }, h('input', { type: 'checkbox', name: 'obstacles', value: o }), h('span', {}, T.obstacles[o]))));
  const submit = h('button', { class: 'g-btn g-btn-in', type: 'submit' }, T.newSpot.submit);
  const form = h('form', { class: 'g-form', novalidate: true },
    h('h2', { class: 'wide g-form-title' }, T.newSpot.title), h('p', { class: 'g-hint' }, T.newSpot.intro),
    h('p', { class: 'g-coords cond' }, T.newSpot.where(lngLat.lat, lngLat.lng)),
    field(T.newSpot.name, name, 'name'), field(T.newSpot.kind, kind, 'kind'), field(T.newSpot.city, cityIn, 'city'),
    obstacles, field(T.newSpot.note, note, 'note'), msg,
    h('div', { class: 'g-actions' }, submit, h('button', { class: 'g-btn g-btn-ghost', type: 'button', onclick: () => onClose() }, T.newSpot.cancel)));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const { errors, value } = validateNewSpot({ name: name.value, kind: kind.value, city: cityIn.value, note: note.value,
      obstacles: [...form.querySelectorAll('input[name=obstacles]:checked')].map(i => i.value) });
    const first = Object.values(errors)[0];
    if (first) { msg.textContent = first; return; }
    submit.disabled = true;
    try { await onSubmit({ ...value, p_lat: +lngLat.lat.toFixed(6), p_lng: +lngLat.lng.toFixed(6) }); }
    catch (err) { msg.textContent = userMessage(err); }
    finally { submit.disabled = false; }
  });
  const sheet = h('div', { class: 'g-sheet g-sheet-form', role: 'dialog', 'aria-label': T.newSpot.title },
    h('button', { class: 'g-x', type: 'button', 'aria-label': T.newSpot.cancel, onclick: () => onClose() }, icon('close')), form);
  host.append(sheet);
  requestAnimationFrame(() => { sheet.classList.add('open'); name.focus({ preventScroll: true }); });
  return { el: sheet, close() { sheet.remove(); } };
}

/* ctx: { store, login(after), go(hash), setOnAuth(fn|null), events, apiBase } */
export async function pageGameMap(root, ctx, spotId = null) {
  const { body } = gameShell(root, 'map');
  await loadGameCss();
  const api = gameApi(ctx.store, ctx.apiBase);
  if (!api) {
    body.append(h('div', { class: 'g-page' }, h('p', { class: 'g-msg err' }, T.hud.noServer)));
    return leaveGame;
  }
  const reduced = prefersReducedMotion();
  const mapEl = h('div', { class: 'g-map', role: 'region', 'aria-label': T.hud.mapLabel });
  const hud = h('div', { class: 'g-hud' });
  const banner = h('div', { class: 'g-banner-slot' });
  const note = h('p', { class: 'g-note', role: 'status', hidden: true });
  const list = h('ul', { class: 'g-list', hidden: true });
  body.append(mapEl, hud, banner, note, list);

  const S = { player: { mode: 'anon', me: null, signedIn: false }, cfg: null, open: null, rows: [], markers: [], sheet: null, sheetId: null, myRating: null, map: null, ml: null, temp: null, destroyed: false };
  const rowById = id => S.rows.find(r => r.id === id);
  // dve nezávislé poznámky: chyba dát (spot_summary) a chyba mapového podkladu
  const notes = { data: '', map: '' };
  const showNote = (kind, text) => { notes[kind] = text; note.textContent = notes.data || notes.map; note.hidden = !note.textContent; };

  function renderHud() {
    const { mode, me } = S.player;
    const chip = mode === 'anon'
      ? h('button', { class: 'g-chip-player anon', type: 'button', onclick: () => login() }, T.hud.login)
      : h('a', { class: `g-chip-player ${mode}`, href: '#/hra/profil' }, me ? `@${me.username}` : T.hud.profile,
        S.open && h('small', {}, `${T.hud.checkedHere} · ${rowById(S.open.spot_id)?.name || ''}`));
    hud.replaceChildren(chip, h('div', { class: 'g-hud-right' },
      h('a', { class: 'g-round', href: '#/spoty', title: T.hud.list, 'aria-label': T.hud.list }, icon('board')),
      h('button', { class: 'g-round', type: 'button', title: T.hud.locate, 'aria-label': T.hud.locate, onclick: locate }, icon('locate'))));
    banner.replaceChildren();
    if (mode === 'browse') {
      const resend = h('button', { class: 'g-btn g-btn-small', type: 'button' }, T.banner.resend);
      resend.addEventListener('click', async () => {
        resend.disabled = true;
        try { await api.resendGuardian(); toast(T.banner.resent); } catch (err) { toast(userMessage(err), { kind: 'err' }); } finally { resend.disabled = false; }
      });
      banner.append(h('div', { class: 'g-banner tape', role: 'note' }, h('strong', { class: 'wide' }, T.banner.browseTitle), h('p', {}, T.banner.browse), resend));
    } else if (mode === 'onboarding') {
      banner.append(h('div', { class: 'g-banner', role: 'note' }, h('strong', { class: 'wide' }, T.banner.onboardingTitle), h('p', {}, T.banner.onboarding),
        h('a', { class: 'g-btn g-btn-small', href: '#/hra/profil' }, T.banner.onboardingCta)));
    }
  }

  function renderPins() {
    S.markers.forEach(m => m.remove());
    S.markers = [];
    const pins = pinsFromSummary(S.rows, { reducedMotion: reduced });
    const hereId = S.open?.spot_id;
    if (S.map) {
      for (const p of pins) {
        const el = pinEl(p, p.id === hereId);
        el.addEventListener('click', e => { e.stopPropagation(); openSpot(p.id); });
        S.markers.push(new S.ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(S.map));
      }
      for (const ev of ctx.events || []) {
        if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) continue;
        S.markers.push(new S.ml.Marker({ element: eventPinEl(ev), anchor: 'bottom' }).setLngLat([ev.lng, ev.lat]).addTo(S.map));
      }
    } else {
      // bez WebGL: zoznam spotov namiesto mapy
      list.hidden = false;
      list.replaceChildren(...[...pins].reverse().map(p => h('li', {}, h('button', { type: 'button', class: 'g-list-item', 'data-spot-id': p.id, onclick: () => openSpot(p.id) },
        h('span', { class: 'g-list-dot', style: p.color ? { '--pin': p.color } : null }), h('span', {}, p.label)))));
    }
  }

  async function refresh() {
    S.player = await loadPlayer(api);
    S.open = null;
    if (S.player.me) {
      try { const o = await api.openCheckin(); S.open = isActiveCheckin(o, Date.now(), S.cfg.checkin_max_minutes) ? o : null; } catch (err) { console.error(err); }
    }
    try { S.rows = await api.summary(); showNote('data', ''); } catch (err) { console.error(err); showNote('data', T.hud.loadFailed); }
    if (S.destroyed) return;
    renderHud();
    renderPins();
    if (S.sheet && S.sheetId) {
      const row = rowById(S.sheetId);
      if (row) S.sheet.update(sheetState(row)); else closeSheet();
    }
  }

  const sheetState = row => ({ row, mode: S.player.mode, here: S.open?.spot_id === row.id, myRating: S.myRating });

  function login() {
    rememberReturn(currentRoute());
    ctx.login(async () => {
      await refresh();
      if (S.player.mode === 'onboarding') ctx.go('#/hra/profil');
    });
  }

  function closeSheet() {
    S.sheet?.close(); S.sheet = null; S.sheetId = null;
    S.temp?.remove(); S.temp = null;
    if (/^#\/hra\/spot\//.test(currentRoute())) history.replaceState(null, '', routeUrl('#/hra'));
  }

  async function openSpot(id) {
    const row = rowById(id);
    if (!row) return;
    closeSheet();
    S.sheetId = id;
    S.myRating = null;
    history.replaceState(null, '', routeUrl(`#/hra/spot/${id}`));
    if (S.map) S.map[reduced ? 'jumpTo' : 'easeTo']({ center: [row.lng, row.lat], zoom: Math.max(S.map.getZoom(), 15), offset: [0, -120] });
    S.sheet = spotSheet(body, {
      ...sheetState(row),
      slots: [clipsSlot(row)],
      onClose: closeSheet,
      onLogin: login,
      onProfile: () => ctx.go('#/hra/profil'),
      onCheckIn: async btn => {
        btn.disabled = true; btn.textContent = T.spot.checking;
        try {
          const res = await doCheckIn(api, row);
          toast(res.message);
          if (res.first) achievement(T.achievement.first, T.achievement.firstBody(row.name));
          await refresh();
        } catch (err) {
          if (!(err instanceof UserError)) console.error(err);
          S.sheet?.message(userMessage(err), 'err');
          if (btn.isConnected) { btn.disabled = false; btn.textContent = T.spot.checkIn; }
        }
      },
      onCheckOut: async btn => {
        btn.disabled = true;
        try { toast((await doCheckOut(api)).message); await refresh(); }
        catch (err) { S.sheet?.message(userMessage(err), 'err'); if (btn.isConnected) btn.disabled = false; }
      },
      onRate: async n => {
        try { await api.rateSpot(id, n); S.myRating = n; toast(T.spot.rated(n)); await refresh(); }
        catch (err) { S.sheet?.message(userMessage(err), 'err'); }
      },
      onReport: async (status, bust, btn) => {
        btn.disabled = true;
        try { await api.reportSpot(id, status, bust); toast(T.spot.reportSent); await refresh(); }
        catch (err) { S.sheet?.message(userMessage(err), 'err'); if (btn.isConnected) btn.disabled = false; }
      },
    });
    if (S.player.mode === 'play') {
      api.myRating(id).then(v => { if (S.sheetId === id && v) { S.myRating = v; S.sheet?.update({ myRating: v }); } }).catch(() => {});
    }
  }

  /* Klipy zo spotu na karte: zoznam (clips_public) a tlačidlo Pridať klip (hráč so súhlasmi, 016). */
  function clipsSlot(row) {
    const { mode, me } = S.player;
    const list = clipList(api, { spotId: row.id, player: S.player, empty: T.feed.spotEmpty, limit: 6 });
    const canPublish = mode === 'play' && me?.can_publish;
    const head = h('div', { class: 'g-spot-sec-head' }, h('h3', { class: 'g-label' }, T.feed.spotTitle),
      canPublish && h('button', { class: 'g-btn g-btn-small', type: 'button', onclick: () => openClipForm(row) }, T.clips.add));
    const note = mode === 'play' && !canPublish ? h('p', { class: 'g-hint' }, T.clips.needConsent, ' ', h('a', { href: '#/hra/profil' }, T.hud.profile)) : null;
    list.load();
    return h('section', { class: 'g-spot-clips' }, head, note, list.el);
  }

  function openClipForm(row) {
    closeSheet();
    history.replaceState(null, '', routeUrl(`#/hra/spot/${row.id}`));
    const form = clipSheet(body, {
      spot: row, api, me: S.player.me, cfg: S.cfg,
      onClose: () => { form.close(); S.sheet = null; openSpot(row.id); },
      onDone: async res => {
        form.close(); S.sheet = null;
        toast(res.verified ? T.clips.doneVerified : T.clips.done);
        await refresh();
        openSpot(row.id);
      },
    });
    S.sheet = { close: () => form.close(), update() {}, message() {} };
    S.sheetId = null;
  }

  function addSpotAt(lngLat) {
    const { mode, me } = S.player;
    if (mode === 'anon') return login();
    if (mode === 'onboarding') return ctx.go('#/hra/profil');
    if (mode === 'browse') return toast(T.err.NEED_GUARDIAN, { kind: 'err' });
    closeSheet();
    if (S.map) S.temp = new S.ml.Marker({ element: h('span', { class: 'g-pin g-pin-new', 'aria-hidden': 'true' }, h('span', { class: 'g-drop' })), anchor: 'bottom' })
      .setLngLat(lngLat).addTo(S.map);
    const form = newSpotSheet(body, {
      lngLat, city: me?.city,
      onClose: closeSheet,
      onSubmit: async v => {
        const { id } = await api.addSpot(v);
        toast(T.newSpot.done);
        closeSheet();
        await refresh();
        openSpot(id);
      },
    });
    S.sheet = { close: () => form.close(), update() {}, message() {} };
    S.sheetId = null;
  }

  /* Prvý pohľad: všetky spoty v zábere, mimo HUD hore a menu dole. */
  function fitToSpots() {
    const pts = S.rows.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    if (!pts.length) return;
    const lng = pts.map(r => r.lng), lat = pts.map(r => r.lat);
    S.map.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]],
      { padding: { top: 150, bottom: 60, left: 50, right: 70 }, maxZoom: 14, duration: 0 });
  }

  async function locate() {
    try {
      const p = await currentPosition();
      if (S.map) S.map[reduced ? 'jumpTo' : 'flyTo']({ center: [p.lng, p.lat], zoom: 15 });
    } catch (err) { toast(userMessage(err), { kind: 'err' }); }
  }

  /* dlhé podržanie (dotyk aj myš) alebo pravé tlačidlo = nový spot */
  function wireLongPress(map) {
    let timer = null, start = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const canvas = map.getCanvasContainer();
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.g-pin')) return;
      start = { x: e.clientX, y: e.clientY };
      cancel();
      timer = setTimeout(() => {
        timer = null;
        const r = canvas.getBoundingClientRect();
        addSpotAt(map.unproject([start.x - r.left, start.y - r.top]));
      }, LONG_PRESS_MS);
    });
    canvas.addEventListener('pointermove', e => { if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, cancel);
    map.on('movestart', cancel);
    map.on('contextmenu', e => {
      cancel();
      if (e.originalEvent?.target?.closest?.('.g-pin')) return;
      e.originalEvent?.preventDefault();
      addSpotAt(e.lngLat);
    });
  }

  // mapa: chyba knižnice alebo WebGL = zoznam; chyba štýlu alebo dlaždíc = poznámka, piny ostávajú
  try {
    S.ml = await loadMapLibre();
    if (S.destroyed) return () => {};
    S.map = new S.ml.Map({
      container: mapEl, style: STYLE_URL, center: BRATISLAVA, zoom: 12, pitch: 45, maxPitch: 60,
      attributionControl: { compact: true }, fadeDuration: reduced ? 0 : 300,
    });
    let styleFailed = false;
    S.map.on('error', e => {
      console.warn('[mapa]', e?.error?.message || e);
      if (!styleFailed && !S.map.isStyleLoaded()) { styleFailed = true; showNote('map', T.hud.mapFailed); }
    });
    S.map.on('click', () => { if (S.sheet && S.sheetId) closeSheet(); });
    wireLongPress(S.map);
  } catch (err) {
    console.error(err);
    S.map = null;
    mapEl.hidden = true;
  }

  S.cfg = await api.cfg();
  await refresh();
  if (S.map && !spotId && S.rows.length) fitToSpots();
  if (spotId) openSpot(spotId);
  else if (S.player.mode === 'play') {
    try { if (!localStorage.getItem('gosko:game-hint')) { toast(T.hud.longPressHint, { ms: 6000 }); localStorage.setItem('gosko:game-hint', '1'); } } catch { /* bez úložiska */ }
  }
  ctx.setOnAuth(() => refresh());

  return () => {
    S.destroyed = true;
    ctx.setOnAuth(null);
    closeSheet();
    try { S.map?.remove(); } catch { /* už zrušená */ }
    leaveGame();
  };
}
