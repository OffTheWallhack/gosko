/* DOM pomocníci hernej časti: h() ako v app.js, herný shell (spodné menu), toasty a ikony. */
import { T } from './i18n-sk.js';
import { GAME_MENU, prefersReducedMotion } from './logic.js';

export function h(tag, props, ...kids) {
  const svg = tag.startsWith('svg:');
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), sv);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k instanceof Node ? k : String(k)); }
  return el;
}

/* Ikony: jednoduché SVG cesty, farba = currentColor. */
const PATHS = {
  map: 'M9 3 3 5.5v15.5l6-2.5 6 2.5 6-2.5V3l-6 2.5L9 3Zm0 2.2 6 2.5v11.1l-6-2.5V5.2Z',
  feed: 'M4 4h16v12H4V4Zm2 2v8h12V6H6Zm-2 12h16v2H4v-2Zm6.5-10.5 4.5 2.5-4.5 2.5v-5Z',
  crew: 'M8 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6H2Zm13.4 0c0-2-.7-3.9-2-5.3.8-.4 1.7-.7 2.6-.7 2.8 0 5 2.2 5 5v1h-5.6Z',
  board: 'M4 20V10h4v10H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z',
  loadout: 'M6.5 3.5c-1.5 0-2.5 1.2-2.5 2.6v11.8c0 1.4 1 2.6 2.5 2.6h11c1.5 0 2.5-1.2 2.5-2.6V6.1c0-1.4-1-2.6-2.5-2.6h-11ZM7 7h2v2H7V7Zm8 0h2v2h-2V7Zm-8 8h2v2H7v-2Zm8 0h2v2h-2v-2Z',
  locate: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-1-6h2v3.1A7 7 0 0 1 18.9 11H22v2h-3.1A7 7 0 0 1 13 18.9V22h-2v-3.1A7 7 0 0 1 5.1 13H2v-2h3.1A7 7 0 0 1 11 5.1V2Zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
  skull: 'M12 2C6.5 2 3 5.8 3 10.5c0 2.9 1.4 5 3.5 6.2V20a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3.3c2.1-1.2 3.5-3.3 3.5-6.2C21 5.8 17.5 2 12 2Zm-3.5 7.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 14l1.3 2.2h-2.6L12 14Z',
  loot: 'M4 9h16v3H4V9Zm1 4h14v8H5v-8Zm6-4h2v12h-2V9ZM8.5 3.5C10 3.5 11.3 5 12 7c.7-2 2-3.5 3.5-3.5a2 2 0 0 1 0 4h-7a2 2 0 0 1 0-4Z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
};
export const icon = (name, cls = 'g-ico') => h('svg:svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
  h('svg:path', { d: PATHS[name], 'fill-rule': 'evenodd' }));

/* Herný shell: obsah + spodné menu MAPA · FEED · CREW · REBRÍČEK · LOADOUT. Vráti { view, body }. */
export function gameShell(root, active) {
  document.body.classList.add('game-mode');
  const body = h('div', { class: 'g-body' });
  const menu = h('nav', { class: 'g-menu', 'aria-label': T.menu.label },
    GAME_MENU.map(m => h('a', { href: m.href, class: 'g-menu-item', 'data-game-nav': m.id, 'aria-current': m.id === active ? 'page' : null },
      icon(m.id), h('span', {}, m.label))));
  const view = h('section', { class: 'g-view', 'data-game': active }, body, menu);
  root.append(view);
  return { view, body };
}
export const leaveGame = () => document.body.classList.remove('game-mode');

/* Toast: text sa ukáže a zmizne. kind: 'ok' | 'err'. Vráti element. */
export function toast(text, { kind = 'ok', ms = 4200 } = {}) {
  const host = document.querySelector('.g-toasts') || document.body.appendChild(h('div', { class: 'g-toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: `g-toast g-toast-${kind}` }, text);
  host.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  return el;
}

/* Achievement: holo nálepka s duchom GOSko. S reduced motion bez animácie. */
export function achievement(title, body) {
  const host = document.querySelector('.g-toasts') || document.body.appendChild(h('div', { class: 'g-toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: `g-ach${prefersReducedMotion() ? ' still' : ''}` },
    h('div', { class: 'g-ach-in' }, h('img', { src: 'img/logo.webp', alt: '', width: 48, height: 51 }),
      h('div', {}, h('strong', { class: 'wide' }, title), h('span', {}, body))));
  host.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 6000);
  return el;
}

/* Lebky 1 až 5 (filled plných). */
export const skullRow = filled => h('span', { class: 'g-skulls', 'aria-hidden': 'true' },
  [1, 2, 3, 4, 5].map(i => icon('skull', `g-skull${i <= filled ? ' on' : ''}`)));
