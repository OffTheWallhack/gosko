/* Detail spotu: bottom sheet s holo kartou (chróm rám, lebky 1 až 5, bust meter, stav, turf, loot).
   Náklon karty: myš alebo DeviceOrientation (iOS potrebuje povolenie tlačidlom). Reduced motion = bez náklonu. */
import { T } from './i18n-sk.js';
import { bustLevel, peopleLabel, prefersReducedMotion, skullsFilled, statusLabel } from './logic.js';
import { h, icon, skullRow } from './ui.js';
import { safeUrl } from '../util.js';

const navLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Náklon: --rx/--ry (stupne) a --mx/--my (pozícia odlesku). Vráti funkciu na odpojenie. */
export function attachTilt(card, { win = window } = {}) {
  if (prefersReducedMotion(win)) return { detach() {}, needsPermission: false, enable: async () => false };
  const set = (x, y) => {   // x, y v rozsahu -1 až 1
    card.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`);
    card.style.setProperty('--mx', `${(50 + x * 40).toFixed(1)}%`);
    card.style.setProperty('--my', `${(50 + y * 40).toFixed(1)}%`);
  };
  const onMove = e => {
    if (e.pointerType === 'touch') return;
    const r = card.getBoundingClientRect();
    set(clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1));
  };
  const onLeave = () => set(0, 0);
  const onOrient = e => { if (e.gamma == null || e.beta == null) return; set(clamp(e.gamma / 30, -1, 1), clamp((e.beta - 45) / 30, -1, 1)); };
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerleave', onLeave);
  const DOE = win.DeviceOrientationEvent;
  const needsPermission = typeof DOE?.requestPermission === 'function';
  let listening = false;
  const listen = () => { if (!listening) { win.addEventListener('deviceorientation', onOrient); listening = true; } };
  if (DOE && !needsPermission) listen();
  return {
    needsPermission,
    async enable() {
      try { if ((await DOE.requestPermission()) === 'granted') { listen(); return true; } } catch { /* zamietnuté */ }
      return false;
    },
    detach() {
      card.removeEventListener('pointermove', onMove);
      card.removeEventListener('pointerleave', onLeave);
      if (listening) win.removeEventListener('deviceorientation', onOrient);
    },
  };
}

function bustMeter(bust) {
  const lvl = bustLevel(bust);
  return h('div', { class: 'g-bust', 'data-level': lvl, role: 'img', 'aria-label': `${T.spot.bust} ${bust ? T.bust[bust] : T.spot.bustNone}` },
    h('span', { class: 'g-bust-bar', 'aria-hidden': 'true' }, [1, 2, 3].map(i => h('i', { class: i <= lvl ? 'on' : '' }))),
    h('span', { class: 'g-bust-txt' }, bust ? T.bust[bust] : T.spot.bustNone));
}

/* Vytvorí sheet v host (g-view). opts: { row, mode, here, myRating, onCheckIn, onCheckOut, onLogin, onProfile, onRate, onReport, onClose } */
export function spotSheet(host, opts) {
  let tilt = null;
  const sheet = h('div', { class: 'g-sheet', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'g-spot-name' });
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  host.append(sheet);

  function render(o) {
    tilt?.detach();
    const r = o.row;
    const filled = skullsFilled(r.skulls);
    const photo = safeUrl(r.photo_url);
    const card = h('article', { class: `g-holo${r.loot_active ? ' has-loot' : ''}` },
      h('div', { class: 'g-holo-in' },
        h('div', { class: 'g-holo-top' },
          h('span', { class: 'g-sticker' }, T.kinds[r.kind] || r.kind || T.kinds.ine),
          r.city && h('span', { class: 'g-holo-city cond' }, r.city),
          r.people_now > 0 && h('span', { class: 'g-live' }, h('i', { 'aria-hidden': 'true' }), peopleLabel(r.people_now))),
        h('h2', { class: 'g-holo-name wide', id: 'g-spot-name' }, r.name),
        r.needs_verification && h('p', { class: 'g-holo-note' }, T.spot.verify),
        photo && h('img', { class: 'g-holo-photo', src: photo, alt: '', loading: 'lazy' }),
        r.description && h('p', { class: 'g-holo-desc' }, r.description),
        h('dl', { class: 'g-stats' },
          h('div', {}, h('dt', {}, T.spot.skulls), h('dd', { 'aria-label': `${T.spot.skulls} ${filled} z 5` }, skullRow(filled),
            h('small', {}, r.ratings ? T.spot.ratings(r.ratings) : T.spot.skullsNone))),
          h('div', {}, h('dt', {}, T.spot.bust), h('dd', {}, bustMeter(r.bust))),
          h('div', {}, h('dt', {}, T.spot.status), h('dd', {}, h('span', { class: `g-status${r.status ? '' : ' none'}` }, statusLabel(r.status) || T.spot.statusNone))),
          h('div', {}, h('dt', {}, T.spot.control), h('dd', {}, r.control_tag
            ? h('span', { class: 'g-crewtag', style: { '--crew': /^#[0-9a-f]{6}$/i.test(r.control_color || '') ? r.control_color : '#F3EBDD' } }, T.spot.controlBy(r.control_tag, r.control_points))
            : h('span', { class: 'g-status none' }, T.spot.controlNone)))),
        r.loot_active && h('div', { class: 'g-loot' }, icon('loot'), h('div', {}, h('strong', { class: 'wide' }, T.spot.loot), h('span', {}, T.spot.lootHint)))));

    const actions = h('div', { class: 'g-actions' });
    if (o.mode === 'play' && o.here) {
      actions.append(h('p', { class: 'g-here' }, T.spot.flipped),
        h('button', { class: 'g-btn g-btn-out', type: 'button', onclick: e => o.onCheckOut(e.currentTarget) }, T.spot.checkOut));
    } else {
      const cb = h('button', { class: 'g-btn g-btn-in', type: 'button', disabled: o.mode === 'browse' }, T.spot.checkIn);
      cb.addEventListener('click', () => (o.mode === 'anon' ? o.onLogin() : o.mode === 'onboarding' ? o.onProfile() : o.onCheckIn(cb)));
      actions.append(cb);
      if (o.mode === 'browse') actions.append(h('p', { class: 'g-msg warn' }, T.err.NEED_GUARDIAN));
    }
    actions.append(h('a', { class: 'g-btn g-btn-ghost', href: navLink(r.lat, r.lng), target: '_blank', rel: 'noopener' }, T.spot.navigate));

    const extra = [];
    if (o.mode === 'play') {
      extra.push(h('div', { class: 'g-rate' }, h('span', { class: 'g-label' }, T.spot.rate),
        h('div', { class: 'g-rate-row' }, [1, 2, 3, 4, 5].map(n => h('button', {
          type: 'button', class: `g-rate-btn${o.myRating >= n ? ' on' : ''}`, 'aria-label': T.spot.rateStar(n), 'aria-pressed': String(o.myRating === n),
          onclick: () => o.onRate(n),
        }, icon('skull'))))));
      if (o.here) extra.push(reportForm(o));
      else extra.push(h('p', { class: 'g-hint' }, T.spot.reportHint));
    }

    const tiltBtn = h('button', { class: 'linklike g-tilt', type: 'button', hidden: true }, T.spot.tiltOn);
    sheet.replaceChildren(
      h('button', { class: 'g-x', type: 'button', 'aria-label': T.spot.close, onclick: () => o.onClose() }, icon('close')),
      card, msg, actions, ...extra, tiltBtn);
    tilt = attachTilt(card);
    // povolenie pýta iOS Safari; na počítači (myš) je náklon myšou a tlačidlo netreba
    if (tilt.needsPermission && window.matchMedia?.('(pointer: coarse)').matches) {
      tiltBtn.hidden = false;
      tiltBtn.addEventListener('click', async () => { if (await tilt.enable()) tiltBtn.hidden = true; });
    }
  }

  function reportForm(o) {
    let status = null, bust = null;
    const pick = (group, val, btn) => {
      btn.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn && b.getAttribute('aria-pressed') !== 'true')));
      const on = btn.getAttribute('aria-pressed') === 'true';
      if (group === 'status') status = on ? val : null; else bust = on ? val : null;
      send.disabled = !status && !bust;
    };
    const chips = (group, labels) => h('div', { class: 'g-chips', role: 'group', 'aria-label': group === 'status' ? T.spot.status : T.spot.bust },
      Object.entries(labels).map(([val, label]) => h('button', { type: 'button', class: `g-chip g-chip-${group}`, 'data-val': val, 'aria-pressed': 'false', onclick: e => pick(group, val, e.currentTarget) }, label)));
    const send = h('button', { class: 'g-btn g-btn-small', type: 'button', disabled: true, onclick: () => o.onReport(status, bust, send) }, T.spot.report);
    return h('div', { class: 'g-report' }, h('span', { class: 'g-label' }, T.spot.status), chips('status', T.status),
      h('span', { class: 'g-label' }, T.spot.bust), chips('bust', T.bust), send);
  }

  render(opts);
  requestAnimationFrame(() => sheet.classList.add('open'));
  return {
    el: sheet,
    update(next) { opts = { ...opts, ...next }; render(opts); },
    message(text, kind = '') { msg.textContent = text; msg.className = `g-msg ${kind}`; },
    close() { tilt?.detach(); sheet.remove(); },
  };
}
