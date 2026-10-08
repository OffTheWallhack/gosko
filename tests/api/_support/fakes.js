// Testovacie náhrady pre API: request/response, in-memory PostgREST, mail, Turnstile, chain.
// Žiadna sieť. Rozhranie FakeDb zodpovedá api/_lib/db.js.
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { DbError, UniqueViolationError } from '../../../api/_lib/db.js';
import { ApiError } from '../../../api/_lib/http.js';

export const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

export function testEnv(over = {}) {
  return {
    SUPABASE_URL: 'http://db.test',
    SUPABASE_REST_URL: 'http://db.test/rest/v1',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_AUTH_URL: 'http://db.test/auth/v1',
    TURNSTILE_SECRET_KEY: 'ts-secret',
    RESEND_API_KEY: '',
    MAIL_FROM: 'GOSko <registracia@gosko.sk>',
    PUBLIC_BASE_URL: 'https://gosko.test',
    CONSENT_VERSION: '2026-10',
    CHAIN_ID: 31337,
    RPC_URL: 'http://chain.test',
    NFT_CONTRACT_ADDRESS: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
    MINTER_PRIVATE_KEY: '',
    NFT_CUSTODY_ADDRESS: '',
    CRON_SECRET: 'cron-secret',
    RATE_LIMIT_PER_10MIN: 5,
    NODE_ENV: 'test',
    production: false,
    ...over,
  };
}

/* ---------- request / response ---------- */
export function mockReq({ method = 'GET', url = '/', headers = {}, body, query, rawBody } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  let req;
  if (rawBody !== undefined) {
    req = Readable.from([Buffer.from(rawBody)]);
  } else {
    req = Readable.from([]);
    if (body !== undefined) req.body = body;
  }
  req.method = method;
  req.url = url;
  req.headers = { 'x-forwarded-for': '203.0.113.7', ...lower };
  if (query !== undefined) req.query = query;
  return req;
}

export function mockRes() {
  const res = {
    statusCode: 200, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(chunk) { if (chunk !== undefined) this.body += chunk; this.ended = true; },
    get json() { try { return JSON.parse(this.body); } catch { return undefined; } },
  };
  return res;
}

export async function call(handler, reqOpts) {
  const req = mockReq(reqOpts);
  const res = mockRes();
  await handler(req, res);
  return res;
}

/* ---------- in-memory PostgREST ---------- */
const UNIQUE = {
  riders: [['id'], ['rider_ref']],
  rider_private: [['rider_id'], [r => String(r.email).toLowerCase(), 'birth_date']],
  registrations: [['id'], ['token'], ['guardian_token'], ['rider_id', 'event_id']],
  nft_tokens: [['registration_id']],
  events: [['id']],
  admins: [['user_id']],
  // players_username_key je unikátny index na lower(username)
  players: [['id'], ['rider_id'], [Object.defineProperty(r => String(r.username).toLowerCase(), 'name', { value: 'username' })]],
  player_guardian: [['player_id'], ['token']],
};

