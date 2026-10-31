import { UserError } from './util.js';
import { loadScript } from './qr.js';
import { apiRequest, browserFetch } from './api.js';

/* @supabase/supabase-js 2.117.2 (UMD, globál window.supabase), uložené na webe: assets/vendor/SOURCES.txt.
   Používa sa pri CONFIG.BACKEND_V2 (bez závislosti od CDN); inak ide knižnica z jsDelivr ako doteraz. */
const SUPABASE_JS = 'assets/vendor/supabase-2.117.2.js';

const uid = () => Math.random().toString(36).slice(2, 10);
export const newToken = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const LS = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

const SEEDS = [
  { name: 'Plaza pri Dunaji', author: 'GOSko crew', location: 'Bratislava', place: 'ukážkový park',
    layout: [{ type: 'ledge', x: 1, z: 1, rot: 0 }, { type: 'rail', x: 4, z: 1, rot: 0 }, { type: 'manual', x: 7, z: 1, rot: 0 },
             { type: 'stairs', x: 1, z: 4, rot: 0 }, { type: 'funbox', x: 4, z: 4, rot: 0 }, { type: 'kicker', x: 8, z: 5, rot: 2 }] },
  { name: 'Mini U v parku', author: 'GOSko crew', location: 'Slovensko', place: 'ukážkový park',
    layout: [{ type: 'halfpipe', x: 3, z: 0, rot: 0 }, { type: 'kicker', x: 1, z: 4, rot: 0 }, { type: 'bank', x: 7, z: 4, rot: 2 },
             { type: 'rail', x: 3, z: 6, rot: 0 }, { type: 'quarter', x: 0, z: 6, rot: 2 }] },
];

/* doručené formuláre, ktoré admin vidí a exportuje */
export const INBOX = {
  registrations: 'Registrácie na eventy',
  newsletter_subscribers: 'Odber noviniek',
  bookings: 'Objednávky pop-upov',
  shop_interest: 'Záujem o shop',
  privacy_requests: 'Žiadosti o súkromie',
  profiles: 'Skejteri (spoločný profil GOSko a Ghoskate)',
};

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
/* cesta súboru v úložisku 'spots' z jeho verejnej adresy (alebo null, ak fotka nie je z úložiska) */
const spotPathFromUrl = url => { const m = /\/object\/public\/spots\/(.+?)(?:\?.*)?$/.exec(url || ''); return m ? decodeURIComponent(m[1]) : null; };

/* ---------- BACKEND_V2 (registrácia v2, GoskoPass, admin cez API): pomocníci ---------- */
/* Riadky pohľadu registrations_admin pre admin výsledkov. Meno je verejné meno podľa voľby jazdca; U16 bez súhlasu
   rodiča meno nemá a dostane zástupné „Jazdec U16 #abcd“ (stabilné podľa ID, aby sa dalo spárovať s registráciou). */
export const adminRegistrations = rows => rows.map(r => ({
  id: r.id, category: r.category, status: r.status, checked_in_at: r.checked_in_at,
  name: r.public_name || `Jazdec U16 #${String(r.id).slice(0, 4)}`,
}));

/* Riadky pohľadu results_public (+ krajina z riders_public) do tvaru { event_id, category, rider_name, place, rider_id, country?, nft? }.
   Staršie výsledky bez registrácie majú rider_id null. */
export function mapPublicResults(rows, riders = []) {
  const country = new Map(riders.map(r => [r.id, r.country]));
  return rows.map(r => {
    const out = { event_id: r.event_id, category: r.category, rider_name: r.public_name, place: r.place, rider_id: r.rider_id ?? null };
    if (r.rider_id && country.get(r.rider_id)) out.country = country.get(r.rider_id);
    if (r.token_id != null && r.token_id !== '') out.nft = { chain_id: r.chain_id, token_id: String(r.token_id), status: r.nft_status };
    return out;
  });
}

const DEMO_API = 'V ukážkovom režime (bez databázy) to nefunguje.';
const POST_COLS = 'id,created_at,title,summary,body,image_url,link,link_label,author,pinned,published,event_id';
/* Kam vedie odkaz z e-mailu (Supabase Auth): koreň webu, nie aktuálna podstránka (/profil, /mapa…). */
const appRoot = () => (typeof document !== 'undefined' ? new URL('./', document.baseURI).href : location.origin + '/');

