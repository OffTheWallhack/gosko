/* Loot drop na karte spotu (vyzdvihnutie: check-in -> overený klip -> kód, pravidlá v claim_loot, 012)
   a admin stránka #/hra/admin (založenie dropu s tiermi cez /api/admin/loot, zoznam, vypnutie). */
import { T } from './i18n-sk.js';
import { tierLines, validateLootDrop } from './logic.js';
import { gameApi } from './auth.js';
import { loadGameCss } from './map.js';
import { gameShell, h, icon, leaveGame, toast } from './ui.js';
import { UserError } from '../util.js';

const userMessage = err => (err instanceof UserError ? err.message : T.err.UNKNOWN);
const fmtDate = iso => { const d = new Date(iso); return `${d.getDate()}. ${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* Výhra: kód odmeny (vidí ho len hráč, ktorý drop vyjazdil). */
export function rewardCard(r, { onNft } = {}) {
  return h('div', { class: 'g-reward', role: 'status' },
    h('strong', { class: 'wide g-reward-title' }, T.loot.won),
    h('p', {}, [r.label, r.reward].filter(Boolean).join(': '), r.rank ? ` · ${T.loot.rank(r.rank)}` : ''),
    r.reward_code && h('div', { class: 'g-reward-code' }, h('span', { class: 'g-label' }, T.loot.code), h('code', { class: 'g-code wide' }, r.reward_code)),
    h('p', { class: 'g-hint' }, T.loot.codeHint),
    r.gear_id && h('p', { class: 'g-hint ok' }, T.loot.gear),
    onNft && h('button', { class: 'g-btn g-btn-small', type: 'button', onclick: e => onNft(e.currentTarget) }, T.loot.nftGet));
}

/* Sekcia lootu na karte spotu. player: { mode }; vráti element. */
export function lootSlot(api, row, player) {
  const sec = h('section', { class: 'g-spot-loot' }, h('p', { class: 'g-hint' }, T.hud.loadingList));
  api.lootForSpot(row.id).then(drops => {
    const now = Date.now();
    sec.replaceChildren(...drops.map(d => {
      const started = Date.parse(d.starts_at) <= now;
      const msg = h('p', { class: 'g-msg', role: 'alert' });
      const out = h('div', {});
      const btn = h('button', { class: 'g-btn g-btn-in', type: 'button', disabled: player.mode !== 'play' || !started || d.remaining <= 0 }, T.loot.claim);
      btn.addEventListener('click', async () => {
        msg.textContent = ''; btn.disabled = true; btn.textContent = T.loot.claiming;
        try {
          const r = await api.claimLoot(d.id);
          out.replaceChildren(rewardCard(r));
          btn.remove();
        } catch (err) { msg.textContent = userMessage(err); if (btn.isConnected) { btn.disabled = false; btn.textContent = T.loot.claim; } }
      });
      return h('article', { class: 'g-drop-card' },
        h('div', { class: 'g-drop-head' }, icon('loot'), h('div', {}, h('strong', { class: 'wide' }, d.title), d.partner && h('small', {}, T.loot.by(d.partner)))),
        d.description && h('p', {}, d.description),
        h('ul', { class: 'g-tiers' }, tierLines(d.tiers).map(l => h('li', {}, l))),
        h('p', { class: 'g-hint' }, started ? T.loot.remaining(d.remaining, d.capacity) : T.loot.soonStart, d.ends_at ? ` · ${T.loot.ends(fmtDate(d.ends_at))}` : ''),
        h('p', { class: 'g-hint ok' }, T.loot.how),
        player.mode !== 'play' && h('p', { class: 'g-hint' }, T.loot.needPlay),
        msg, out, h('div', { class: 'g-actions' }, btn));
    }));
  }).catch(err => { console.error(err); sec.replaceChildren(h('p', { class: 'g-msg err' }, T.hud.loadFailed)); });
  return sec;
}

/* ---------- admin: #/hra/admin ---------- */
function tierRow(gear, t = {}) {
  const inp = (name, attrs) => h('input', { name, autocomplete: 'off', ...attrs });
  const row = h('fieldset', { class: 'g-tier-row' },
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.tierLabel), inp('label', { maxlength: 40, value: t.label || '' })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.upTo), inp('up_to', { type: 'number', min: 1, max: 100000, value: t.up_to || '' })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.reward), inp('reward', { maxlength: 200, value: t.reward || '' })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.code), inp('code', { maxlength: 100 })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.gear), h('select', { name: 'gear_id' },
      h('option', { value: '' }, T.lootAdmin.gearNone), gear.map(g => h('option', { value: g.id }, g.name)))),
    h('button', { class: 'linklike', type: 'button', onclick: () => row.remove() }, T.lootAdmin.removeTier));
  return row;
}

function dropForm(api, spots, gear, onDone) {
  const msg = h('p', { class: 'g-msg', role: 'alert' });
  const tiers = h('div', { class: 'g-tiers-edit' }, tierRow(gear, { label: 'Top 3', up_to: 3 }), tierRow(gear, { label: 'Top 50', up_to: 50 }));
  const sel = h('select', { name: 'spot_id' }, h('option', { value: '' }, '…'), spots.map(s => h('option', { value: s.id }, `${s.name} (${s.city || ''})`)));
  const nft = h('select', { name: 'nft_type' }, h('option', { value: '' }, T.lootAdmin.nftNone), Object.entries(T.lootAdmin.nftTypes).map(([k, v]) => h('option', { value: k }, v)));
  const submit = h('button', { class: 'g-btn g-btn-in', type: 'submit' }, T.lootAdmin.create);
  const form = h('form', { class: 'g-form g-card-form', novalidate: true },
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.spot), sel),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.title2), h('input', { name: 'title', maxlength: 80 })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.partner), h('input', { name: 'partner', maxlength: 80 })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.description), h('textarea', { name: 'description', maxlength: 400, rows: 2 })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.starts), h('input', { name: 'starts_at', type: 'datetime-local' })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.ends), h('input', { name: 'ends_at', type: 'datetime-local' })),
    h('label', { class: 'g-field' }, h('span', {}, T.lootAdmin.nft), nft),
    h('span', { class: 'g-label' }, T.lootAdmin.tiers), tiers,
    h('button', { class: 'g-btn g-btn-small g-btn-ghost', type: 'button', onclick: () => tiers.append(tierRow(gear)) }, T.lootAdmin.addTier),
    msg, h('div', { class: 'g-actions' }, submit));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';
    const el = form.elements;
    const local = v => (v ? new Date(v).toISOString() : undefined);
    const raw = {
      spot_id: el.spot_id.value, title: el.title.value, partner: el.partner.value || undefined, description: el.description.value || undefined,
      starts_at: local(el.starts_at.value), ends_at: local(el.ends_at.value), nft_type: el.nft_type.value ? Number(el.nft_type.value) : null,
      tiers: [...tiers.querySelectorAll('.g-tier-row')].map(r => ({ label: r.querySelector('[name=label]').value, up_to: r.querySelector('[name=up_to]').value,
        reward: r.querySelector('[name=reward]').value, code: r.querySelector('[name=code]').value, gear_id: r.querySelector('[name=gear_id]').value || null })),
    };
    const { errors, value } = validateLootDrop(raw);
    const first = Object.values(errors)[0];
    if (first) { msg.textContent = first; return; }
    submit.disabled = true;
    try { await api.adminCreateLoot(value); toast(T.lootAdmin.created); form.reset(); onDone(); }
    catch (err) { msg.textContent = err.data?.errors ? Object.values(err.data.errors)[0] : userMessage(err); }
    finally { submit.disabled = false; }
  });
  return form;
}

/* ctx: { store, apiBase } */
export async function pageLootAdmin(root, ctx) {
  const { body } = gameShell(root, '');
  await loadGameCss();
  const page = h('div', { class: 'g-page' });
  body.append(page);
  const api = gameApi(ctx.store, ctx.apiBase);
  const head = h('header', { class: 'g-page-head' }, h('h1', { class: 'wide' }, T.lootAdmin.title), h('p', {}, T.lootAdmin.lead));
  if (!api || !(await api.isAdmin())) { page.append(head, h('p', { class: 'g-msg warn' }, T.lootAdmin.denied)); return leaveGame; }
  const list = h('ul', { class: 'g-drop-list' });
  const load = async () => {
    try {
      const { drops } = await api.adminLoot();
      list.replaceChildren(...(drops.length ? drops.map(d => {
        const cap = Math.max(0, ...d.tiers.map(t => t.up_to));
        const toggle = h('button', { class: 'g-btn g-btn-small g-btn-ghost', type: 'button' }, d.active ? T.lootAdmin.off : T.lootAdmin.on);
        toggle.addEventListener('click', async () => { toggle.disabled = true; try { await api.adminSetLootActive(d.id, !d.active); await load(); } catch (err) { toast(userMessage(err), { kind: 'err' }); toggle.disabled = false; } });
        return h('li', { class: d.active ? '' : 'off' },
          h('div', {}, h('strong', {}, d.title), ' · ', h('a', { href: `#/hra/spot/${d.spot_id}` }, d.spot_name), !d.active && h('em', {}, ` (${T.lootAdmin.inactive})`)),
          h('small', {}, T.lootAdmin.claimed(d.claimed, cap), d.nft_type ? ` · NFT ${T.lootAdmin.nftTypes[d.nft_type] || d.nft_type}` : ''),
          toggle);
      }) : [h('li', { class: 'g-hint' }, T.lootAdmin.empty)]));
    } catch (err) { list.replaceChildren(h('li', { class: 'g-msg err' }, userMessage(err))); }
  };
  const [spots, gear] = await Promise.all([api.summary().catch(() => []), api.gearCatalog().catch(() => [])]);
  page.append(head, dropForm(api, [...spots].sort((a, b) => a.name.localeCompare(b.name, 'sk')), gear.filter(g => ['sticker', 'badge'].includes(g.kind)), load),
    h('h2', { class: 'g-label' }, T.lootAdmin.list), list,
    h('p', {}, h('a', { class: 'g-btn g-btn-ghost', href: '#/hra/feed' }, T.lootAdmin.hiddenClips)));
  await load();
  return leaveGame;
}
