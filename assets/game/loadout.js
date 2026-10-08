/* Loadout (#/hra/loadout): 3D doska (assets/board.js) s nálepkami z unlocked_gear, zamknuté nálepky ako
   siluety s popisom, ako ich vyjazdiť, výber vzhľadu dosky (uloží set_loadout, 018), moje odmeny z loot dropov
   (kódy, GoskoLoot NFT) a súhlas s NFT (16+). Bez WebGL ostáva zoznam nálepiek. */
import { T } from './i18n-sk.js';
import { gearSticker, loadoutConfig, loadoutState, nftLabel, MAX_BOARD_STICKERS } from './logic.js';
import { gameApi, loadPlayer, rememberReturn } from './auth.js';
import { loadGameCss } from './map.js';
import { rewardCard } from './loot.js';
import { gameShell, h, leaveGame, toast } from './ui.js';
import { UserError } from '../util.js';

const userMessage = err => (err instanceof UserError ? err.message : T.err.UNKNOWN);

function stickerTile(g, { locked, placed, onToggle }) {
  return h('li', { class: `g-gear${locked ? ' locked' : ''}${placed ? ' placed' : ''}` },
    h('span', { class: `g-gear-art ${g.kind}`, 'aria-hidden': 'true' }, locked ? '?' : g.name.slice(0, 1)),
    h('span', { class: 'g-gear-txt' }, h('strong', {}, g.name), h('small', {}, locked ? g.how_to_unlock : g.description || '')),
    !locked && h('button', { class: 'g-btn g-btn-small', type: 'button', 'aria-pressed': String(placed), onclick: () => onToggle(g) }, placed ? T.loadout.remove : T.loadout.place));
}

