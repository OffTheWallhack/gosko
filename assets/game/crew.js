/* Crew v hre (#/hra/crew, pozvánka #/hra/crew/pridat/<KÓD>): založenie, pridanie kódom alebo odkazom,
   pozvánka (kopírovať, zdieľať, nový kód), členovia a vyhodenie (šéf), odchod. Pravidlá (max 10, jedna crew
   na hráča, U16 bez súhlasu nič nemení) sú v DB (011, 017): klient len zobrazuje hlášky CREW_FULL a pod. */
import { T } from './i18n-sk.js';
import { CREW_COLORS, crewInviteHash, parseInviteCode, topTurf, turfLine, validateCrew } from './logic.js';
import { gameApi, loadPlayer, rememberReturn } from './auth.js';
import { routeUrl } from './return.js';
import { loadGameCss } from './map.js';
import { gameShell, h, leaveGame, toast } from './ui.js';
import { UserError } from '../util.js';

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const userMessage = err => (err instanceof UserError ? err.message : T.err.UNKNOWN);
const crewColor = c => (COLOR_RE.test(c || '') ? c : '#F3EBDD');
export const crewTag = (tag, color) => h('span', { class: 'g-crewtag', style: { '--crew': crewColor(color) } }, tag);
const inviteUrl = code => new URL(routeUrl(crewInviteHash(code)), location.origin).href;

/* Turf Wars na karte spotu: veta o súboji a pruhy crews (spot_crew_scores, 30 dní). */
export function turfSlot(api, spotId, minPoints = 100) {
  const line = h('p', { class: 'g-turf-line' }, T.hud.loadingList);
  const bars = h('ol', { class: 'g-turf' });
  const sec = h('section', { class: 'g-spot-turf' }, h('h3', { class: 'g-label' }, T.crew.turfTitle), line, bars);
  api.spotTurf(spotId).then(rows => {
    const top = topTurf(rows);
    line.textContent = turfLine(top, minPoints) || T.crew.turfEmpty;
    const max = Math.max(minPoints, ...top.map(r => r.points));
    bars.replaceChildren(...top.map(r => h('li', { style: { '--crew': crewColor(r.color), '--w': `${Math.round((r.points / max) * 100)}%` } },
      h('span', { class: 'g-turf-tag' }, r.tag), h('span', { class: 'g-turf-bar', 'aria-hidden': 'true' }), h('span', { class: 'g-turf-pts' }, `${r.points} b`))));
  }).catch(err => { console.error(err); line.textContent = T.hud.loadFailed; });
  return sec;
}

