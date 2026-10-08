/* Čistá logika hry bez DOM (testuje sa v Node, tests/unit/game-logic.test.js):
   vzdialenosť, hlášky chýb RPC a polohy, U16, piny zo spot_summary, reduced motion, formulár spotu. */
import { T } from './i18n-sk.js';
import { ageAt, U16_LIMIT } from '../register.js';

/* Spodné menu appky Ghoskate (/hra). Profil je v hornej lište (ui.js gameShell). */
export const GAME_MENU = [
  { id: 'map', label: T.menu.map, href: '#/hra' },
  { id: 'feed', label: T.menu.feed, href: '#/hra/feed' },
  { id: 'crew', label: T.menu.crew, href: '#/hra/crew' },   // #/crew je Robova stránka crew z data.js
  { id: 'board', label: T.menu.board, href: '#/hra/rebricek' },
  { id: 'loadout', label: T.menu.loadout, href: '#/hra/loadout' },
];

/* ---------- vzdialenosť ---------- */
export function formatDistance(m) {
  if (!Number.isFinite(m)) return '';
  const r = Math.round(m);
  if (r < 1000 && m < 999.5) return `${r} m`;
  const km = m / 1000;
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1).replace('.', ',')} km`;
}

export function tooFarMessage(details) {
  if (!details || !Number.isFinite(details.distance_m) || !Number.isFinite(details.max_m)) return T.err.TOO_FAR_GENERIC;
  return `Si ${formatDistance(details.distance_m)} od spotu. Podíď bližšie, limit je ${formatDistance(details.max_m)}.`;
}

/* ---------- chyby RPC (kontrakt §8: HTTP 400, {message: KÓD, details: JSON}) ---------- */
const CODE_RE = /^[A-Z][A-Z_]{2,30}$/;
export function parseRpcError(err) {
  if (!err) return { code: 'UNKNOWN', details: null };
  // fetch bez siete (supabase-js vráti TypeError alebo error s textom Failed to fetch)
  if (err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(err.message || ''))) return { code: 'NETWORK', details: null };
  const code = CODE_RE.test(String(err.message || '')) ? err.message : 'UNKNOWN';
  let details = null;
  if (err.details && typeof err.details === 'object') details = err.details;
  else if (typeof err.details === 'string') { try { details = JSON.parse(err.details); } catch { details = null; } }
  return { code, details: details && typeof details === 'object' ? details : null };
}

export function errorMessage(err) {
  const { code, details } = parseRpcError(err);
  if (code === 'TOO_FAR') return tooFarMessage(details);
  return T.err[code] || T.err.UNKNOWN;
}

/* GeolocationPositionError: 1 zamietnutá, 2 nedostupná, 3 timeout; 'unsupported' = bez navigator.geolocation */
export function geoErrorMessage(err) {
  const c = err?.code;
  if (c === 1) return T.geo.denied;
  if (c === 3) return T.geo.timeout;
  if (c === 'unsupported') return T.geo.unsupported;
  return T.geo.unavailable;
}

/* ---------- hráč ---------- */
/* U16 (dnes mladší ako 16). Neplatný dátum = rozhoduje server, klient nič nepýta. */
export const needsGuardian = (birthDate, today) => { const a = ageAt(birthDate, today); return Number.isFinite(a) && a < U16_LIMIT; };

/* anon: neprihlásený; onboarding: prihlásený bez profilu; browse: U16 bez súhlasu; play: môže zapisovať */
export function playerMode({ signedIn, me }) {
  if (!signedIn) return 'anon';
  if (!me) return 'onboarding';
  return me.can_write ? 'play' : 'browse';
}

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
export const validateUsername = s => (USERNAME_RE.test(String(s ?? '')) ? '' : T.onboarding.errUsername);

/* ---------- piny ---------- */
const COLOR_RE = /^#[0-9a-f]{6}$/i;
export function pulseLevel(people) {
  const n = Number(people) || 0;
  return n <= 0 ? 0 : n === 1 ? 1 : n <= 4 ? 2 : 3;
}

export const peopleLabel = n => T.pin.people(Number(n) || 0);

export function summaryToPin(row, { reducedMotion = false } = {}) {
  const crew = Boolean(row.control_crew_id && row.control_tag);
  const color = crew && COLOR_RE.test(String(row.control_color || '')) ? row.control_color.toLowerCase() : null;
  const people = Math.max(0, Number(row.people_now) || 0);
  const loot = row.loot_active === true;
  const label = [row.name, crew ? T.pin.crew(row.control_tag) : '', people ? peopleLabel(people) : '', loot ? T.pin.loot : ''].filter(Boolean).join(', ');
  return {
    id: row.id, name: row.name, lat: Number(row.lat), lng: Number(row.lng),
    color, tag: crew ? row.control_tag : null, people, pulse: reducedMotion ? 0 : pulseLevel(people), loot, label,
  };
}

/* Poradie = poradie v DOM: posledné sú navrchu. Navrch ide loot, potom ľudia, potom crew. */
export function pinsFromSummary(rows, opts) {
  const score = p => (p.loot ? 1e6 : 0) + p.people * 10 + (p.tag ? 1 : 0);
  return (rows || [])
    .filter(r => r && r.id && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)) && r.lat !== null && r.lng !== null)
    .map(r => summaryToPin(r, opts))
    .sort((a, b) => score(a) - score(b));
}

export const skullsFilled = avg => (Number.isFinite(Number(avg)) && avg !== null ? Math.max(0, Math.min(5, Math.round(Number(avg)))) : 0);
export const bustLevel = b => ({ low: 1, medium: 2, high: 3 }[b] || 0);
export const statusLabel = s => T.status[s] || '';

/* ---------- reduced motion ---------- */
export const prefersReducedMotion = (win = globalThis.window) => {
  try { return win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};

/* ---------- check-in ---------- */
export function isActiveCheckin(row, now, maxMinutes) {
  if (!row || row.ended_at) return false;
  const t = Date.parse(row.started_at);
  return Number.isFinite(t) && now - t < maxMinutes * 60_000;
}
export const checkoutMessage = ({ minutes, points }) => T.checkin.out(minutes, points);

/* ---------- nový spot (add_spot) ---------- */
export const SPOT_KINDS = Object.keys(T.kinds);
export const OBSTACLES = Object.keys(T.obstacles);
const clean = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function validateNewSpot({ name, kind, city, obstacles = [], note = '' } = {}) {
  const errors = {};
  const p_name = clean(name), p_city = clean(city);
  if (!p_name || p_name.length > 60) errors.name = T.newSpot.errName;
  if (!SPOT_KINDS.includes(kind)) errors.kind = T.newSpot.errKind;
  if (!p_city || p_city.length > 40) errors.city = T.newSpot.errCity;
  const obs = OBSTACLES.filter(o => obstacles.includes(o));
  const parts = [obs.length ? `${T.newSpot.obstaclesLabel}: ${obs.map(o => T.obstacles[o]).join(', ')}.` : '', clean(note)].filter(Boolean);
  const p_description = parts.join(' ').slice(0, 400) || null;
  return { errors, value: { p_name, p_kind: kind, p_city, p_description } };
}

/* ---------- klipy (016) ---------- */
/* Odkaz na klip: IG (p, reel, tv), TikTok (video, vm/vt skratka), YouTube (watch, shorts, youtu.be), iba https.
   Rovnaké pravidlá ako game_embed_url v databáze (tá rozhoduje). { platform, id, url } alebo null. */
const EMBED_Q = '(?:[?&#][A-Za-z0-9_=&%.+-]*)?$';
const EMBED_RE = [
  ['youtube', new RegExp('^https://(?:www\\.|m\\.)?youtube\\.com/(?:watch\\?v=|shorts/)([A-Za-z0-9_-]{11})' + EMBED_Q), m => `https://www.youtube.com/watch?v=${m[1]}`, m => m[1]],
  ['youtube', new RegExp('^https://youtu\\.be/([A-Za-z0-9_-]{11})' + EMBED_Q), m => `https://www.youtube.com/watch?v=${m[1]}`, m => m[1]],
  ['instagram', new RegExp('^https://(?:www\\.)?instagram\\.com/(?:[A-Za-z0-9._]{1,30}/)?(p|reels?|tv)/([A-Za-z0-9_-]{5,40})/?' + EMBED_Q),
    m => `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`, m => m[2]],
  ['tiktok', new RegExp('^https://(?:www\\.|m\\.)?tiktok\\.com/@([A-Za-z0-9._]{2,24})/video/([0-9]{8,25})/?' + EMBED_Q), m => `https://www.tiktok.com/@${m[1]}/video/${m[2]}`, m => m[2]],
  ['tiktok', /^https:\/\/(?:vm|vt)\.tiktok\.com\/([A-Za-z0-9]{5,20})\/?$/, m => `https://vm.tiktok.com/${m[1]}/`, m => m[1]],
];
export function parseEmbed(url) {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u || u.length > 300) return null;
  for (const [platform, re, norm, id] of EMBED_RE) {
    const m = re.exec(u);
    if (m) return { platform, id: id(m), url: norm(m) };
  }
  return null;
}