function demoStore() {
  const K = { parks: 'gosko:parks', votes: 'gosko:votes', events: 'gosko:community-events', spots: 'gosko:spots',
    results: 'gosko:results', awards: 'gosko:awards', brackets: 'gosko:brackets', photos: 'gosko:event-photos' };
  const loadParks = () => {
    let p = LS.get(K.parks, null);
    if (!p) { p = SEEDS.map((s, i) => ({ ...s, id: 'seed-' + i, votes: 0, created: Date.now() - (i + 1) * 864e5 })); LS.set(K.parks, p); }
    return p;
  };
  const add = (key, obj) => {
    const a = LS.get(key, []); const row = { id: uid(), created: Date.now(), ...obj }; a.unshift(row);
    if (!LS.set(key, a)) throw new Error('Prehliadač nemá voľné miesto na uloženie.');
    return row;
  };
  const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  return {
    mode: 'demo',
    client: null,
    onAuth() {},
    async listOfficialEvents() { return []; },
    async accessToken() { return ''; },
    async adminCheckin() { throw new UserError(DEMO_API); },
    async eventRegistrations() { return []; },
    async signedIn() { return true; },
    async email() { return ''; },
    async login() {}, async loginPassword() {}, async verifyCode() {}, async verifyLink() {}, async setPassword() {}, async logout() {},
    async listParks() { return loadParks(); },
    async myVotes() { return new Set(LS.get(K.votes, [])); },
    async submitPark(park) {
      const p = loadParks(); p.push({ ...park, id: uid(), votes: 0, created: Date.now() });
      if (!LS.set(K.parks, p)) throw new Error('Park sa nepodarilo uložiť. Prehliadač nemá voľné miesto.');
      return { pending: false };
    },
    async vote(id, on) {
      const p = loadParks(), x = p.find(q => q.id === id); if (x) x.votes = Math.max(0, x.votes + (on ? 1 : -1)); LS.set(K.parks, p);
      const v = new Set(LS.get(K.votes, [])); on ? v.add(id) : v.delete(id); LS.set(K.votes, [...v]);
    },
    async listEvents() { return LS.get(K.events, []).map(e => ({ ...e, pending: !e.approved })); },
    async submitEvent(e) { add(K.events, { ...e, approved: false }); return { pending: true }; },
    async listSpots() { return LS.get(K.spots, []).map(s => ({ ...s, pending: !s.approved })); },
    async submitSpot(s, photo) { add(K.spots, { ...s, photo_url: photo ? await toDataUrl(photo) : null, approved: false }); return { pending: true }; },
    async send(table, row) { return add('gosko:' + table, row); },
    async subscribe(email, source) {
      const a = LS.get('gosko:newsletter_subscribers', []);
      if (a.some(r => r.email === email)) return { already: true };
      add('gosko:newsletter_subscribers', { email, source, consent: true }); return { already: false };
    },
    async findRegistration(token) { return LS.get('gosko:registrations', []).find(r => r.token === token) || null; },
    async checkIn(token) {
      const a = LS.get('gosko:registrations', []); const r = a.find(x => x.token === token);
      if (r && !r.checked_in_at) { r.checked_in_at = new Date().toISOString(); LS.set('gosko:registrations', a); }
      return r;
    },
    async isAdmin() { return true; },
    async pendingParks() { return []; },
    async pendingEvents() { return LS.get(K.events, []).filter(e => !e.approved); },
    async pendingSpots() { return LS.get(K.spots, []).filter(e => !e.approved); },

    /* ---------- admin: správa spotov (ukážkový režim, všetko v prehliadači) ---------- */
    async adminListSpots() {
      return LS.get(K.spots, []).map(s => {
        const photos = (s.photos || []).map(p => ({ ...p, spot_id: s.id }));
        if (s.photo_url && !photos.some(p => p.url === s.photo_url)) photos.unshift({ id: null, url: s.photo_url, legacy: true, spot_id: s.id });
        return { ...s, photos };
      });
    },
    async adminSaveSpot(s) {
      const a = LS.get(K.spots, []);
      const row = { name: s.name, city: s.city, area: s.area || null, kind: s.kind || 'Skatepark', tag: s.tag || null, description: s.description || null,
        lat: s.lat, lng: s.lng, approved: s.approved !== false };
      let id = s.id;
      if (id) { const x = a.find(q => q.id === id); if (x) Object.assign(x, row); }
      else { id = uid(); a.unshift({ id, created: Date.now(), photos: [], ...row }); }
      if (!LS.set(K.spots, a)) throw new Error('Prehliadač nemá voľné miesto na uloženie.');
      return id;
    },
    async adminDeleteSpot(id) { LS.set(K.spots, LS.get(K.spots, []).filter(x => x.id !== id)); },
    async adminAddSpotPhoto(spot_id, blob) {
      const a = LS.get(K.spots, []), s = a.find(x => x.id === spot_id); if (!s) return;
      (s.photos = s.photos || []).push({ id: uid(), url: await toDataUrl(blob) });
      if (!LS.set(K.spots, a)) throw new Error('Prehliadač nemá voľné miesto na uloženie fotky.');
    },
    async adminDeleteSpotPhoto(photo) {
      const a = LS.get(K.spots, []), s = a.find(x => x.id === photo.spot_id); if (!s) return;
      if (photo.id) s.photos = (s.photos || []).filter(p => p.id !== photo.id); else s.photo_url = null;
      LS.set(K.spots, a);
    },
    async adminSetSpotCover(photo) {
      const a = LS.get(K.spots, []), s = a.find(x => x.id === photo.spot_id); if (!s || !photo.id) return;
      s.photos = [(s.photos || []).find(p => p.id === photo.id), ...(s.photos || []).filter(p => p.id !== photo.id)].filter(Boolean);
      LS.set(K.spots, a);
    },
    async pendingEventPhotos() { return LS.get(K.photos, []).filter(e => !e.approved); },
    async approve(kind, id) {
      const key = { spots: K.spots, events: K.events, photos: K.photos }[kind]; if (!key) return;
      const a = LS.get(key, []); const e = a.find(x => x.id === id); if (e) e.approved = true; LS.set(key, a);
    },
    async reject(kind, id) {
      const key = { spots: K.spots, events: K.events, photos: K.photos, parks: K.parks }[kind]; if (!key) return;
      LS.set(key, LS.get(key, []).filter(x => x.id !== id));
    },
    async inbox(table) { return LS.get('gosko:' + table, []); },

    /* výsledky, pavúky, ocenenia */
    async listResults() { return LS.get(K.results, []); },
    async listAwards() { return LS.get(K.awards, []); },
    async listBrackets() { return Object.values(LS.get(K.brackets, {})); },
    async saveBracket(event_id, category, data) {
      const all = LS.get(K.brackets, {}); all[event_id + '|' + category] = { event_id, category, data, updated_at: new Date().toISOString() };
      if (!LS.set(K.brackets, all)) throw new Error('Pavúk sa nepodarilo uložiť.');
    },
    async deleteBracket(event_id, category) { const all = LS.get(K.brackets, {}); delete all[event_id + '|' + category]; LS.set(K.brackets, all); },
    async saveResults(event_id, category, rows) {
      const keep = LS.get(K.results, []).filter(r => !(r.event_id === event_id && r.category === category));
      LS.set(K.results, [...keep, ...rows.map(r => ({ event_id, category, rider_name: r.name, place: r.place }))]);
    },
    async deleteResults(event_id, category) { LS.set(K.results, LS.get(K.results, []).filter(r => !(r.event_id === event_id && r.category === category))); },
    async saveAwards(event_id, list) {
      const keep = LS.get(K.awards, []).filter(a => a.event_id !== event_id);
      LS.set(K.awards, [...keep, ...list.map(a => ({ event_id, name: a.name, rider_name: a.rider_name }))]);
    },

    async setEventImage(id, photo) {
      const a = LS.get(K.events, []); const e = a.find(x => x.id === id); if (e) e.image_url = await toDataUrl(photo); LS.set(K.events, a);
    },
    /* novinky */
    async listPosts() { return LS.get('gosko:posts', []).filter(p => p.published !== false); },
    async allPosts() { return LS.get('gosko:posts', []); },
    async getPost(id) { return LS.get('gosko:posts', []).find(p => p.id === id) || null; },
    async savePost(row, photo) {
      const a = LS.get('gosko:posts', []);
      const image_url = photo ? await toDataUrl(photo) : row.image_url || null;
      if (row.id) { const i = a.findIndex(x => x.id === row.id); if (i >= 0) a[i] = { ...a[i], ...row, image_url }; }
      else a.unshift({ ...row, image_url, id: uid(), created_at: new Date().toISOString(), created: Date.now() });
      if (!LS.set('gosko:posts', a)) throw new Error('Prehliadač nemá voľné miesto na uloženie.');
    },
    async deletePost(id) { LS.set('gosko:posts', LS.get('gosko:posts', []).filter(x => x.id !== id)); },
    async setPostImage(id, photo) {
      const a = LS.get('gosko:posts', []), x = a.find(p => p.id === id); if (!x) return;
      x.image_url = photo ? await toDataUrl(photo) : null; LS.set('gosko:posts', a);
    },

    /* profily, triky, hodnotenia: v ukážkovom režime len v prehliadači */
    async me() { return { id: 'demo', email: '' }; },
    async riderProfiles() { return LS.get('gosko:rider-profiles', []); },
    async myRiderProfile() { return LS.get('gosko:rider-profiles', []).find(r => r.user_id === 'demo') || null; },
    async claimRider(slug, fields) { const a = LS.get('gosko:rider-profiles', []); if (a.some(r => r.slug === slug)) throw new Error('taken'); a.push({ slug, user_id: 'demo', status: 'approved', ...fields }); LS.set('gosko:rider-profiles', a); },
    async saveRiderProfile(slug, fields, photo) { const a = LS.get('gosko:rider-profiles', []); const r = a.find(x => x.slug === slug); if (r) Object.assign(r, fields, photo ? { photo_url: await toDataUrl(photo) } : {}); LS.set('gosko:rider-profiles', a); },
    async saveRiderLoadout(loadout) { const a = LS.get('gosko:rider-profiles', []); const r = a.find(x => x.user_id === 'demo'); if (r) { r.loadout = loadout; LS.set('gosko:rider-profiles', a); } },
    async adminRiderPhoto(slug, photo) { const a = LS.get('gosko:rider-profiles', []); let r = a.find(x => x.slug === slug); if (!r) { r = { slug, status: 'approved' }; a.push(r); } r.photo_url = await toDataUrl(photo); LS.set('gosko:rider-profiles', a); },
    async pendingRiderClaims() { return LS.get('gosko:rider-profiles', []).filter(r => r.status === 'pending'); },
    async setRiderStatus(slug, status) { const a = LS.get('gosko:rider-profiles', []); const r = a.find(x => x.slug === slug); if (r) r.status = status; LS.set('gosko:rider-profiles', a); },
    async releaseRider(slug) { const a = LS.get('gosko:rider-profiles', []); const r = a.find(x => x.slug === slug); if (r) r.user_id = null; LS.set('gosko:rider-profiles', a); },
    async currentChallenge() { return LS.get('gosko:challenge', null) || { id: 'demo', title: 'Kickflip cez niečo', description: 'Kickflip cez prekážku. Pošli klip, vyberieme tri najlepšie a hlasujete.', status: 'open', ends_on: null }; },
    async pastChallenges() { return []; },
    async trickResults() { return LS.get('gosko:trick-entries', []).filter(e => e.finalist).map(e => ({ ...e, votes: LS.get('gosko:trick-vote', null) === e.id ? 1 : 0 })); },
    async myTrickEntries() { return LS.get('gosko:trick-entries', []); },
    async submitTrick(challenge_id, row, video) { add('gosko:trick-entries', { ...row, challenge_id, finalist: false, video_url: video ? URL.createObjectURL(video) : null }); },
    async myTrickVote() { return LS.get('gosko:trick-vote', null); },
    async voteTrick(c, entry_id) { LS.set('gosko:trick-vote', entry_id); },
    async adminTrickEntries() { return LS.get('gosko:trick-entries', []); },
    async setFinalist(id, finalist) { const a = LS.get('gosko:trick-entries', []); const e = a.find(x => x.id === id); if (e) e.finalist = finalist; LS.set('gosko:trick-entries', a); },
    async saveChallenge(row) { LS.set('gosko:challenge', { id: 'demo', ...row }); },
    async spotRatings() { return LS.get('gosko:spot-ratings', []); },
    async rateSpot(spot_key, stars, tags) { const a = LS.get('gosko:spot-ratings', []).filter(r => r.spot_key !== spot_key); a.push({ spot_key, stars, tags, user_id: 'demo' }); LS.set('gosko:spot-ratings', a); },
    /* spoločný profil (duch, doska) a inventár: v ukážkovom režime len v prehliadači */
    async myProfile() { return LS.get('gosko:demo-profile', null); },
    async saveProfile(fields) {
      const cur = LS.get('gosko:demo-profile', null);
      const row = { ...(cur || { id: 'demo', created_at: new Date().toISOString() }), ...fields, updated_at: new Date().toISOString() };
      LS.set('gosko:demo-profile', row);
      if (!cur) { const inv = LS.get('gosko:demo-inventory', []); for (const item of ['skin:founder', 'sticker:founder-2026', 'badge:founder']) if (!inv.includes(item)) inv.push(item); LS.set('gosko:demo-inventory', inv); }
      return row;
    },
    async myInventory() { return LS.get('gosko:demo-inventory', []).map(item => ({ item })); },
    async nicknameFree() { return true; },
    async ghoskateStats() { return { founders: LS.get('gosko:demo-profile', null) ? 1 : 0, spots: LS.get(K.spots, []).length, spots_live: 0 }; },
    async mySpots() { return LS.get(K.spots, []).map(s => ({ ...s, created_at: new Date(s.created).toISOString() })); },
    async myActivity() { return { photos: 0, spots: LS.get(K.spots, []).length, parks: 0, park_votes: LS.get(K.votes, []).length, tricks: LS.get('gosko:trick-entries', []).length, finalist: 0, trick_votes: LS.get('gosko:trick-vote', null) ? 1 : 0, ratings: LS.get('gosko:spot-ratings', []).length, rider: 0, checkins: 0 }; },
    /* fotky a klipy od komunity */
    async listEventPhotos(event_id) { return LS.get(K.photos, []).filter(p => p.event_id === event_id).map(p => ({ ...p, pending: !p.approved })); },
    async submitEventPhoto(row, photo) {
      add(K.photos, { ...row, photo_url: photo ? await toDataUrl(photo) : null, approved: false });
      return { pending: true };
    },
  };
}