function createForm(api, onDone) {
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  const name = h('input', { name: 'name', maxlength: 30, placeholder: T.crew.namePh, autocomplete: 'off', required: true });
  const tag = h('input', { name: 'tag', maxlength: 4, placeholder: T.crew.tagPh, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', required: true });
  tag.addEventListener('input', () => { tag.value = tag.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const colors = h('div', { class: 'g-colors', role: 'radiogroup', 'aria-label': T.crew.color },
    CREW_COLORS.map((c, i) => h('label', { class: 'g-color', style: { '--crew': c } },
      h('input', { type: 'radio', name: 'color', value: c, checked: i === 0, 'aria-label': T.crew.colorLabel(c) }), h('span', { 'aria-hidden': 'true' }))));
  const submit = h('button', { class: 'g-btn g-btn-in', type: 'submit' }, T.crew.create);
  const form = h('form', { class: 'g-form g-card-form', novalidate: true },
    h('h2', { class: 'wide g-form-title' }, T.crew.create),
    h('label', { class: 'g-field' }, h('span', {}, T.crew.name), name),
    h('label', { class: 'g-field' }, h('span', {}, T.crew.tag), tag),
    h('div', { class: 'g-field' }, h('span', {}, T.crew.color), colors),
    msg, h('div', { class: 'g-actions' }, submit));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';
    const { errors, value } = validateCrew({ name: name.value, tag: tag.value, color: form.querySelector('input[name=color]:checked')?.value });
    const first = Object.values(errors)[0];
    if (first) { msg.textContent = first; return; }
    submit.disabled = true;
    try { const c = await api.createCrew(value); toast(T.crew.created(c.tag)); onDone(); }
    catch (err) { msg.textContent = userMessage(err); }
    finally { if (submit.isConnected) submit.disabled = false; }
  });
  return form;
}

function joinForm(api, onDone, preset = '') {
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  const code = h('input', { name: 'code', maxlength: 200, placeholder: T.crew.codePh, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', value: preset });
  const submit = h('button', { class: 'g-btn', type: 'submit' }, T.crew.join);
  const form = h('form', { class: 'g-form g-card-form', novalidate: true },
    h('h2', { class: 'wide g-form-title' }, T.crew.joinTitle),
    h('label', { class: 'g-field' }, h('span', {}, T.crew.code), code), msg, h('div', { class: 'g-actions' }, submit));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';
    const c = parseInviteCode(code.value);
    if (!c) { msg.textContent = T.crew.errCode; return; }
    submit.disabled = true;
    try { const crew = await api.joinCrew(c); toast(T.crew.joined(crew.tag)); onDone(); }
    catch (err) { msg.textContent = userMessage(err); }
    finally { if (submit.isConnected) submit.disabled = false; }
  });
  return form;
}

function crewCard(crew, api, me, rerender) {
  const owner = crew.role === 'owner';
  const codeEl = h('code', { class: 'g-code wide' }, crew.invite_code);
  const act = (fn, confirmText) => async e => {
    if (confirmText && !confirm(confirmText)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await fn(); } catch (err) { toast(userMessage(err), { kind: 'err' }); } finally { if (btn.isConnected) btn.disabled = false; }
  };
  const copy = act(async () => { await navigator.clipboard.writeText(inviteUrl(crew.invite_code)); toast(T.crew.copied); });
  const share = act(async () => {
    try { await navigator.share({ title: 'Ghoskate', text: T.crew.shareText(crew.name, crew.tag), url: inviteUrl(crew.invite_code) }); }
    catch (err) { if (err?.name !== 'AbortError') throw err; }
  });
  const rotate = act(async () => { const c = await api.rotateInvite(); crew.invite_code = c; codeEl.textContent = c; toast(T.crew.rotated); }, T.crew.rotateConfirm);
  const leave = act(async () => { await api.leaveCrew(); toast(T.crew.left); rerender(); }, T.crew.leaveConfirm);

  return h('div', { class: 'g-crew' },
    h('article', { class: 'g-holo g-crew-card', style: { '--crew': crewColor(crew.color) } }, h('div', { class: 'g-holo-in' },
      h('div', { class: 'g-holo-top' }, crewTag(crew.tag, crew.color), h('span', { class: 'g-holo-city cond' }, T.crew.members(crew.members.length, crew.max))),
      h('h1', { class: 'g-holo-name wide' }, crew.name),
      h('dl', { class: 'g-stats' },
        h('div', {}, h('dt', {}, 'Body'), h('dd', { class: 'wide' }, T.crew.points(crew.points))),
        h('div', {}, h('dt', {}, 'Rebríček'), h('dd', {}, crew.rank ? h('a', { href: '#/hra/rebricek' }, T.crew.rank(crew.rank)) : '-')),
        h('div', {}, h('dt', {}, 'Turf'), h('dd', {}, T.crew.spots(crew.spots_controlled)))))),
    h('section', { class: 'g-invite' },
      h('h2', { class: 'g-label' }, T.crew.inviteTitle),
      h('p', { class: 'g-hint' }, T.crew.inviteHint),
      h('div', { class: 'g-invite-row' }, codeEl,
        h('button', { class: 'g-btn g-btn-small', type: 'button', onclick: copy }, T.crew.copy),
        typeof navigator.share === 'function' && h('button', { class: 'g-btn g-btn-small', type: 'button', onclick: share }, T.crew.share),
        owner && h('button', { class: 'g-btn g-btn-small g-btn-ghost', type: 'button', onclick: rotate }, T.crew.rotate))),
    h('section', {},
      h('h2', { class: 'g-label' }, T.crew.members(crew.members.length, crew.max)),
      h('ul', { class: 'g-roster' }, crew.members.map(m => h('li', {},
        h('strong', {}, `@${m.username}`), m.role === 'owner' && h('span', { class: 'g-sticker' }, T.crew.owner),
        owner && m.player_id !== me?.id && h('button', { class: 'linklike', type: 'button',
          onclick: act(async () => { await api.kickMember(m.player_id); toast(T.crew.kicked(m.username)); rerender(); }, T.crew.kickConfirm(m.username)) }, T.crew.kick))))),
    h('div', { class: 'g-actions' }, h('button', { class: 'g-btn g-btn-ghost', type: 'button', onclick: leave }, T.crew.leave)));
}

/* Náhľad pozvánky z odkazu. */
async function invitePanel(api, code, crew, player, ctx, rerender) {
  if (player.mode === 'anon') {
    return h('article', { class: 'g-holo g-profile' }, h('div', { class: 'g-holo-in' }, h('span', { class: 'g-sticker' }, T.crew.invited),
      h('p', {}, T.crew.inviteLogin),
      h('button', { class: 'g-btn g-btn-in', type: 'button', onclick: () => { rememberReturn(crewInviteHash(code)); ctx.login(() => ctx.rerender()); } }, T.onboarding.loginCta)));
  }
  let p;
  try { p = await api.crewPreview(code); } catch (err) {
    return h('p', { class: 'g-msg err' }, err.code === 'BAD_CODE' ? T.crew.inviteBad : userMessage(err));
  }
  const btn = h('button', { class: 'g-btn g-btn-in', type: 'button', disabled: p.full || Boolean(crew) || player.mode !== 'play' }, T.crew.join);
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { const c = await api.joinCrew(code); toast(T.crew.joined(c.tag)); history.replaceState(null, '', routeUrl('#/hra/crew')); rerender(); }
    catch (err) { msg.textContent = userMessage(err); btn.disabled = false; }
  });
  return h('article', { class: 'g-holo g-crew-card', style: { '--crew': crewColor(p.color) } }, h('div', { class: 'g-holo-in' },
    h('span', { class: 'g-sticker' }, T.crew.invited),
    h('div', { class: 'g-holo-top' }, crewTag(p.tag, p.color), h('span', { class: 'g-holo-city cond' }, T.crew.members(p.members, p.max))),
    h('h1', { class: 'g-holo-name wide' }, p.name),
    p.full && h('p', { class: 'g-msg warn' }, T.crew.inviteFull),
    crew && h('p', { class: 'g-msg warn' }, T.crew.inviteInCrew),
    player.mode === 'browse' && h('p', { class: 'g-msg warn' }, T.crew.browse),
    player.mode === 'onboarding' && h('p', { class: 'g-msg warn' }, T.crew.needProfile, ' ', h('a', { href: '#/hra/profil' }, T.hud.profile)),
    msg, h('div', { class: 'g-actions' }, btn)));
}