/* ctx: { store, login(after), apiBase, rerender() } */
export async function pageLoadout(root, ctx) {
  const { body } = gameShell(root, 'loadout');
  await loadGameCss();
  const page = h('div', { class: 'g-page' });
  body.append(page);
  const api = gameApi(ctx.store, ctx.apiBase);
  const head = h('header', { class: 'g-page-head' }, h('h1', { class: 'wide' }, T.loadout.title), h('p', {}, T.loadout.lead));
  if (!api) { page.append(head, h('p', { class: 'g-msg err' }, T.hud.noServer)); return leaveGame; }
  const player = await loadPlayer(api);
  if (!player.me) {
    page.append(head, h('p', {}, T.loadout.login),
      player.mode === 'anon'
        ? h('button', { class: 'g-btn g-btn-in', type: 'button', onclick: () => { rememberReturn('#/hra/loadout'); ctx.login(() => ctx.rerender()); } }, T.onboarding.loginCta)
        : h('a', { class: 'g-btn g-btn-in', href: '#/hra/profil' }, T.banner.onboardingCta));
    return leaveGame;
  }

  let catalog = [], mine = [], loot = [], admin = false;
  try { [catalog, mine, loot, admin] = await Promise.all([api.gearCatalog(), api.myGear(), api.myLoot().catch(() => []), api.isAdmin()]); }
  catch (err) { console.error(err); page.append(head, h('p', { class: 'g-msg err' }, T.hud.loadFailed)); return leaveGame; }

  const me = player.me;
  const cfg = me.board_config || {};
  const S = loadoutState(catalog, mine, cfg);
  let placed = S.placed;
  const look = { deck: cfg.deck, grip: cfg.grip, wheels: cfg.wheels, trucks: cfg.trucks };
  const byId = Object.fromEntries(S.owned.map(g => [g.id, g]));
  const specs = () => placed.map(id => gearSticker(byId[id]));

  // 3D doska: board.js a three.js sa načítajú až tu
  const canvas = h('canvas', { class: 'g-board3d', 'aria-label': T.loadout.title });
  const stage = h('div', { class: 'g-board-stage' }, canvas);
  let board = null, B = null, destroyed = false;
  import('../board.js').then(async mod => {
    B = mod;
    board = await mod.mountBoard(canvas, { stickers: specs(), look });
    if (destroyed) { board(); board = null; return; }
    lookPanel.replaceChildren(...lookControls());
  }).catch(err => { console.error(err); stage.replaceChildren(h('p', { class: 'g-hint' }, T.loadout.no3d)); });

  const lookPanel = h('div', { class: 'g-look' });
  const lookControls = () => [['deck', B.DECKS], ['grip', B.GRIPS], ['wheels', B.WHEELS], ['trucks', B.TRUCKS]].map(([k, table]) =>
    h('label', { class: 'g-field' }, h('span', {}, T.loadout[k]), h('select', { name: k, onchange: e => { look[k] = e.target.value; board?.setLook(look); } },
      Object.entries(table).map(([v, d]) => h('option', { value: v, selected: (look[k] || B.DEFAULT_LOOK[k]) === v }, d.name)))));

  const ownedList = h('ul', { class: 'g-gear-list' });
  const renderOwned = () => ownedList.replaceChildren(...S.owned.map(g => stickerTile(g, { placed: placed.includes(g.id), onToggle })));
  function onToggle(g) {
    if (placed.includes(g.id)) placed = placed.filter(id => id !== g.id);
    else if (placed.length >= MAX_BOARD_STICKERS) return toast(T.loadout.full, { kind: 'err' });
    else placed = [...placed, g.id];
    board?.setStickers(specs());
    renderOwned();
  }
  renderOwned();
  const save = h('button', { class: 'g-btn g-btn-in', type: 'button' }, T.loadout.save);
  save.addEventListener('click', async () => {
    save.disabled = true;
    try { me.board_config = await api.setLoadout(loadoutConfig(look, placed)); toast(T.loadout.saved); }
    catch (err) { toast(userMessage(err), { kind: 'err' }); } finally { save.disabled = false; }
  });

  const rewards = h('ul', { class: 'g-rewards' }, loot.length ? loot.map(r => {
    const nftMsg = h('small', { class: 'g-hint' }, nftLabel(r));
    const canMint = r.nft_type && r.nft_status !== 'minted';
    return h('li', {}, h('div', { class: 'g-reward-meta' }, h('strong', {}, r.title), r.partner && h('small', {}, T.loot.by(r.partner))),
      rewardCard(r, canMint ? { onNft: async btn => {
        btn.disabled = true;
        try { const out = await api.mintLootNft(r.drop_id); nftMsg.textContent = T.loot.nftStatus[out.status] || ''; if (out.status === 'minted') btn.remove(); }
        catch (err) { nftMsg.textContent = userMessage(err); } finally { if (btn.isConnected) btn.disabled = false; }
      } } : {}), nftMsg);
  }) : [h('li', { class: 'g-hint' }, T.loadout.rewardsEmpty)]);

  const nftBox = h('label', { class: 'g-check' }, h('input', { type: 'checkbox', checked: me.nft_consent, onchange: async e => {
    const on = e.target.checked;
    e.target.disabled = true;
    try { await api.setNftConsent(on); me.nft_consent = on; toast(T.loadout.nftSaved(on)); }
    catch (err) { e.target.checked = !on; toast(err.code === 'NEED_GUARDIAN' ? T.loadout.nftKid : userMessage(err), { kind: 'err' }); }
    finally { e.target.disabled = false; }
  } }), h('span', {}, T.loadout.nftOn));

  page.append(...[head,
    h('section', { class: 'g-loadout' }, stage, lookPanel, h('div', { class: 'g-actions' }, save)),
    h('h2', { class: 'g-label' }, T.loadout.owned(S.owned.length)), ownedList,
    S.locked.length ? h('h2', { class: 'g-label' }, T.loadout.locked) : null,
    S.locked.length ? h('ul', { class: 'g-gear-list' }, S.locked.map(g => stickerTile(g, { locked: true }))) : null,
    h('h2', { class: 'g-label' }, T.loadout.rewards), rewards,
    h('section', { class: 'g-consent g-nft' }, h('span', { class: 'g-label' }, T.loadout.nftTitle), h('p', {}, T.loadout.nftLead), nftBox),
    admin ? h('p', {}, h('a', { class: 'g-btn g-btn-ghost', href: '#/hra/admin' }, T.loadout.admin)) : null].filter(Boolean));
  return () => { destroyed = true; board?.(); leaveGame(); };
}