const DEFAULTS = {
  riders: () => ({ id: randomUUID(), nickname: null, country: 'SK', city: null, public_name_mode: 'full', is_founder: false, created_at: new Date().toISOString() }),
  rider_private: () => ({ phone: null, instagram: null, guardian_name: null, guardian_email: null, created_at: new Date().toISOString() }),
  registrations: () => ({ id: randomUUID(), token: randomUUID(), photo_consent: false, nft_consent: false, guardian_token: null, guardian_confirmed_at: null, checked_in_at: null, created_at: new Date().toISOString() }),
  nft_tokens: () => ({ token_id: null, mint_tx: null, result_tx: null, error: null, attempts: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  audit_log: () => ({ id: Math.floor(Math.random() * 1e9), at: new Date().toISOString() }),
  event_results: () => ({ id: randomUUID(), created_at: new Date().toISOString() }),
  events: () => ({ country: 'SK', status: 'planned', registration_open: false, capacity: null, date: null, city: null, season: null }),
  players: () => ({ city: null, stance: null, board_config: {}, guardian_confirmed_at: null, created_at: new Date().toISOString() }),
  player_guardian: () => ({ guardian_name: null, token: null, token_expires_at: null, requested_at: new Date().toISOString() }),
};

function parseValue(v) {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}
function splitList(s) {
  const inner = s.replace(/^\(/, '').replace(/\)$/, '');
  if (!inner) return [];
  const out = []; let cur = ''; let q = false;
  for (const ch of inner) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
const str = v => (v === null || v === undefined ? v : String(v));
const NUM = /^-?\d+(\.\d+)?$/;
function cmp(val, raw) {
  if (typeof val === 'number' || (NUM.test(String(val)) && NUM.test(raw))) return Number(val) - Number(raw);
  return String(val) < raw ? -1 : String(val) > raw ? 1 : 0;
}
function matchOne(row, col, expr) {
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const val = row[col];
  switch (op) {
    case 'eq': return str(val) === raw;
    case 'neq': return str(val) !== raw;
    case 'in': return splitList(raw).includes(str(val));
    case 'is': { const p = parseValue(raw); return p === null ? val === null || val === undefined : val === p; }
    case 'lt': return val !== null && val !== undefined && cmp(val, raw) < 0;
    case 'lte': return val !== null && val !== undefined && cmp(val, raw) <= 0;
    case 'gt': return val !== null && val !== undefined && cmp(val, raw) > 0;
    case 'gte': return val !== null && val !== undefined && cmp(val, raw) >= 0;
    case 'not': {
      const rest = raw; const d2 = rest.indexOf('.');
      return !matchOne(row, col, rest.slice(0, d2) + '.' + rest.slice(d2 + 1));
    }
    default: throw new Error('FakeDb: nepodporovaný operátor ' + op);
  }
}
function matches(row, filters = {}) {
  return Object.entries(filters).every(([col, expr]) => {
    const list = Array.isArray(expr) ? expr : [expr];
    return list.every(e => matchOne(row, col, e));
  });
}
function project(row, select) {
  if (!select || select === '*') return { ...row };
  const out = {};
  for (const c of select.split(',').map(s => s.trim()).filter(Boolean)) out[c] = row[c] ?? null;
  return out;
}
const keyOf = (row, cols) => JSON.stringify(cols.map(c => (typeof c === 'function' ? c(row) : str(row[c]))));

export class FakeDb {
  constructor(seed = {}) {
    this.tables = {};
    this.calls = [];
    this.failNext = {};
    this.rpcs = {
      rate_limit_hit: ({ p_key, p_limit }) => {
        this.rl = this.rl || {};
        this.rl[p_key] = (this.rl[p_key] || 0) + 1;
        return this.rl[p_key] > p_limit;
      },
      confirm_guardian: ({ p_token }) => {
        // ako migrácia 006: aj checked_in bez súhlasu, status checked_in ostáva; prepadnutý token alebo iný PT404
        const r = this.t('registrations').find(x => x.guardian_token === p_token
          && (!x.guardian_token_expires_at || Date.parse(x.guardian_token_expires_at) > Date.now())
          && (x.status === 'pending_guardian' || (x.status === 'checked_in' && !x.guardian_confirmed_at)));
        if (!r) throw new DbError({ status: 404, code: 'PT404', message: 'invalid_token' });
        if (r.status === 'pending_guardian') r.status = 'confirmed';
        r.guardian_confirmed_at = new Date().toISOString(); r.guardian_token = null;
        return { ...r };
      },
      confirm_player_guardian: ({ p_token, p_media = false }) => {
        // ako migrácia 016: token sa použije raz, prepadnutý alebo neznámy = PT404; fotky iba s p_media
        const g = this.t('player_guardian').find(x => x.token && x.token === p_token
          && (!x.token_expires_at || Date.parse(x.token_expires_at) > Date.now()));
        if (!g) throw new DbError({ status: 404, code: 'PT404', message: 'invalid_token' });
        g.token = null;
        const p = this.t('players').find(x => x.id === g.player_id);
        if (p) {
          p.guardian_confirmed_at ||= new Date().toISOString();
          if (p_media) p.media_consent_at ||= new Date().toISOString();
        }
        return { player_id: g.player_id, media: Boolean(p_media) };
      },
      save_results: ({ p_event_id, p_category, p_rows, p_actor }) => {
        // ako migrácia 005: token vyhodeného jazdca s výsledkom na chaine sa má vynulovať
        const kept = new Set(p_rows.map(r => r.registration_id).filter(Boolean));
        for (const old of this.t('event_results').filter(x => x.event_id === p_event_id && x.category === p_category && x.registration_id && !kept.has(x.registration_id))) {
          const tok = this.t('nft_tokens').find(t => t.registration_id === old.registration_id && t.status === 'result_set');
          if (tok) tok.status = 'result_pending';
        }
        this.tables.event_results = this.t('event_results').filter(x => !(x.event_id === p_event_id && x.category === p_category));
        for (const row of p_rows) {
          this.tables.event_results.push({ ...DEFAULTS.event_results(), event_id: p_event_id, category: p_category, registration_id: row.registration_id ?? null, rider_name: row.rider_name, place: row.place, points: pointsFor(row.place) });
          if (row.registration_id) {
            const tok = this.t('nft_tokens').find(t => t.registration_id === row.registration_id && ['minted', 'result_set'].includes(t.status));
            if (tok) tok.status = 'result_pending';
          }
        }
        this.t('audit_log').push({ ...DEFAULTS.audit_log(), actor: p_actor, action: 'save_results', entity: 'event_results', entity_id: p_event_id + '/' + p_category, data: { rows: p_rows.length } });
        return p_rows.length;
      },
    };
    for (const [k, rows] of Object.entries(seed)) this.tables[k] = rows.map(r => ({ ...(DEFAULTS[k]?.() || {}), ...r }));
  }
  t(name) { return (this.tables[name] ||= []); }
  maybeFail(op, table) {
    const key = `${op}:${table}`;
    const err = this.failNext[key];
    if (err) { delete this.failNext[key]; throw typeof err === 'function' ? err() : err; }
  }
  checkUnique(table, row, except) {
    for (const cols of UNIQUE[table] || []) {
      if (cols.some(c => typeof c === 'string' && (row[c] === null || row[c] === undefined))) continue;
      const k = keyOf(row, cols);
      if (this.t(table).some(r => r !== except && keyOf(r, cols) === k)) {
        // ako Postgres: v správe je názov obmedzenia (tabuľka_stĺpce_key)
        const name = `${table}_${cols.map(c => (typeof c === 'string' ? c : c.name)).join('_')}_key`;
        throw new UniqueViolationError({ status: 409, code: '23505', message: `duplicate key value violates unique constraint "${name}"` });
      }
    }
  }
  async select(table, filters = {}, opts = {}) {
    this.calls.push({ op: 'select', table, filters, opts });
    this.maybeFail('select', table);
    let rows = this.t(table).filter(r => matches(r, filters));
    if (opts.order) {
      const [col, dir] = opts.order.split('.');
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === 'desc' ? -1 : 1));
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return rows.map(r => project(r, opts.select));
  }
  async selectOne(table, filters = {}, opts = {}) {
    const rows = await this.select(table, filters, { ...opts, limit: 1 });
    return rows[0] ?? null;
  }
  async count(table, filters = {}) {
    this.calls.push({ op: 'count', table, filters });
    this.maybeFail('count', table);
    return this.t(table).filter(r => matches(r, filters)).length;
  }
  async insert(table, rows, opts = {}) {
    this.calls.push({ op: 'insert', table, rows, opts });
    this.maybeFail('insert', table);
    const list = Array.isArray(rows) ? rows : [rows];
    const out = [];
    for (const r of list) {
      const row = { ...(DEFAULTS[table]?.() || {}), ...r };
      this.checkUnique(table, row);
      this.t(table).push(row);
      out.push({ ...row });
    }
    return out.map(r => project(r, opts.select));
  }
  async update(table, filters, patch, opts = {}) {
    this.calls.push({ op: 'update', table, filters, patch });
    this.maybeFail('update', table);
    const out = [];
    for (const r of this.t(table).filter(x => matches(x, filters))) {
      const next = { ...r, ...patch };
      this.checkUnique(table, next, r);
      Object.assign(r, patch);
      out.push({ ...r });
    }
    return out.map(r => project(r, opts.select));
  }
  async delete(table, filters) {
    this.calls.push({ op: 'delete', table, filters });
    this.maybeFail('delete', table);
    const gone = this.t(table).filter(r => matches(r, filters));
    this.tables[table] = this.t(table).filter(r => !matches(r, filters));
    return gone;
  }
  async rpc(fn, args = {}) {
    this.calls.push({ op: 'rpc', fn, args });
    this.maybeFail('rpc', fn);
    const impl = this.rpcs[fn];
    if (!impl) throw new DbError({ status: 404, code: 'PGRST202', message: 'function not found: ' + fn });
    return impl(args);
  }
  callsOf(op, nameOrTable) { return this.calls.filter(c => c.op === op && (c.table === nameOrTable || c.fn === nameOrTable)); }
}

export function pointsFor(place) {
  if (place <= 1) return 100;
  if (place <= 2) return 80;
  if (place <= 4) return 60;
  if (place <= 8) return 40;
  if (place <= 16) return 20;
  return 5;
}

/* ---------- mail, turnstile, auth, chain ---------- */
export function fakeMail({ fail = false } = {}) {
  const sent = [];
  return {
    sent,
    async send(msg) {
      if (fail) throw new Error('resend down');
      sent.push(msg);
      return { id: 'mail-' + sent.length };
    },
  };
}

export function fakeTurnstile(ok = true) {
  const calls = [];
  return { calls, async verify(token, ip) { calls.push({ token, ip }); return { ok: typeof ok === 'function' ? ok(token) : ok }; } };
}

export function fakeAuth({ adminId = ADMIN_ID } = {}) {
  return {
    async requireAdmin(req) {
      const h = req.headers.authorization || '';
      if (!h.startsWith('Bearer ')) throw new ApiError(401, 'unauthorized', 'Chýba prihlásenie.');
      if (h !== 'Bearer admin-jwt') throw new ApiError(403, 'forbidden', 'Nemáš oprávnenie admina.');
      return { userId: adminId };
    },
  };
}

// Prihlásený hráč: 'Bearer <token>' -> používateľ z mapy users ({ id, email, verified? }).
export function fakeUserAuth(users = {}) {
  return {
    async requireUser(req) {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!m) throw new ApiError(401, 'unauthorized', 'Prihlás sa.');
      const u = users[m[1]];
      if (!u) throw new ApiError(401, 'unauthorized', 'Prihlásenie vypršalo. Prihlás sa znova.');
      if (u.verified === false) throw new ApiError(403, 'email_unverified', 'Najprv potvrď e-mail.');
      return { userId: u.id, email: String(u.email).toLowerCase() };
    },
  };
}

// Simuluje kontrakt: jeden token na registrationKey, tokenId od 1.
export function fakeChain({ failMint = 0, failResult = 0, landThenFail = false } = {}) {
  const state = { byReg: new Map(), passes: new Map(), next: 1n };
  const c = {
    enabled: true,
    state,
    mintCalls: [], writeCalls: 0, resultCalls: [],
    failMint, failResult,
    async readTokenOfRegistration(registrationId) { return state.byReg.get(registrationId) ?? 0n; },
    async mintPass({ registrationId, eventId, riderRef, category }) {
      c.mintCalls.push({ registrationId, eventId, riderRef, category });
      const existing = state.byReg.get(registrationId);
      if (existing) return { tokenId: existing.toString(), txHash: null, existing: true };
      if (c.failMint > 0) {
        c.failMint -= 1;
        if (landThenFail) { // transakcia prešla, ale odpoveď neprišla (timeout)
          c.writeCalls += 1;
          const id = state.next++; state.byReg.set(registrationId, id); state.passes.set(id, { placement: 0, points: 0 });
        }
        throw new Error('RPC timeout');
      }
      c.writeCalls += 1;
      const id = state.next++;
      state.byReg.set(registrationId, id);
      state.passes.set(id, { placement: 0, points: 0 });
      return { tokenId: id.toString(), txHash: '0x' + 'ab'.repeat(32), existing: false };
    },
    async setPassResult({ tokenId, placement, points }) {
      c.resultCalls.push({ tokenId: String(tokenId), placement, points });
      if (c.failResult > 0) { c.failResult -= 1; throw new Error('setResult reverted'); }
      state.passes.set(BigInt(tokenId), { placement, points });
      return { txHash: '0x' + 'cd'.repeat(32) };
    },
  };
  return c;
}

export const silentLog = { info() {}, warn() {}, error() {} };

export function fixedNow(iso = '2026-10-05T10:00:00Z') { return () => new Date(iso); }

export function baseEvent(over = {}) {
  return { id: 'bratislava-2026-11', name: 'GOSko Bratislava', city: 'Bratislava', country: 'SK', date: '2026-11-21', season: 2026, status: 'open', registration_open: true, capacity: null, ...over };
}
