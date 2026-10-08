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
export const DEFAULT_CFG = { checkin_radius_m: 150, checkin_max_minutes: 120, points_per_minute: 1, spots_per_day: 5, report_ttl_hours: 6, guardian_age: 16,
  video_max_seconds: 60, video_max_mb: 50, photo_max_mb: 10, clips_per_day: 20, crew_max: 10, control_min_points: 100 };
export const MEDIA_BUCKET = 'media';
const CLIP_COLS = 'id,spot_id,spot_name,username,crew_id,crew_tag,crew_color,media_kind,media_path,embed_url,trick,duration_s,verified,likes,created_at';
export const FEED_PAGE = 12;

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
    /* klipy a feed (016). Súbory v súkromnom buckete media: prehrávač dostane podpísané URL na 1 h. */
    async feed({ spotId = null, before = null, limit = FEED_PAGE } = {}) {
      let q = sb.from('clips_public').select(CLIP_COLS).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (spotId) q = q.eq('spot_id', spotId);
      if (before) q = q.lt('created_at', before);
      return must(await q);
    },
    async signMedia(paths) {
      const list = [...new Set((paths || []).filter(Boolean))];
      if (!list.length) return {};
      const { data, error } = await sb.storage.from(MEDIA_BUCKET).createSignedUrls(list, 3600);
      if (error) throw new GameError(error);
      return Object.fromEntries((data || []).filter(d => d.signedUrl && !d.error).map(d => [d.path, d.signedUrl]));
    },
    async myLikes(clipIds) {
      if (!clipIds.length || !(await token())) return new Set();
      return new Set(must(await sb.from('clip_likes').select('clip_id').in('clip_id', clipIds)).map(r => r.clip_id));
    },
    likeClip: id => rpc('like_clip', { p_clip: id }),
    unlikeClip: id => rpc('unlike_clip', { p_clip: id }),
    addClip: args => rpc('add_clip', args),
    async uploadMedia(path, blob, contentType) {
      const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType, upsert: false, cacheControl: '3600' });
      if (error) throw new GameError({ message: /exceeded|too large|413/i.test(error.message || '') ? 'MEDIA_TOO_BIG' : /row-level|security|403|Unauthorized/i.test(error.message || '') ? 'NEED_MEDIA_CONSENT' : 'UNKNOWN' });
    },
    async removeMedia(path) { if (path) await sb.storage.from(MEDIA_BUCKET).remove([path]); },
    async deleteClip(id) {
      const out = await rpc('delete_clip', { p_clip: id });
      if (out?.media_path) await sb.storage.from(MEDIA_BUCKET).remove([out.media_path]).catch(() => {});
      return out;
    },
    withdrawMedia: () => rpc('withdraw_media_consent'),
    async isAdmin() { if (!(await token())) return false; try { return (await rpc('is_admin')) === true; } catch { return false; } },
    /* admin: skryté klipy s prezývkou a skrytie (update hidden, politika z 010) */
    async adminHiddenClips() {
      return must(await sb.from('clips').select('id,spot_id,media_kind,media_path,embed_url:media_url,trick,duration_s,verified,created_at,player:players!clips_player_id_fkey(username),spot:spots(name)')
        .eq('hidden', true).order('created_at', { ascending: false }).limit(50));
    },
    async setClipHidden(id, hidden) { must(await sb.from('clips').update({ hidden }).eq('id', id)); },
    /* crews a Turf Wars (011, 017) */
    myCrew: () => rpc('my_crew'),
    crewPreview: code => rpc('crew_preview', { p_code: code }),
    createCrew: v => rpc('create_crew', v),
    joinCrew: code => rpc('join_crew', { p_code: code }),
    leaveCrew: () => rpc('leave_crew'),
    kickMember: playerId => rpc('kick_crew_member', { p_player: playerId }),
    rotateInvite: () => rpc('rotate_invite_code'),
    async spotTurf(spotId) { return must(await sb.from('spot_crew_scores').select('crew_id,tag,color,points').eq('spot_id', spotId).order('points', { ascending: false }).limit(5)); },
    /* onboarding (api/game/link-rider.js) */
    linkStatus: () => api('GET'),
    link: body => api('POST', body),
    resendGuardian: () => api('POST', { resend_guardian: true }),
    async logout() { await sb.auth.signOut(); },
  };
}
