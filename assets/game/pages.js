/* Ďalšie herné stránky: REBRÍČEK crews (crew_leaderboard, vlastná crew zvýraznená)
   a potvrdenie súhlasu rodiča s hrou (#/hra/potvrdene, presmerovanie z /api/consent). */
import { T } from './i18n-sk.js';
import { gameApi } from './auth.js';
import { loadGameCss } from './map.js';
import { gameShell, h, leaveGame } from './ui.js';

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export async function pageCrewBoard(root, ctx) {
  const { body } = gameShell(root, 'board');
  await loadGameCss();
  const listEl = h('ol', { class: 'g-board' }, h('li', { class: 'g-hint' }, T.hud.loadingList));
  body.append(h('div', { class: 'g-page' },
    h('header', { class: 'g-page-head' }, h('h1', { class: 'wide' }, T.board.title), h('p', {}, T.board.lead)),
    listEl,
    h('p', {}, h('a', { class: 'g-btn g-btn-ghost', href: '#/rebricek' }, T.board.ranking))));
  const api = gameApi(ctx.store, ctx.apiBase);
  let rows = [], mine = null;
  try {
    [rows, mine] = api ? await Promise.all([api.leaderboard(), api.me().then(me => (me ? api.myCrew() : null)).catch(() => null)]) : [[], null];
  } catch (err) { console.error(err); listEl.replaceChildren(h('li', { class: 'g-msg err' }, T.hud.loadFailed)); return leaveGame; }
  listEl.replaceChildren(...(rows.length ? rows.map(r => h('li', { class: `g-board-row${mine?.id === r.crew_id ? ' mine' : ''}`, 'aria-label': mine?.id === r.crew_id ? T.crew.mine : null },
    h('span', { class: 'g-board-rank wide' }, r.rank),
    h('span', { class: 'g-crewtag', style: { '--crew': COLOR_RE.test(r.color || '') ? r.color : '#F3EBDD' } }, r.tag),
    h('span', { class: 'g-board-name' }, h('strong', {}, r.name), h('small', {}, `${T.board.members(r.members)} · ${T.board.spots(r.spots_controlled)}`)),
    h('span', { class: 'g-board-pts wide' }, T.board.points(r.points)))) : [h('li', { class: 'g-hint' }, T.board.empty)]));
  return leaveGame;
}

export async function pageGameConsentDone(root) {
  const { body } = gameShell(root, '');
  await loadGameCss();
  body.append(h('div', { class: 'g-page' }, h('article', { class: 'g-holo g-profile' }, h('div', { class: 'g-holo-in' },
    h('img', { src: 'img/logo.webp', alt: '', width: 72, height: 77, class: 'g-ghost' }),
    h('h1', { class: 'g-holo-name wide' }, T.consentDone.title), h('p', {}, T.consentDone.body),
    h('div', { class: 'g-actions' }, h('a', { class: 'g-btn g-btn-in', href: '#/hra' }, T.consentDone.cta))))));
  return leaveGame;
}
