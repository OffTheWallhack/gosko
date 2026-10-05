/* Dáta hry cez Supabase klienta zo store (RPC a pohľady z kontraktu §8) a Vercel API /api/game/*.
   Chyba RPC je GameError s kódom (TOO_FAR, NEED_GUARDIAN, …) a slovenskou hláškou z logic.js. */
import { UserError } from '../util.js';
import { apiRequest, browserFetch } from '../api.js';
import { errorMessage, parseRpcError } from './logic.js';

export class GameError extends UserError {
  constructor(err) {
    super(errorMessage(err));
    const { code, details } = parseRpcError(err);
    this.code = code;
    this.details = details;
  }
}

/* game_cfg() keď server neodpovie: rovnaké čísla ako v 010 */
export const DEFAULT_CFG = { checkin_radius_m: 150, checkin_max_minutes: 120, points_per_minute: 1, spots_per_day: 5, report_ttl_hours: 6, guardian_age: 16 };

const SUMMARY_COLS = 'id,name,city,kind,description,lat,lng,photo_url,needs_verification,skulls,ratings,people_now,status,bust,control_crew_id,control_tag,control_color,control_points,loot_active';

export function createGameApi({ sb, apiBase = '', fetch = browserFetch }) {
  const must = ({ data, error }) => { if (error) throw new GameError(error); return data; };
  const rpc = async (fn, args = {}) => {
    let out;
    try { out = await sb.rpc(fn, args); } catch (err) { throw new GameError(err); }
    return must(out);
  };
  const token = async () => (await sb.auth.getSession()).data.session?.access_token || '';
  const api = async (method, body) => {
    const t = await token();
    if (!t) throw new UserError('Prihlásenie vypršalo. Prihlás sa znova.');
    return apiRequest(fetch, `${apiBase}/api/game/link-rider`, { method, body, token: t });
  };
  let cfgCache = null;

  return {
    async signedIn() { return Boolean(await token()); },
    async cfg() {
      if (!cfgCache) cfgCache = rpc('game_cfg').then(c => ({ ...DEFAULT_CFG, ...c })).catch(() => DEFAULT_CFG);
      return cfgCache;
    },
    /* vlastný profil alebo null (prihlásený bez hráča); neprihlásený null bez volania */
    async me() { return (await token()) ? rpc('game_me') : null; },
    async summary() { return must(await sb.from('spot_summary').select(SUMMARY_COLS).limit(3000)); },
    async openCheckin() {
      return must(await sb.from('check_ins').select('id,spot_id,started_at,ended_at').is('ended_at', null).limit(1).maybeSingle());
    },
    async checkinCount() {
      const { count, error } = await sb.from('check_ins').select('id', { count: 'exact', head: true });
      if (error) throw new GameError(error);
      return count || 0;
    },
    async myRating(spotId) { return (must(await sb.from('spot_ratings').select('skulls').eq('spot_id', spotId).maybeSingle()))?.skulls ?? null; },
    checkIn: (spot, lat, lng) => rpc('check_in', { p_spot: spot, p_lat: lat, p_lng: lng }),
    checkOut: () => rpc('check_out'),
    addSpot: v => rpc('add_spot', v),
    rateSpot: (spot, skulls) => rpc('rate_spot', { p_spot: spot, p_skulls: skulls }),
    reportSpot: (spot, status, bust) => rpc('report_spot', { p_spot: spot, p_status: status || null, p_bust: bust || null }),
    async leaderboard() { return must(await sb.from('crew_leaderboard').select('crew_id,name,tag,color,members,points,spots_controlled,rank').order('rank').limit(50)); },
    /* onboarding (api/game/link-rider.js) */
    linkStatus: () => api('GET'),
    link: body => api('POST', body),
    resendGuardian: () => api('POST', { resend_guardian: true }),
    async logout() { await sb.auth.signOut(); },
  };
}
