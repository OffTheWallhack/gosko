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
};

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

function demoStore() {
  const K = { parks: 'gosko:parks', votes: 'gosko:votes', events: 'gosko:community-events', spots: 'gosko:spots' };
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
    async approve(kind, id) {
      const key = kind === 'spots' ? K.spots : kind === 'events' ? K.events : null; if (!key) return;
      const a = LS.get(key, []); const e = a.find(x => x.id === id); if (e) e.approved = true; LS.set(key, a);
    },
    async inbox(table) { return LS.get('gosko:' + table, []); },
  };
}

async function liveStore(CONFIG) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gosko-auth' },
  });
  const session = async () => (await sb.auth.getSession()).data.session;
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const created = r => ({ ...r, created: Date.parse(r.created_at) });
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
    async approve(kind, id) {
      const table = { parks: 'parks', events: 'community_events', spots: 'spots' }[kind];
      must(await sb.from(table).update({ approved: true }).eq('id', id));
    },
    async inbox(table) { return must(await sb.from(table).select('*').order('created_at', { ascending: false }).limit(2000)).map(created); },
  };
}

export { isEmail };
export async function getStore(CONFIG) {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try { return await liveStore(CONFIG); } catch (err) { console.error(err); }
  }
  return demoStore();
}
