/* Čistá logika hry bez DOM (testuje sa v Node, tests/unit/game-logic.test.js):
   vzdialenosť, hlášky chýb RPC a polohy, U16, piny zo spot_summary, reduced motion, formulár spotu. */
import { T } from './i18n-sk.js';
import { ageAt, U16_LIMIT } from '../register.js';

export const GAME_MENU = [
  { id: 'map', label: T.menu.map, href: '#/mapa' },
  { id: 'feed', label: T.menu.feed, href: '#/feed' },
  { id: 'crew', label: T.menu.crew, href: '#/crew' },
  { id: 'board', label: T.menu.board, href: '#/hra/rebricek' },
  { id: 'loadout', label: T.menu.loadout, href: '#/loadout' },
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
