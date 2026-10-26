/* Feed klipov (#/hra/feed) a klipy na detaile spotu. Dáta z clips_public (016): bez skrytých klipov
   a bez U16 bez súhlasu s fotkami. Videá a fotky sú v súkromnom buckete, prehrávač dostane podpísanú URL.
   Lajk len hráč v režime play (nie vlastný klip), autor svoj klip zmaže, admin klip skryje alebo vráti. */
import { T } from './i18n-sk.js';
import { parseEmbed, timeAgo } from './logic.js';
import { gameApi, loadPlayer } from './auth.js';
import { loadGameCss } from './map.js';
import { FEED_PAGE } from './api.js';
import { avatarEl, gameShell, h, leaveGame, toast } from './ui.js';
import { UserError } from '../util.js';

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const userMessage = err => (err instanceof UserError ? err.message : T.err.UNKNOWN);

function embedMedia(c) {
  const e = parseEmbed(c.embed_url);
  if (!e) return h('div', { class: 'g-clip-media none' }, T.feed.mediaGone);
  if (e.platform === 'youtube') {
    const play = h('button', { class: 'g-clip-yt', type: 'button', 'aria-label': T.feed.play },
      h('img', { src: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`, alt: '', loading: 'lazy', width: 480, height: 360 }),
      h('span', { class: 'g-clip-play', 'aria-hidden': 'true' }, '▶'));
    const box = h('div', { class: 'g-clip-media yt' }, play);
    play.addEventListener('click', () => box.replaceChildren(h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${e.id}?autoplay=1&rel=0`, title: c.trick || 'YouTube',
      allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin',
    })));
    return box;
  }
  return h('a', { class: `g-clip-media link ${e.platform}`, href: e.url, target: '_blank', rel: 'noopener noreferrer' },
    h('span', { class: 'g-clip-platform wide' }, e.platform === 'instagram' ? 'Instagram' : 'TikTok'),
    h('span', {}, T.feed.open(e.platform), ' ↗'));
}

function fileMedia(c, url) {
  if (!url) return h('div', { class: 'g-clip-media none' }, T.feed.mediaGone);
  if (c.media_kind === 'photo') return h('div', { class: 'g-clip-media' }, h('img', { src: url, alt: c.trick || '', loading: 'lazy' }));
  return h('div', { class: 'g-clip-media' }, h('video', { src: url, controls: true, playsinline: true, preload: 'metadata' }));
}

/* Karta klipu. o: { url, liked, canLike, mine, admin, hiddenView, onLike, onDelete, onHide } */
export function clipCard(c, o = {}) {
  const crew = c.crew_tag && h('span', { class: 'g-crewtag', style: { '--crew': COLOR_RE.test(c.crew_color || '') ? c.crew_color : '#F3EBDD' } }, c.crew_tag);
  const likeBtn = h('button', {
    class: `g-like${o.liked ? ' on' : ''}`, type: 'button', disabled: !o.canLike || o.mine,
    'aria-pressed': String(Boolean(o.liked)), 'aria-label': o.liked ? T.feed.unlike : T.feed.like,
  }, h('span', { 'aria-hidden': 'true' }, '♥'), h('span', { class: 'g-like-n' }, T.feed.likes(c.likes || 0)));
  likeBtn.addEventListener('click', () => o.onLike?.(c, likeBtn));
  const tools = [];
  if (o.mine && !o.hiddenView) tools.push(h('button', { class: 'linklike', type: 'button', onclick: () => o.onDelete?.(c) }, T.feed.del));
  if (o.admin) tools.push(h('button', { class: 'linklike', type: 'button', onclick: () => o.onHide?.(c, !o.hiddenView) }, o.hiddenView ? T.feed.unhide : T.feed.hide));
  return h('article', { class: 'g-clip', 'data-clip-id': c.id },
    h('header', { class: 'g-clip-head' },
      avatarEl(c.avatar, c.color), h('strong', {}, `@${c.username || '?'}`), crew,
      c.spot_id && h('a', { class: 'g-clip-spot cond', href: `#/hra/spot/${c.spot_id}` }, c.spot_name || ''),
      h('time', { class: 'g-clip-time', datetime: c.created_at }, timeAgo(c.created_at))),
    c.media_kind === 'embed' ? embedMedia(c) : fileMedia(c, o.url),
    h('div', { class: 'g-clip-foot' },   // nie <footer>: game.css skrýva pätičku webu cez body.game-mode footer
      c.verified && h('span', { class: 'g-verified' }, T.feed.verified),
      c.trick && h('span', { class: 'g-clip-trick' }, c.trick),
      h('span', { class: 'g-clip-tools' }, ...tools, !o.hiddenView && likeBtn)));
}