const VIDEO_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
export const PHOTO_SOURCE_MAX_MB = 30;   // originál pred zmenšením; po zmenšení platí photo_max_mb
/* Kontrola súboru pred nahratím: { kind, ext, duration (celé sekundy), error ('' = ok) }.
   Fotka sa vždy zmenší na JPEG (canvas zahodí EXIF aj polohu). Dĺžku videa zistí prehliadač. */
export function validateMedia({ type, size, duration } = {}, cfg) {
  const t = String(type || '').toLowerCase();
  if (t.startsWith('image/')) {
    if (!(size <= PHOTO_SOURCE_MAX_MB * 1024 * 1024)) return { kind: 'photo', ext: 'jpg', duration: null, error: T.clips.errPhotoBig(PHOTO_SOURCE_MAX_MB) };
    return { kind: 'photo', ext: 'jpg', duration: null, error: '' };
  }
  const ext = VIDEO_EXT[t];
  if (!ext) return { kind: null, ext: null, duration: null, error: T.clips.errType };
  if (!(size <= cfg.video_max_mb * 1024 * 1024)) return { kind: 'video', ext, duration: null, error: T.clips.errVideoBig(cfg.video_max_mb) };
  const sec = Math.round(Number(duration));
  if (!Number.isFinite(Number(duration)) || sec < 1) return { kind: 'video', ext, duration: null, error: T.clips.errDuration };
  if (sec > cfg.video_max_seconds) return { kind: 'video', ext, duration: sec, error: T.clips.errVideoLong(sec, cfg.video_max_seconds) };
  return { kind: 'video', ext, duration: sec, error: '' };
}

