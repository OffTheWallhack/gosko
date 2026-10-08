/* Onboarding hráča (#/hra/profil): prihlásenie e-mailom, potom nick, mesto, stance a IG.
   Nový jazdec (e-mail nepoznáme z registrácie) vyplní aj meno, dátum narodenia a krajinu; U16 e-mail rodiča.
   Zápis robí server (api/game/link-rider.js), klient iba predbežne kontroluje polia. */
import { T } from './i18n-sk.js';
import { needsGuardian, validateUsername } from './logic.js';
import { gameApi, loadPlayer, rememberReturn } from './auth.js';
import { loadGameCss } from './map.js';
import { gameShell, h, leaveGame, toast } from './ui.js';
import { COUNTRIES, todayIn } from '../register.js';
import { UserError } from '../util.js';

const field = (name, label, input, hint) => h('label', { class: 'g-field', 'data-field': name },
  h('span', {}, label), input, hint && h('small', {}, hint), h('em', { class: 'g-field-err', role: 'alert' }));

function profileCard(player, api, ctx) {
  const me = player.me;
  return h('article', { class: 'g-holo g-profile' }, h('div', { class: 'g-holo-in' },
    h('span', { class: 'g-sticker' }, T.onboarding.playerTitle),
    h('h1', { class: 'g-holo-name wide' }, `@${me.username}`),
    h('p', { class: 'g-holo-city cond' }, [me.city, me.stance && T.onboarding[me.stance]].filter(Boolean).join(' · ')),
    player.mode === 'browse' && h('p', { class: 'g-msg warn' }, T.banner.browse),
    mediaConsent(me, api),
    h('div', { class: 'g-actions' },
      h('a', { class: 'g-btn g-btn-in', href: '#/hra' }, T.onboarding.toMap),
      h('button', { class: 'g-btn g-btn-ghost', type: 'button', onclick: async () => { await api.logout(); ctx.go('#/hra'); } }, T.onboarding.logout))));
}

/* Súhlas s fotkami a videami (016): U16 ho dostane iba od rodiča, odvolať ho vie sám. 16+ ho nepotrebuje. */
function mediaConsent(me, api) {
  if (!me.can_write) return null;
  const box = h('div', { class: 'g-consent', role: 'group', 'aria-label': T.profile.mediaTitle });
  const render = () => {
    if (me.can_publish && !me.media_consent) { box.replaceChildren(); box.hidden = true; return; }   // 16+
    box.hidden = false;
    const btn = h('button', { class: 'g-btn g-btn-small', type: 'button' }, me.media_consent ? T.profile.mediaWithdraw : T.profile.mediaAsk);
    btn.addEventListener('click', async () => {
      if (me.media_consent && !confirm(T.profile.mediaWithdrawConfirm)) return;
      btn.disabled = true;
      try {
        if (me.media_consent) { await api.withdrawMedia(); me.media_consent = false; me.can_publish = false; toast(T.profile.mediaWithdrawn); render(); }
        else { const r = await api.resendGuardian(); toast(r.guardian_mail_sent ? T.profile.mediaAsked : T.onboarding.doneGuardianFail, { kind: r.guardian_mail_sent ? 'ok' : 'err' }); }
      } catch (err) { toast(err instanceof UserError ? err.message : T.err.UNKNOWN, { kind: 'err' }); } finally { if (btn.isConnected) btn.disabled = false; }
    });
    box.replaceChildren(h('span', { class: 'g-label' }, T.profile.mediaTitle),
      h('p', {}, me.media_consent ? T.profile.mediaOn : T.profile.mediaOff), btn);
  };
  render();
  return box;
}