/* ctx: { store, login(after), go(hash), apiBase, rerender() }; code z #/hra/crew/pridat/<KÓD> */
export async function pageCrew(root, ctx, inviteCode = null) {
  const { body } = gameShell(root, 'crew');
  await loadGameCss();
  const page = h('div', { class: 'g-page' });
  body.append(page);
  const api = gameApi(ctx.store, ctx.apiBase);
  if (!api) { page.append(h('p', { class: 'g-msg err' }, T.hud.noServer)); return leaveGame; }
  const head = h('header', { class: 'g-page-head' }, h('h1', { class: 'wide' }, T.crew.title), h('p', {}, T.crew.lead));
  const code = inviteCode ? parseInviteCode(inviteCode) : '';

  const render = async () => {
    page.replaceChildren(head, h('p', { class: 'g-hint' }, T.hud.loadingList));
    const player = await loadPlayer(api);
    let crew = null;
    if (player.me) { try { crew = await api.myCrew(); } catch (err) { console.error(err); page.replaceChildren(head, h('p', { class: 'g-msg err' }, T.hud.loadFailed)); return; } }
    const parts = [head];
    if (code && !(crew && player.me)) parts.push(await invitePanel(api, code, crew, player, ctx, render));
    else if (code && crew) parts.push(h('p', { class: 'g-msg warn' }, T.crew.inviteInCrew));
    if (player.mode === 'anon') { if (!code) parts.push(h('p', {}, T.crew.login), h('button', { class: 'g-btn g-btn-in', type: 'button', onclick: () => { rememberReturn('#/hra/crew'); ctx.login(() => ctx.rerender()); } }, T.onboarding.loginCta)); }
    else if (player.mode === 'onboarding') { if (!code) parts.push(h('p', {}, T.crew.needProfile), h('a', { class: 'g-btn g-btn-in', href: '#/hra/profil' }, T.banner.onboardingCta)); }
    else if (crew) parts.push(crewCard(crew, api, player.me, render));
    else if (player.mode === 'browse') parts.push(h('p', { class: 'g-msg warn' }, T.crew.browse));
    else if (!code) parts.push(h('p', {}, T.crew.none), createForm(api, render), joinForm(api, render));
    page.replaceChildren(...parts);
  };
  await render();
  return leaveGame;
}