/* Čas klipu po slovensky: teraz, pred 5 min, pred 3 h, včera, pred 2 dňami, potom dátum. */
export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'teraz';
  if (s < 3600) return `pred ${Math.floor(s / 60)} min`;
  if (s < 86400) return `pred ${Math.floor(s / 3600)} h`;
  if (s < 2 * 86400) return 'včera';
  if (s < 7 * 86400) return `pred ${Math.floor(s / 86400)} dňami`;
  const d = new Date(t);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/* ---------- crews a Turf Wars (011, 017) ---------- */
export const CREW_COLORS = ['#FF3DA5', '#6FF3FF', '#FFD23F', '#FF7A1A', '#7CFF6B', '#B48CFF', '#FF3B3B', '#F3EBDD'];
/* Formulár novej crew: názov 2 až 30, TAG 2 až 4 (A až Z, 0 až 9), farba z palety. Rozhoduje DB (011). */
export function validateCrew({ name, tag, color } = {}) {
  const errors = {};
  const p_name = clean(name);
  const p_tag = clean(tag).toUpperCase();
  if (p_name.length < 2 || p_name.length > 30) errors.name = T.crew.errName;
  if (!/^[A-Z0-9]{2,4}$/.test(p_tag)) errors.tag = T.crew.errTag;
  if (!CREW_COLORS.includes(color)) errors.color = T.crew.errColor;
  return { errors, value: { p_name, p_tag, p_color: color } };
}