function onboardingForm(status, api, done) {
  const newRider = status.rider === 'none';
  const askBirth = newRider || status.rider === 'ambiguous';
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  const inp = (name, attrs = {}) => h('input', { name, autocomplete: 'off', ...attrs });
  const stance = h('div', { class: 'g-chips', role: 'radiogroup', 'aria-label': T.onboarding.stance },
    ['regular', 'goofy'].map(v => h('label', { class: 'g-chip' }, h('input', { type: 'radio', name: 'stance', value: v }), h('span', {}, T.onboarding[v]))));
  const guardianBox = h('fieldset', { class: 'g-guardian', hidden: true },
    h('legend', { class: 'wide' }, T.onboarding.guardianTitle), h('p', { class: 'g-hint' }, T.onboarding.guardianLead),
    field('guardian_email', T.onboarding.guardianEmail, inp('guardian_email', { type: 'email', autocomplete: 'email' })),
    field('guardian_name', T.onboarding.guardianName, inp('guardian_name', { maxlength: 60 })));
  const birth = inp('birth_date', { type: 'date', max: todayIn() });
  const submit = h('button', { class: 'g-btn g-btn-in', type: 'submit' }, T.onboarding.submit);
  const form = h('form', { class: 'g-form', novalidate: true },
    status.rider === 'known' && h('p', { class: 'g-hint ok' }, T.onboarding.knownRider),
    status.rider === 'ambiguous' && h('p', { class: 'g-hint' }, T.onboarding.ambiguous),
    field('username', T.onboarding.username, inp('username', { required: true, maxlength: 20, pattern: '[A-Za-z0-9_.]{3,20}', autocapitalize: 'none', spellcheck: 'false' }), T.onboarding.usernameHint),
    field('city', T.onboarding.city, inp('city', { maxlength: 60, autocomplete: 'address-level2' })),
    h('div', { class: 'g-field', 'data-field': 'stance' }, h('span', {}, T.onboarding.stance), stance, h('em', { class: 'g-field-err', role: 'alert' })),
    field('instagram', T.onboarding.instagram, inp('instagram', { maxlength: 31, placeholder: '@nick' })),
    newRider && field('name', T.onboarding.name, inp('name', { required: true, maxlength: 60, autocomplete: 'name' }), T.onboarding.nameHint),
    askBirth && field('birth_date', T.onboarding.birth, birth),
    newRider && field('country', T.onboarding.country, h('select', { name: 'country' }, COUNTRIES.map(c => h('option', { value: c.value }, c.label)))),
    guardianBox,
    h('label', { class: 'g-check', 'data-field': 'rules' }, h('input', { type: 'checkbox', name: 'rules' }), h('span', {}, T.onboarding.rules)),
    h('label', { class: 'g-check', 'data-field': 'privacy' }, h('input', { type: 'checkbox', name: 'privacy' }),
      h('span', {}, T.onboarding.privacy, ' ', h('a', { href: '#/sukromie', target: '_blank' }, T.onboarding.privacyLink))),
    msg, h('div', { class: 'g-actions' }, submit));

  const el = form.elements;
  const syncGuardian = () => { if (newRider) guardianBox.hidden = !needsGuardian(birth.value, todayIn()); };
  birth.addEventListener('change', syncGuardian);
  const setErrors = (errors = {}) => {
    form.querySelectorAll('.g-field-err').forEach(e => { e.textContent = ''; });
    for (const [k, v] of Object.entries(errors)) {
      const slot = form.querySelector(`[data-field="${k}"] .g-field-err`);
      if (slot) slot.textContent = v; else msg.textContent = v;
    }
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = ''; setErrors();
    const userErr = validateUsername(el.username.value.trim());
    if (userErr) return setErrors({ username: userErr });
    if (!el.rules.checked || !el.privacy.checked) { msg.textContent = T.onboarding.errConsents; return; }
    if (!guardianBox.hidden && !el.guardian_email.value.trim()) return setErrors({ guardian_email: T.onboarding.errGuardian });
    const val = n => (el[n] ? el[n].value.trim() : undefined);
    const body = {
      username: val('username'), city: val('city') || null, stance: form.querySelector('input[name=stance]:checked')?.value || null,
      instagram: val('instagram') || null, consents: { rules: true, privacy: true },
    };
    if (askBirth && val('birth_date')) body.birth_date = val('birth_date');
    if (newRider) Object.assign(body, { name: val('name'), country: val('country') });
    if (!guardianBox.hidden) Object.assign(body, { guardian_email: val('guardian_email') || null, guardian_name: val('guardian_name') || null });
    submit.disabled = true; submit.textContent = T.onboarding.saving;
    try {
      done(await api.link(body));
    } catch (err) {
      if (err.code === 'guardian_required') guardianBox.hidden = false;
      setErrors(err.data?.errors);
      msg.textContent = err instanceof UserError ? err.message : T.err.UNKNOWN;
    } finally { submit.disabled = false; submit.textContent = T.onboarding.submit; }
  });
  return form;
}

/* ctx: { store, login(after), loginMode ('password' | 'magic'), go(hash), apiBase, rerender() } */
export async function pageOnboarding(root, ctx) {
  const { body } = gameShell(root, 'profile');
  await loadGameCss();
  const page = h('div', { class: 'g-page' });
  body.append(page);
  const api = gameApi(ctx.store, ctx.apiBase);
  if (!api) { page.append(h('p', { class: 'g-msg err' }, T.hud.noServer)); return leaveGame; }

  const player = await loadPlayer(api);
  const head = (lead = T.onboarding.lead) => h('header', { class: 'g-page-head' }, h('h1', { class: 'wide' }, T.onboarding.title), h('p', {}, lead));
  if (player.mode === 'anon') {
    page.append(head(ctx.loginMode === 'magic' ? T.onboarding.loginLeadMagic : T.onboarding.loginLead), h('button', { class: 'g-btn g-btn-in', type: 'button', onclick: () => { rememberReturn('#/hra/profil'); ctx.login(() => ctx.rerender()); } }, T.onboarding.loginCta));
    return leaveGame;
  }
  if (player.me) { page.append(profileCard(player, api, ctx)); return leaveGame; }

  let status;
  try { status = await api.linkStatus(); } catch (err) { page.append(head(), h('p', { class: 'g-msg err' }, err instanceof UserError ? err.message : T.err.UNKNOWN)); return leaveGame; }
  if (status.status === 'player') { ctx.rerender(); return leaveGame; }

  page.append(head(), onboardingForm(status, api, res => {
    const lines = [T.onboarding.done(res.username)];
    if (res.needs_guardian) lines.push(res.guardian_mail_sent ? T.onboarding.doneGuardian : T.onboarding.doneGuardianFail);
    page.replaceChildren(h('article', { class: 'g-holo g-profile' }, h('div', { class: 'g-holo-in' },
      h('span', { class: 'g-sticker' }, T.onboarding.doneTitle), h('h1', { class: 'g-holo-name wide' }, `@${res.username}`),
      lines.map(l => h('p', {}, l)), h('div', { class: 'g-actions' }, h('a', { class: 'g-btn g-btn-in', href: '#/hra' }, T.onboarding.toMap)))));
    if (!res.needs_guardian) toast(T.onboarding.done(res.username));
  }));
  return leaveGame;
}
