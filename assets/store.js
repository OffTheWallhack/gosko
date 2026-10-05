import { UserError } from './util.js';
import { loadScript } from './qr.js';
import { apiRequest, browserFetch } from './api.js';

/* @supabase/supabase-js 2.117.2 (UMD, globál window.supabase), uložené na webe: assets/vendor/SOURCES.txt */
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
  registrations_legacy: 'Registrácie na eventy (stará verzia formulára)',
  newsletter_subscribers: 'Odber noviniek',
  bookings: 'Objednávky pop-upov',
  shop_interest: 'Záujem o shop',
  privacy_requests: 'Žiadosti o súkromie',
};

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

/* Riadky pohľadu results_public (+ krajina z riders_public) do tvaru, ktorý berie ranking.js (mergeEvent):
   { event_id, category, rider_name, place, rider_id, country?, nft? }. Staršie výsledky bez registrácie majú rider_id null. */
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
    onAuth() {},
    async signedIn() { return true; },
    async email() { return ''; },
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
    async listOfficialEvents() { return []; },
    async accessToken() { return ''; },
    async adminCheckin() { throw new UserError(DEMO_API); },
    async eventRegistrations() { return []; },
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

    /* fotky a klipy od komunity */
    async listEventPhotos(event_id) { return LS.get(K.photos, []).filter(p => p.event_id === event_id).map(p => ({ ...p, pending: !p.approved })); },
    async submitEventPhoto(row, photo) {
      add(K.photos, { ...row, photo_url: photo ? await toDataUrl(photo) : null, approved: false });
      return { pending: true };
    },
  };
}

async function liveStore(CONFIG) {
  await loadScript(SUPABASE_JS);
  const { createClient } = window.supabase;
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gosko-auth' },
  });
  const session = async () => (await sb.auth.getSession()).data.session;
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const created = r => ({ ...r, created: Date.parse(r.created_at) });
  const api = async (path, body) => {
    const token = (await session())?.access_token;
    if (!token) throw new UserError('Prihlásenie vypršalo. Prihlás sa znova.');
    return apiRequest(browserFetch, (CONFIG.API_BASE || '') + path, { method: 'POST', body, token });
  };
  return {
    mode: 'live',
    onAuth(fn) { sb.auth.onAuthStateChange(() => fn()); },
    async signedIn() { return !!(await session()); },
    async email() { return (await session())?.user?.email || ''; },
    async login(email) { must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })); },
    async verifyCode(email, token) { must(await sb.auth.verifyOtp({ email, token, type: 'email' })); },
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
    /* GOSko Ranking v2: verejné pohľady bez osobných údajov (kontrakt §2, §3 Rebríček) */
    async listResults() {
      const [rows, riders] = await Promise.all([
        sb.from('results_public').select('event_id,category,place,points,rider_id,public_name,chain_id,token_id,nft_status').limit(5000).then(must),
        sb.from('riders_public').select('id,country').limit(5000).then(must),
      ]);
      return mapPublicResults(rows, riders);
    },
    async listOfficialEvents() { return must(await sb.from('events_public').select('id,name,city,country,date,season,status,registration_open').limit(500)); },
    async accessToken() { return (await session())?.access_token || ''; },
    /* Admin zápisy idú cez Vercel API so Supabase JWT (kontrakt §3). */
    async adminCheckin(body) { return api('/api/admin/checkin', body); },
    /* Registrácie eventu pre zápis výsledkov a ručný check-in (admin má SELECT na registrations a riders). */
    async eventRegistrations(event_id) {
      const data = must(await sb.from('registrations').select('id,category,status,checked_in_at,riders(display_name)').eq('event_id', event_id).neq('status', 'cancelled').limit(2000));
      return data.map(r => ({ id: r.id, category: r.category, status: r.status, checked_in_at: r.checked_in_at, name: r.riders?.display_name || '' }));
    },
    async listAwards() { return must(await sb.from('event_awards').select('event_id,name,rider_name').limit(1000)); },
    async listBrackets() { return must(await sb.from('brackets').select('event_id,category,data,updated_at').limit(500)); },
    async saveBracket(event_id, category, data) {
      must(await sb.from('brackets').upsert({ event_id, category, data, updated_at: new Date().toISOString() }, { onConflict: 'event_id,category' }));
    },
    async deleteBracket(event_id, category) { must(await sb.from('brackets').delete().eq('event_id', event_id).eq('category', category)); },
    /* rows = [{ name, place, registration_id? }]; jedna transakcia na serveri (save_results), prázdny zoznam kategóriu zmaže */
    async saveResults(event_id, category, rows) {
      return api('/api/admin/results', { event_id, category, rows: rows.map(r => ({ rider_name: r.name, place: r.place, ...(r.registration_id ? { registration_id: r.registration_id } : {}) })) });
    },
    async deleteResults(event_id, category) { return api('/api/admin/results', { event_id, category, rows: [] }); },
    async saveAwards(event_id, list) {
      must(await sb.from('event_awards').delete().eq('event_id', event_id));
      if (list.length) must(await sb.from('event_awards').insert(list.map(a => ({ event_id, name: a.name, rider_name: a.rider_name }))));
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
  };
}

/* Databáza je nastavená, ale knižnica alebo spojenie zlyhali. Nič sa neuloží len do prehliadača:
   žiadny QR pass, ktorý by nebol v databáze, a žiadny admin. Čítanie aj zápis hodia UserError s textom pre človeka. */
const OFFLINE_MSG = 'Nepodarilo sa spojiť so serverom GOSko. Skontroluj pripojenie, obnov stránku a skús to znova.';
function offlineStore() {
  const down = async () => { throw new UserError(OFFLINE_MSG); };
  const store = { mode: 'offline', message: OFFLINE_MSG, onAuth() {}, async signedIn() { return false; }, async email() { return ''; },
    async isAdmin() { return false; }, async myVotes() { return new Set(); }, async logout() {}, async accessToken() { return ''; } };
  for (const k of ['login', 'verifyCode', 'listParks', 'submitPark', 'vote', 'listEvents', 'submitEvent', 'listSpots', 'submitSpot', 'send', 'subscribe',
    'findRegistration', 'checkIn', 'pendingParks', 'pendingEvents', 'pendingSpots', 'pendingEventPhotos', 'approve', 'reject', 'inbox',
    'listResults', 'listOfficialEvents', 'adminCheckin', 'eventRegistrations', 'listAwards', 'listBrackets', 'saveBracket', 'deleteBracket', 'saveResults', 'deleteResults', 'saveAwards', 'listEventPhotos', 'submitEventPhoto'])
    store[k] = down;
  return store;
}

export { isEmail };
/* mode: 'live' = Supabase; 'demo' = CONFIG je prázdny (výslovne lokálna ukážka, ukladá sa do prehliadača);
   'offline' = CONFIG je vyplnený, ale Supabase sa nenačítal (formuláre ukážu chybu, nič nepredstierajú). */
export async function getStore(CONFIG, { timeout = 10000, connect = liveStore } = {}) {
  if (!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY)) return demoStore();
  let timer;
  try {
    return await Promise.race([connect(CONFIG), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Supabase sa nenačítal včas.')), timeout); })]);
  } catch (err) { console.error(err); return offlineStore(); }
  finally { clearTimeout(timer); }
}