export const crewInviteHash = code => `#/hra/crew/pridat/${code}`;
/* Kód z políčka: samotný kód (aj malými, s medzerami) alebo celý odkaz /hra/crew/pridat/<KÓD>. '' = neplatný. */
export function parseInviteCode(input) {
  const s = typeof input === 'string' ? input.trim() : '';
  const m = /\/hra\/crew\/pridat\/([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(s);
  const code = (m ? m[1] : s.replace(/\s+/g, '')).toUpperCase();
  return /^[A-Z0-9]{8}$/.test(code) ? code : '';
}

/* Crews na spote zoradené podľa bodov (spot_crew_scores), najviac n. */
export const topTurf = (rows, n = 5) => [...(rows || [])].sort((a, b) => b.points - a.points).slice(0, n);
/* Jedna veta o súboji na spote. */
export function turfLine(rows, minPoints = 100) {
  const [a, b] = topTurf(rows, 2);
  if (!a) return '';
  if (!b) return a.points >= minPoints ? T.crew.turfSolo(a.tag, a.points) : T.crew.turfNeed(a.tag, a.points, minPoints);
  if (a.points === b.points) return T.crew.turfTie(a.tag, b.tag, a.points);
  return T.crew.turfLead(a.tag, a.points, b.points, b.tag);
}

/* ---------- loot a loadout (012, 018) ---------- */
export const MAX_BOARD_STICKERS = 8;   // assets/board.js MAX_STICKERS
const STICKER_KINDS = ['sticker', 'badge'];
/* Gear -> nálepka pre assets/board.js (stickerCanvas). */
export const gearSticker = g => (g.kind === 'badge' ? { kind: 'round', title: g.name } : { kind: 'band', title: g.name, sub: 'Ghoskate' });

/* Katalóg + odomknuté -> { owned, locked, placed }. Nalepiť sa dá len vlastná nálepka, najviac 8.
   Bez uloženého zoznamu (config.stickers chýba) sú nalepené všetky vlastné. */
export function loadoutState(catalog, unlockedIds, config = {}) {
  const have = new Set(unlockedIds || []);
  const stickers = (catalog || []).filter(g => STICKER_KINDS.includes(g.kind));
  const owned = stickers.filter(g => have.has(g.id));
  const locked = stickers.filter(g => !have.has(g.id));
  const ownedIds = new Set(owned.map(g => g.id));
  const wanted = Array.isArray(config?.stickers) ? config.stickers : owned.map(g => g.id);
  const placed = [...new Set(wanted)].filter(id => ownedIds.has(id)).slice(0, MAX_BOARD_STICKERS);
  return { owned, locked, placed };
}

/* Čo sa uloží cez set_loadout: vzhľad (kľúče z board.js) a nalepené nálepky. */
export function loadoutConfig(look = {}, stickers = []) {
  const out = {};
  for (const k of ['deck', 'grip', 'wheels', 'trucks']) if (typeof look[k] === 'string' && /^[a-z]{1,20}$/.test(look[k])) out[k] = look[k];
  return { ...out, stickers: [...stickers].slice(0, MAX_BOARD_STICKERS) };
}

/* Tiery dropu ako vety: „1. až 3.: Doska (Top 3)“. */
export function tierLines(tiers) {
  let from = 1;
  return [...(tiers || [])].sort((a, b) => a.up_to - b.up_to).map(t => {
    const range = t.up_to > from ? `${from}. až ${t.up_to}.` : `${t.up_to}.`;
    from = t.up_to + 1;
    return `${range}: ${t.reward ? `${t.reward} (${t.label})` : t.label}`;
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Formulár admina (rovnaké pravidlá ako api/admin/loot.js parseDropInput, rozhoduje server). */
export function validateLootDrop({ spot_id, title, tiers = [], ...rest } = {}) {
  const errors = {};
  if (!UUID_RE.test(String(spot_id || ''))) errors.spot_id = T.lootAdmin.errSpot;
  const t = clean(title);
  if (!t || t.length > 80) errors.title = T.lootAdmin.errTitle;
  let prev = 0;
  const out = tiers.map((x, i) => {
    const up = Number(x.up_to);
    const tier = { label: clean(x.label), up_to: up, reward: clean(x.reward) || null, code: clean(x.code), gear_id: x.gear_id || null };
    if (!tier.label || tier.label.length > 40) errors[`tiers.${i}.label`] = T.lootAdmin.errLabel;
    if (!Number.isInteger(up) || up <= prev || up > 100000) errors[`tiers.${i}.up_to`] = T.lootAdmin.errUpTo; else prev = up;
    if (!tier.code || tier.code.length > 100) errors[`tiers.${i}.code`] = T.lootAdmin.errCode;
    return tier;
  });
  if (!out.length || out.length > 10) errors.tiers = T.lootAdmin.errTiers;
  return { errors, value: { ...rest, spot_id, title: t, tiers: out } };
}

/* Stav GoskoLoot NFT pri odmene ('' = drop bez NFT). */
export function nftLabel(r) {
  if (!r?.nft_type) return '';
  if (r.nft_status === 'minted') return T.loot.nftMinted;
  if (r.nft_status === 'failed' || r.nft_status === 'pending') return T.loot.nftPending;
  return T.loot.nftAvailable;
}

/* ---------- herný profil (019) ---------- */
export const AVATARS = { ghost: 'Duch', skull: 'Lebka', wheel: 'Koliesko', spray: 'Sprej', crown: 'Koruna', bolt: 'Blesk' };
export function validateProfile({ username, city, stance, avatar, color } = {}) {
  const errors = {};
  const p_username = clean(username);
  const p_city = clean(city) || null;
  const p_stance = stance || null;
  if (!USERNAME_RE.test(p_username)) errors.username = T.onboarding.errUsername;
  if (p_city && p_city.length > 60) errors.city = T.profile.errCity;
  if (p_stance && !['regular', 'goofy'].includes(p_stance)) errors.stance = T.profile.errStance;
  if (!Object.hasOwn(AVATARS, avatar)) errors.avatar = T.profile.errAvatar;
  if (!CREW_COLORS.includes(color)) errors.color = T.crew.errColor;
  return { errors, value: { p_username, p_city, p_stance, p_avatar: avatar, p_color: color } };
}