/* Zoznam klipov so stránkovaním. opts: { spotId, player ({mode, me}), admin, hiddenView, empty } */
export function clipList(api, opts) {
  const listEl = h('div', { class: 'g-feed', 'aria-live': 'polite' }, h('p', { class: 'g-hint' }, T.hud.loadingList));
  const more = h('button', { class: 'g-btn g-btn-ghost g-feed-more', type: 'button', hidden: true }, T.feed.more);
  const el = h('div', { class: 'g-feed-wrap' }, listEl, more);
  let last = null, liked = new Set(), first = true;

  const handlers = {
    async onLike(c, btn) {
      btn.disabled = true;
      const on = !liked.has(c.id);
      try {
        const res = on ? await api.likeClip(c.id) : await api.unlikeClip(c.id);
        if (on) liked.add(c.id); else liked.delete(c.id);
        c.likes = res.likes;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? T.feed.unlike : T.feed.like);
        btn.querySelector('.g-like-n').textContent = T.feed.likes(res.likes);
      } catch (err) { toast(userMessage(err), { kind: 'err' }); } finally { btn.disabled = false; }
    },
    async onDelete(c) {
      if (!confirm(T.feed.delConfirm)) return;
      try { await api.deleteClip(c.id); listEl.querySelector(`[data-clip-id="${c.id}"]`)?.remove(); toast(T.feed.deleted); }
      catch (err) { toast(userMessage(err), { kind: 'err' }); }
    },
    async onHide(c, hide) {
      try { await api.setClipHidden(c.id, hide); listEl.querySelector(`[data-clip-id="${c.id}"]`)?.remove(); toast(hide ? T.feed.hidden : T.feed.restored); }
      catch (err) { toast(userMessage(err), { kind: 'err' }); }
    },
  };

  async function load() {
    more.disabled = true;
    try {
      const rows = opts.hiddenView
        ? (await api.adminHiddenClips()).map(r => ({ ...r, username: r.player?.username, spot_name: r.spot?.name, likes: 0 }))
        : await api.feed({ spotId: opts.spotId, before: last, limit: opts.limit || FEED_PAGE });
      const [urls, mine] = await Promise.all([
        api.signMedia(rows.filter(r => r.media_kind !== 'embed').map(r => r.media_path)).catch(err => { console.error(err); return {}; }),
        opts.player?.mode === 'play' && !opts.hiddenView ? api.myLikes(rows.map(r => r.id)).catch(() => new Set()) : new Set(),
      ]);
      mine.forEach(id => liked.add(id));
      if (first) { listEl.replaceChildren(); first = false; }
      if (!rows.length && !listEl.children.length) listEl.append(h('p', { class: 'g-hint' }, opts.empty || T.feed.empty));
      listEl.append(...rows.map(c => clipCard(c, {
        ...handlers, url: urls[c.media_path], liked: liked.has(c.id), canLike: opts.player?.mode === 'play',
        mine: Boolean(opts.player?.me && c.username === opts.player.me.username), admin: opts.admin, hiddenView: opts.hiddenView,
      })));
      last = rows.at(-1)?.created_at || last;
      more.hidden = opts.hiddenView || opts.noMore || rows.length < (opts.limit || FEED_PAGE);
    } catch (err) {
      console.error(err);
      if (first) listEl.replaceChildren(h('p', { class: 'g-msg err' }, T.hud.loadFailed));
    } finally { more.disabled = false; }
  }
  more.addEventListener('click', load);
  return { el, load };
}

/* #/hra/feed. ctx: { store, apiBase } */
export async function pageFeed(root, ctx) {
  const { body } = gameShell(root, 'feed');
  await loadGameCss();
  const page = h('div', { class: 'g-page' });
  body.append(page);
  const api = gameApi(ctx.store, ctx.apiBase);
  if (!api) { page.append(h('p', { class: 'g-msg err' }, T.hud.noServer)); return leaveGame; }
  const [player, admin] = await Promise.all([loadPlayer(api), api.isAdmin()]);
  const slot = h('div', {});
  const show = hiddenView => {
    const list = clipList(api, { player, admin, hiddenView, empty: hiddenView ? T.feed.adminHidden + ': 0' : T.feed.empty });
    slot.replaceChildren(list.el);
    list.load();
  };
  const tabs = admin && h('div', { class: 'g-chips g-feed-tabs', role: 'group' },
    [[false, T.feed.adminAll], [true, T.feed.adminHidden]].map(([hv, label]) => h('button', {
      class: 'g-chip', type: 'button', 'aria-pressed': String(!hv),
      onclick: e => { e.currentTarget.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); show(hv); },
    }, label)));
  page.append(...[h('header', { class: 'g-page-head' }, h('h1', { class: 'wide' }, T.feed.title), h('p', {}, T.feed.lead)), tabs, slot].filter(Boolean));
  show(false);
  return leaveGame;
}