async function liveStore(CONFIG) {
  let createClient;
  if (CONFIG.BACKEND_V2) { await loadScript(SUPABASE_JS); ({ createClient } = window.supabase); }
  else ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gosko-auth' },
  });
  const session = async () => (await sb.auth.getSession()).data.session;
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const created = r => ({ ...r, created: Date.parse(r.created_at) });
  const live = {
    mode: 'live',
    /* Supabase klient pre hru Ghoskate na /hra (assets/game/api.js) */
    client: sb,
    onAuth(fn) { sb.auth.onAuthStateChange(() => fn()); },
    /* prihlásenie heslom s novým účtom (CONFIG.LOGIN_MODE 'password', assets/login.js) */
    async signInPassword(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password) { return must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: appRoot() } })); },
    async resendConfirmation(email) { must(await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appRoot() } })); },
    async accessToken() { return (await session())?.access_token || ''; },
    async listOfficialEvents() { return []; },
    async adminCheckin() { throw new UserError('Check-in cez API je vypnutý (CONFIG.BACKEND_V2).'); },
    async eventRegistrations() { return []; },
    async signedIn() { return !!(await session()); },
    async email() { return (await session())?.user?.email || ''; },
    async login(email) { must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })); },
    async loginPassword(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
    async verifyCode(email, token) {
      token = String(token || '').replace(/\s/g, '');
      if (!/^\d{6,8}$/.test(token)) throw new Error('code');
      // prvé prihlásenie je technicky „signup“, ďalšie „email“; skúsime oboje
      let r = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (r.error) r = await sb.auth.verifyOtp({ email, token, type: 'signup' });
      must(r);
    },
    /* Náhradné prihlásenie: človek vloží odkaz z e-mailu alebo adresu, kam ho odkaz hodil (napr. localhost s #access_token=…). */
    async verifyLink(text) {
      let u; try { u = new URL(String(text).trim()); } catch { throw new Error('link'); }
      const hp = new URLSearchParams(u.hash.replace(/^#/, ''));
      if (hp.get('access_token') && hp.get('refresh_token')) { must(await sb.auth.setSession({ access_token: hp.get('access_token'), refresh_token: hp.get('refresh_token') })); return; }
      const token = u.searchParams.get('token') || u.searchParams.get('token_hash'), type = u.searchParams.get('type') || 'email';
      if (token) { must(await sb.auth.verifyOtp({ token_hash: token, type: type === 'magiclink' ? 'email' : type })); return; }
      const code = u.searchParams.get('code');
      if (code) { must(await sb.auth.exchangeCodeForSession(code)); return; }
      throw new Error('link');
    },
    async setPassword(password) { must(await sb.auth.updateUser({ password })); },
    async logout() { await sb.auth.signOut(); },
    async listParks() {
      const data = must(await sb.from('parks_ranked').select('*').order('votes', { ascending: false }).limit(300));
      return data.map(r => ({ ...created(r), place: r.place || '', votes: r.votes | 0 }));
    },
    async myVotes() {
      const s = await session(); if (!s) return new Set();
      return new Set(must(await sb.from('votes').select('park_id').eq('user_id', s.user.id)).map(r => r.park_id));
    },
    async submitPark(p) {
      must(await sb.from('parks').insert({ name: p.name, author: p.author, location: p.location, place: p.place || null, layout: p.layout, thumb: p.thumb }));
      return { pending: true };
    },
    async vote(id, on) {
      const s = await session();
      must(on ? await sb.from('votes').insert({ park_id: id }) : await sb.from('votes').delete().eq('park_id', id).eq('user_id', s.user.id));
    },
    async listEvents() { return must(await sb.from('community_events_public').select('*').order('date')).map(created); },
    async submitEvent(e) { must(await sb.from('community_events').insert(e)); return { pending: true }; },
    async listSpots() { return must(await sb.from('spots_public').select('*').order('created_at', { ascending: false })).map(created); },
    async submitSpot(s, photo) {
      const u = (await session()).user.id;
      let photo_url = null;
      if (photo) {
        const path = `${u}/${newToken()}.jpg`;
        must(await sb.storage.from('spots').upload(path, photo, { contentType: 'image/jpeg', upsert: false }));
        photo_url = sb.storage.from('spots').getPublicUrl(path).data.publicUrl;
      }
      must(await sb.from('spots').insert({ ...s, photo_url }));
      return { pending: true };
    },
    async send(table, row) { must(await sb.from(table).insert(row)); return row; },
    async subscribe(email, source) {
      const { error } = await sb.from('newsletter_subscribers').insert({ email, source, consent: true });
      if (error && error.code === '23505') return { already: true };
      if (error) throw error;
      return { already: false };
    },
    async findRegistration(token) { return must(await sb.from('registrations').select('*').eq('token', token).maybeSingle()); },
    async checkIn(token) {
      must(await sb.from('registrations').update({ checked_in_at: new Date().toISOString() }).eq('token', token).is('checked_in_at', null));
      return this.findRegistration(token);
    },
    async isAdmin() { if (!(await session())) return false; const { data } = await sb.rpc('is_admin'); return !!data; },
    async pendingParks() { return must(await sb.from('parks').select('*').eq('approved', false).order('created_at')).map(created); },
    async pendingEvents() { return must(await sb.from('community_events').select('*').eq('approved', false).order('created_at')).map(created); },
    async pendingSpots() { return must(await sb.from('spots').select('*').eq('approved', false).order('created_at')).map(created); },

    /* ---------- admin: správa spotov a skateparkov (pridať, upraviť, fotky, zmazať) ---------- */
    async adminListSpots() {
      const rows = must(await sb.from('spots').select('*').order('created_at', { ascending: false }));
      const ph = must(await sb.from('spot_photos').select('*').order('sort').order('created_at'));
      return rows.map(r => {
        const photos = ph.filter(p => p.spot_id === r.id);
        /* fotka od používateľa (stĺpec photo_url) sa ukáže tiež, kým ju admin nezmaže */
        if (r.photo_url && !photos.some(p => p.url === r.photo_url)) photos.unshift({ id: null, url: r.photo_url, path: spotPathFromUrl(r.photo_url), legacy: true, spot_id: r.id });
        return { ...created(r), photos };
      });
    },
    async adminSaveSpot(s) {
      const row = { name: s.name, city: s.city, area: s.area || null, kind: s.kind || 'Skatepark', tag: s.tag || null, description: s.description || null,
        lat: s.lat, lng: s.lng, approved: s.approved !== false, updated_at: new Date().toISOString() };
      if (s.id) { must(await sb.from('spots').update(row).eq('id', s.id)); return s.id; }
      return must(await sb.from('spots').insert(row).select('id').single()).id;
    },
    async adminDeleteSpot(id) {
      const ph = must(await sb.from('spot_photos').select('path').eq('spot_id', id));
      const own = must(await sb.from('spots').select('photo_url').eq('id', id).maybeSingle());
      const paths = [...ph.map(p => p.path), spotPathFromUrl(own?.photo_url)].filter(Boolean);
      must(await sb.from('spots').delete().eq('id', id));
      if (paths.length) await sb.storage.from('spots').remove(paths).catch(() => {});
    },
    async adminAddSpotPhoto(spot_id, blob) {
      const u = (await session()).user.id;
      const path = `${u}/${newToken()}.jpg`;
      must(await sb.storage.from('spots').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
      const url = sb.storage.from('spots').getPublicUrl(path).data.publicUrl;
      const last = must(await sb.from('spot_photos').select('sort').eq('spot_id', spot_id).order('sort', { ascending: false }).limit(1));
      must(await sb.from('spot_photos').insert({ spot_id, url, path, sort: (last[0]?.sort ?? -1) + 1 }));
    },
    async adminDeleteSpotPhoto(photo) {
      if (photo.id) must(await sb.from('spot_photos').delete().eq('id', photo.id));
      else must(await sb.from('spots').update({ photo_url: null }).eq('id', photo.spot_id));
      if (photo.path) await sb.storage.from('spots').remove([photo.path]).catch(() => {});
    },
    /* hlavná (prvá) fotka: dostane najnižšie poradie */
    async adminSetSpotCover(photo) {
      if (!photo.id) return;
      const first = must(await sb.from('spot_photos').select('sort').eq('spot_id', photo.spot_id).order('sort').limit(1));
      must(await sb.from('spot_photos').update({ sort: (first[0]?.sort ?? 0) - 1 }).eq('id', photo.id));
    },
    async pendingEventPhotos() { return must(await sb.from('event_photos').select('*').eq('approved', false).order('created_at')).map(created); },
    async approve(kind, id) {
      const table = { parks: 'parks', events: 'community_events', spots: 'spots', photos: 'event_photos' }[kind];
      must(await sb.from(table).update({ approved: true }).eq('id', id));
    },
    async reject(kind, id) {
      const table = { parks: 'parks', events: 'community_events', spots: 'spots', photos: 'event_photos' }[kind];
      if (kind === 'photos') {
        const row = must(await sb.from('event_photos').select('photo_path').eq('id', id).maybeSingle());
        if (row?.photo_path) await sb.storage.from('photos').remove([row.photo_path]);
      }
      must(await sb.from(table).delete().eq('id', id));
    },

    /* výsledky, pavúky, ocenenia */
    async listResults() { return must(await sb.from('event_results').select('event_id,category,rider_name,place').limit(5000)); },
    async listAwards() { return must(await sb.from('event_awards').select('event_id,name,rider_name').limit(1000)); },
    async listBrackets() { return must(await sb.from('brackets').select('event_id,category,data,updated_at').limit(500)); },
    async saveBracket(event_id, category, data) {
      must(await sb.from('brackets').upsert({ event_id, category, data, updated_at: new Date().toISOString() }, { onConflict: 'event_id,category' }));
    },
    async deleteBracket(event_id, category) { must(await sb.from('brackets').delete().eq('event_id', event_id).eq('category', category)); },
    async saveResults(event_id, category, rows) {
      must(await sb.from('event_results').delete().eq('event_id', event_id).eq('category', category));
      if (rows.length) must(await sb.from('event_results').insert(rows.map(r => ({ event_id, category, rider_name: r.name, place: r.place }))));
    },
    async deleteResults(event_id, category) { must(await sb.from('event_results').delete().eq('event_id', event_id).eq('category', category)); },
    async saveAwards(event_id, list) {
      must(await sb.from('event_awards').delete().eq('event_id', event_id));
      if (list.length) must(await sb.from('event_awards').insert(list.map(a => ({ event_id, name: a.name, rider_name: a.rider_name }))));
    },

    async setEventImage(id, photo) {
      const u = (await session()).user.id, path = `${u}/event-${newToken()}.jpg`;
      must(await sb.storage.from('photos').upload(path, photo, { contentType: 'image/jpeg', upsert: false }));
      must(await sb.from('community_events').update({ image_url: sb.storage.from('photos').getPublicUrl(path).data.publicUrl }).eq('id', id));
    },
    /* novinky */
    async listPosts() { return must(await sb.from('posts').select('*').eq('published', true).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100)).map(created); },
    async allPosts() { return must(await sb.from('posts').select('*').order('created_at', { ascending: false }).limit(300)).map(created); },
    async getPost(id) { return must(await sb.from('posts').select('*').eq('id', id).maybeSingle()); },
    async savePost(row, photo) {
      const r = { ...row };
      if (photo) {
        const u = (await session()).user.id;
        r.image_path = `${u}/news-${newToken()}.jpg`;
        must(await sb.storage.from('photos').upload(r.image_path, photo, { contentType: 'image/jpeg', upsert: false }));
        r.image_url = sb.storage.from('photos').getPublicUrl(r.image_path).data.publicUrl;
      }
      const id = r.id; delete r.id; delete r.created; delete r.created_at;
      must(id ? await sb.from('posts').update(r).eq('id', id) : await sb.from('posts').insert(r));
    },
    /* zmena alebo odstránenie titulnej fotky článku (photo = súbor, alebo null na odstránenie) */
    async setPostImage(id, photo) {
      const old = must(await sb.from('posts').select('image_path').eq('id', id).maybeSingle())?.image_path;
      let patch = { image_url: null, image_path: null };
      if (photo) {
        const u = (await session()).user.id, path = `${u}/news-${newToken()}.jpg`;
        must(await sb.storage.from('photos').upload(path, photo, { contentType: 'image/jpeg', upsert: false }));
        patch = { image_path: path, image_url: sb.storage.from('photos').getPublicUrl(path).data.publicUrl };
      }
      must(await sb.from('posts').update(patch).eq('id', id));
      if (old) await sb.storage.from('photos').remove([old]).catch(() => {});
    },
    async deletePost(id) {
      const row = must(await sb.from('posts').select('image_path').eq('id', id).maybeSingle());
      if (row?.image_path) await sb.storage.from('photos').remove([row.image_path]);
      must(await sb.from('posts').delete().eq('id', id));
    },

    /* fotky a klipy od komunity */
    async listEventPhotos(event_id) { return must(await sb.from('event_photos_public').select('*').eq('event_id', event_id).order('created_at', { ascending: false })).map(created); },
    async submitEventPhoto(row, photo) {
      const u = (await session()).user.id;
      let photo_url = null, photo_path = null;
      if (photo) {
        photo_path = `${u}/${newToken()}.jpg`;
        must(await sb.storage.from('photos').upload(photo_path, photo, { contentType: 'image/jpeg', upsert: false }));
        photo_url = sb.storage.from('photos').getPublicUrl(photo_path).data.publicUrl;
      }
      must(await sb.from('event_photos').insert({ ...row, photo_url, photo_path }));
      return { pending: true };
    },
    async inbox(table) { return must(await sb.from(table).select('*').order('created_at', { ascending: false }).limit(2000)).map(created); },
    /* ---------- profily jazdcov ---------- */
    async me() { const s = await session(); return s ? { id: s.user.id, email: s.user.email } : null; },
    async riderProfiles() { return must(await sb.from('rider_profiles').select('*').limit(1000)); },
    async myRiderProfile() { const s = await session(); if (!s) return null; return must(await sb.from('rider_profiles').select('*').eq('user_id', s.user.id).maybeSingle()); },
    async claimRider(slug, fields) {
      const s = await session();
      const { error } = await sb.from('rider_profiles').insert({ slug, user_id: s.user.id, status: 'pending', ...fields });
      if (error) { if (error.code === '23505') throw new Error('taken'); throw error; }
    },
    async saveRiderProfile(slug, fields, photo) {
      const s = await session(), r = { ...fields };
      if (photo) {
        r.photo_path = `${s.user.id}/rider-${newToken()}.jpg`;
        must(await sb.storage.from('photos').upload(r.photo_path, photo, { contentType: 'image/jpeg', upsert: false }));
        r.photo_url = sb.storage.from('photos').getPublicUrl(r.photo_path).data.publicUrl;
      }
      must(await sb.from('rider_profiles').update(r).eq('slug', slug));
    },
    async saveRiderLoadout(loadout) { const s = await session(); if (!s) return; must(await sb.from('rider_profiles').update({ loadout }).eq('user_id', s.user.id)); },
    async adminRiderPhoto(slug, photo) {
      const path = `riders/${slug}-${newToken().slice(0, 8)}.jpg`;
      must(await sb.storage.from('photos').upload(path, photo, { contentType: 'image/jpeg', upsert: false }));
      const photo_url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
      must(await sb.from('rider_profiles').upsert({ slug, photo_url, photo_path: path, status: 'approved' }, { onConflict: 'slug' }));
    },
    async pendingRiderClaims() { return must(await sb.from('rider_profiles').select('*').eq('status', 'pending').order('created_at')); },
    async setRiderStatus(slug, status) { must(await sb.from('rider_profiles').update({ status }).eq('slug', slug)); },
    async releaseRider(slug) { must(await sb.from('rider_profiles').update({ user_id: null, status: 'approved' }).eq('slug', slug)); },

    /* ---------- trik týždňa ---------- */
    async currentChallenge() {
      const list = must(await sb.from('trick_challenges').select('*').order('created_at', { ascending: false }).limit(10));
      return list.find(c => c.status !== 'closed') || list[0] || null;
    },
    async pastChallenges() { return must(await sb.from('trick_challenges').select('*').eq('status', 'closed').order('created_at', { ascending: false }).limit(20)); },
    async trickResults(challenge_id) { return must(await sb.from('trick_results').select('*').eq('challenge_id', challenge_id).order('created_at')); },
    async myTrickEntries(challenge_id) { const s = await session(); if (!s) return []; return must(await sb.from('trick_entries').select('*').eq('challenge_id', challenge_id).eq('user_id', s.user.id)); },
    async submitTrick(challenge_id, row, video) {
      const s = await session(), r = { ...row, challenge_id, user_id: s.user.id };
      if (video) {
        const ext = (video.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
        r.video_path = `${s.user.id}/trick-${newToken()}.${ext}`;
        must(await sb.storage.from('clips').upload(r.video_path, video, { contentType: video.type || 'video/mp4', upsert: false }));
        r.video_url = sb.storage.from('clips').getPublicUrl(r.video_path).data.publicUrl;
      }
      must(await sb.from('trick_entries').insert(r));
    },
    async myTrickVote(challenge_id) { const s = await session(); if (!s) return null; return must(await sb.from('trick_votes').select('entry_id').eq('challenge_id', challenge_id).eq('user_id', s.user.id).maybeSingle())?.entry_id || null; },
    async voteTrick(challenge_id, entry_id) {
      const s = await session();
      must(await sb.from('trick_votes').delete().eq('challenge_id', challenge_id).eq('user_id', s.user.id));
      must(await sb.from('trick_votes').insert({ challenge_id, entry_id, user_id: s.user.id }));
    },
    async adminTrickEntries(challenge_id) { return must(await sb.from('trick_entries').select('*').eq('challenge_id', challenge_id).order('created_at')); },
    async setFinalist(id, finalist) { must(await sb.from('trick_entries').update({ finalist }).eq('id', id)); },
    async saveChallenge(row) { const id = row.id; const r = { ...row }; delete r.id; must(id ? await sb.from('trick_challenges').update(r).eq('id', id) : await sb.from('trick_challenges').insert(r)); },

    /* ---------- hodnotenie spotov, XP ---------- */
    async spotRatings() { return must(await sb.from('spot_ratings').select('spot_key,stars,tags,user_id').limit(5000)); },
    async rateSpot(spot_key, stars, tags) { const s = await session(); must(await sb.from('spot_ratings').upsert({ spot_key, stars, tags, user_id: s.user.id }, { onConflict: 'spot_key,user_id' })); },
    /* ---------- spoločný profil skejtera (GOSko web + Ghoskate) ---------- */
    async myProfile() { const s = await session(); if (!s) return null; return must(await sb.from('profiles').select('*').eq('id', s.user.id).maybeSingle()); },
    /* Uloží profil: existujúci upraví, nový založí. Obsadená prezývka = Error('nickname'). */
    async saveProfile(fields) {
      const s = await session(); if (!s) throw new Error('login');
      const r = { ...fields }; delete r.id; delete r.created_at; delete r.updated_at;
      const up = await sb.from('profiles').update(r).eq('id', s.user.id).select();
      if (up.error) { if (up.error.code === '23505') throw new Error('nickname'); throw up.error; }
      if (up.data?.length) return up.data[0];
      const ins = await sb.from('profiles').insert({ id: s.user.id, ...r }).select().single();
      if (ins.error) { if (ins.error.code === '23505') throw new Error(/nickname/.test(ins.error.message) ? 'nickname' : 'exists'); throw ins.error; }
      return ins.data;
    },
    async myInventory() { const s = await session(); if (!s) return []; return must(await sb.from('inventory').select('item,source,created_at').eq('user_id', s.user.id).order('created_at')); },
    async nicknameFree(nick) { const { data, error } = await sb.rpc('nickname_free', { nick }); if (error) throw error; return !!data; },
    async ghoskateStats() { const { data, error } = await sb.rpc('ghoskate_stats'); if (error) throw error; return data; },
    async mySpots() { const s = await session(); if (!s) return []; return must(await sb.from('spots').select('id,created_at,name,city,approved').eq('user_id', s.user.id).order('created_at', { ascending: false })); },
    async myActivity() { if (!(await session())) return null; const { data, error } = await sb.rpc('my_activity'); if (error) throw error; return data; },
    /* špeciálne veci pre ducha (Halloween, Vianoce, Silvester, 7 dní v kuse): vráti zoznam novo pridaných vecí */
    async claimGhostSpecials() { if (!(await session())) return []; const { data, error } = await sb.rpc('claim_ghost_specials'); if (error) throw error; return Array.isArray(data) ? data : []; },
  };
  if (!CONFIG.BACKEND_V2) return live;

  /* BACKEND_V2: databáza má migrácie supabase/migrations (001 hardening … 019) a beží API (api/*, Vercel).
     Verejné čítanie ide cez pohľady bez osobných údajov, admin zápisy cez API so Supabase JWT, user_id dopĺňa databáza. */
  const api = async (path, body) => {
    const token = (await session())?.access_token;
    if (!token) throw new UserError('Prihlásenie vypršalo. Prihlás sa znova.');
    return apiRequest(browserFetch, (CONFIG.API_BASE || '') + path, { method: 'POST', body, token });
  };
  return Object.assign(live, {
    async listResults() {
      const [rows, riders] = await Promise.all([
        sb.from('results_public').select('event_id,category,place,points,rider_id,public_name,chain_id,token_id,nft_status').limit(5000).then(must),
        sb.from('riders_public').select('id,country').limit(5000).then(must),
      ]);
      return mapPublicResults(rows, riders);
    },
    async listOfficialEvents() { return must(await sb.from('events_public').select('id,name,city,country,date,season,status,registration_open').limit(500)); },
    async adminCheckin(body) { return api('/api/admin/checkin', body); },
    /* pohľad registrations_admin (006) dáva len verejné meno, lebo tieto mená idú do verejných tabuliek brackets a event_awards */
    async eventRegistrations(event_id) {
      return adminRegistrations(must(await sb.from('registrations_admin').select('id,category,status,checked_in_at,public_name').eq('event_id', event_id).neq('status', 'cancelled').limit(2000)));
    },
    /* rows = [{ name, place, registration_id? }]; jedna transakcia na serveri (save_results), prázdny zoznam kategóriu zmaže */
    async saveResults(event_id, category, rows) {
      return api('/api/admin/results', { event_id, category, rows: rows.map(r => ({ rider_name: r.name, place: r.place, ...(r.registration_id ? { registration_id: r.registration_id } : {}) })) });
    },
    async deleteResults(event_id, category) { return api('/api/admin/results', { event_id, category, rows: [] }); },
    /* anon smie čítať len verejné stĺpce noviniek (014: bez user_id a image_path) */
    async listPosts() { return must(await sb.from('posts').select(POST_COLS).eq('published', true).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100)).map(created); },
    async getPost(id) { return must(await sb.from('posts').select(POST_COLS).eq('id', id).maybeSingle()); },
    /* verejne len schválené profily bez user_id a poznámky (015); claimed = profil už niekto prevzal */
    async riderProfiles() { return must(await sb.from('rider_profiles_public').select('*').limit(1000)); },
    /* hodnotenie skateparkov a spotov na webe je v spot_reviews, lebo public.spot_ratings patrí hre (010); user_id vidí len prihlásený */
    async spotRatings() { return must(await sb.from('spot_reviews').select((await session()) ? 'spot_key,stars,tags,user_id' : 'spot_key,stars,tags').limit(5000)); },
    async rateSpot(spot_key, stars, tags) { must(await sb.from('spot_reviews').upsert({ spot_key, stars, tags }, { onConflict: 'spot_key,user_id' })); },
    async claimRider(slug, fields) {
      const { error } = await sb.from('rider_profiles').insert({ slug, status: 'pending', ...fields });   // user_id = auth.uid() dopĺňa databáza
      if (error) { if (error.code === '23505') throw new Error(/user_once/.test(error.message || '') ? 'mine' : 'taken'); throw error; }
    },
  });
}

export { isEmail };
/* mode: 'live' = Supabase; 'demo' = CONFIG je prázdny alebo sa Supabase nenačítal (ukladá sa do prehliadača).
   Pri BACKEND_V2 sa výpadok Supabase nezamení za ukážku: getStore vráti 'offline' a formuláre ukážu chybu
   (žiadny QR pass ani admin, ktoré by neboli v databáze). */
export async function getStore(CONFIG, { timeout = 10000, connect = liveStore } = {}) {
  if (!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY)) return demoStore();
  if (!CONFIG.BACKEND_V2) {
    try { return await connect(CONFIG); } catch (err) { console.error(err); }
    return demoStore();
  }
  let timer;
  try {
    return await Promise.race([connect(CONFIG), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Supabase sa nenačítal včas.')), timeout); })]);
  } catch (err) { console.error(err); return offlineStore(); }
  finally { clearTimeout(timer); }
}

const OFFLINE_MSG = 'Nepodarilo sa spojiť so serverom GOSko. Skontroluj pripojenie, obnov stránku a skús to znova.';
/* každá metóda, ktorá nie je vymenovaná, hodí UserError s textom pre človeka (aj tie, ktoré pribudnú neskôr) */
function offlineStore() {
  const down = async () => { throw new UserError(OFFLINE_MSG); };
  const base = { mode: 'offline', message: OFFLINE_MSG, client: null, onAuth() {}, async signedIn() { return false; }, async email() { return ''; },
    async isAdmin() { return false; }, async myVotes() { return new Set(); }, async logout() {}, async accessToken() { return ''; }, async me() { return null; },
    async myProfile() { return null; }, async myInventory() { return []; } };
  return new Proxy(base, { get: (t, k) => (k in t || typeof k === 'symbol' || k === 'then' ? t[k] : down), has: (t, k) => k !== 'then' });
}
