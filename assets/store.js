const uid = () => Math.random().toString(36).slice(2, 10);
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

/* tabuľky formulárov: kľúč v prehliadači / tabuľka v Supabase */
export const INBOX = {
  registrations: 'Registrácie na eventy',
  bookings: 'Objednávky pop-upov',
  shop_interest: 'Záujem o shop',
};

function demoStore() {
  const K = { parks: 'gosko:parks', votes: 'gosko:votes', events: 'gosko:community-events' };
  const loadParks = () => {
    let p = LS.get(K.parks, null);
    if (!p) { p = SEEDS.map((s, i) => ({ ...s, id: 'seed-' + i, votes: 0, created: Date.now() - (i + 1) * 864e5 })); LS.set(K.parks, p); }
    return p;
  };
  const add = (key, obj) => {
    const a = LS.get(key, []); a.unshift({ ...obj, id: uid(), created: Date.now() });
    if (!LS.set(key, a)) throw new Error('Prehliadač nemá voľné miesto na uloženie.');
  };
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
    async send(table, row) { add('gosko:' + table, row); },
    async isAdmin() { return true; },
    async pendingParks() { return []; },
    async pendingEvents() { return LS.get(K.events, []).filter(e => !e.approved); },
    async approve(kind, id) {
      if (kind !== 'events') return;
      const a = LS.get(K.events, []); const e = a.find(x => x.id === id); if (e) e.approved = true; LS.set(K.events, a);
    },
    async inbox(table) { return LS.get('gosko:' + table, []); },
  };
}

async function liveStore(CONFIG) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const session = async () => (await sb.auth.getSession()).data.session;
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const created = r => ({ ...r, created: Date.parse(r.created_at) });
  return {
    mode: 'live',
    onAuth(fn) { sb.auth.onAuthStateChange(() => fn()); },
    async signedIn() { return !!(await session()); },
    async email() { return (await session())?.user?.email || ''; },
    async login(email) { must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })); },
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
    async send(table, row) { must(await sb.from(table).insert(row)); },
    async isAdmin() { if (!(await session())) return false; const { data } = await sb.rpc('is_admin'); return !!data; },
    async pendingParks() { return must(await sb.from('parks').select('*').eq('approved', false).order('created_at')).map(created); },
    async pendingEvents() { return must(await sb.from('community_events').select('*').eq('approved', false).order('created_at')).map(created); },
    async approve(kind, id) { must(await sb.from(kind === 'parks' ? 'parks' : 'community_events').update({ approved: true }).eq('id', id)); },
    async inbox(table) { return must(await sb.from(table).select('*').order('created_at', { ascending: false }).limit(1000)).map(created); },
  };
}

export async function getStore(CONFIG) {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try { return await liveStore(CONFIG); } catch (err) { console.error(err); }
  }
  return demoStore();
}
