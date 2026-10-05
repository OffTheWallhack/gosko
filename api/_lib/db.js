// Minimálny PostgREST klient cez fetch so service role kľúčom (bez supabase-js).
// Filtre sú objekt { stĺpec: 'op.hodnota' } alebo pole výrazov pre ten istý stĺpec.

export class DbError extends Error {
  constructor({ status = 500, code = 'db_error', message = 'Chyba databázy', details = null, hint = null } = {}) {
    super(message);
    this.name = 'DbError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = hint;
  }
}

export class UniqueViolationError extends DbError {
  constructor(init) {
    super({ ...init, code: '23505' });
    this.name = 'UniqueViolationError';
  }
}

export const isUniqueViolation = e => e instanceof UniqueViolationError || e?.code === '23505';

const quote = v => {
  const s = String(v);
  return /[,()"\s\\]/.test(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
};
export const eq = v => `eq.${v}`;
export const neq = v => `neq.${v}`;
export const inList = arr => `in.(${arr.map(quote).join(',')})`;
export const isNull = 'is.null';
export const notNull = 'not.is.null';
export const lt = v => `lt.${v}`;
export const lte = v => `lte.${v}`;
export const gte = v => `gte.${v}`;

function buildQuery(filters = {}, opts = {}) {
  const p = new URLSearchParams();
  if (opts.select) p.set('select', opts.select);
  for (const [col, expr] of Object.entries(filters)) {
    if (expr === undefined) continue;
    for (const e of Array.isArray(expr) ? expr : [expr]) p.append(col, e);
  }
  if (opts.order) p.set('order', opts.order);
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.onConflict) p.set('on_conflict', opts.onConflict);
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function toError(resp) {
  let body = null;
  try { body = await resp.json(); } catch { /* telo nie je JSON */ }
  const init = {
    status: resp.status,
    code: body?.code || `http_${resp.status}`,
    message: body?.message || `PostgREST ${resp.status}`,
    details: body?.details ?? null,
    hint: body?.hint ?? null,
  };
  return init.code === '23505' ? new UniqueViolationError(init) : new DbError(init);
}

/**
 * @param {{url: string, key: string, fetch?: typeof fetch, timeoutMs?: number}} cfg
 *   url = PostgREST koreň (Supabase: https://x.supabase.co/rest/v1; lokálne http://127.0.0.1:3901)
 */
export function createDb({ url, key, fetch: f = globalThis.fetch, timeoutMs = 10_000 }) {
  const base = String(url || '').replace(/\/+$/, '');

  async function request(method, path, { query = '', body, prefer, headers = {} } = {}) {
    if (!base || !key) throw new DbError({ status: 500, code: 'not_configured', message: 'Databáza nie je nakonfigurovaná (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).' });
    const h = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...headers,
    };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    let resp;
    try {
      resp = await f(`${base}/${path}${query}`, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new DbError({ status: 503, code: 'network', message: `Databáza je nedostupná: ${err?.name || 'chyba'}` });
    }
    if (!resp.ok) throw await toError(resp);
    return resp;
  }

  async function json(resp) {
    const text = await resp.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new DbError({ status: 502, code: 'bad_response', message: 'PostgREST vrátil neplatný JSON' }); }
  }

  const db = {
    async select(table, filters = {}, opts = {}) {
      const resp = await request('GET', table, { query: buildQuery(filters, { select: opts.select || '*', order: opts.order, limit: opts.limit }) });
      return (await json(resp)) ?? [];
    },
    async selectOne(table, filters = {}, opts = {}) {
      const rows = await db.select(table, filters, { ...opts, limit: 1 });
      return rows[0] ?? null;
    },
    async count(table, filters = {}) {
      const resp = await request('HEAD', table, { query: buildQuery(filters, { select: '*' }), prefer: 'count=exact' });
      const range = resp.headers.get('content-range') || '';
      const n = Number.parseInt(range.split('/')[1], 10);
      return Number.isFinite(n) ? n : 0;
    },
    async insert(table, rows, opts = {}) {
      const prefer = ['return=representation'];
      if (opts.ignoreDuplicates) prefer.push('resolution=ignore-duplicates');
      else if (opts.upsert) prefer.push('resolution=merge-duplicates');
      const resp = await request('POST', table, {
        query: buildQuery({}, { select: opts.select, onConflict: opts.onConflict }),
        body: rows,
        prefer: prefer.join(','),
      });
      return (await json(resp)) ?? [];
    },
    async update(table, filters, patch, opts = {}) {
      if (!filters || !Object.keys(filters).length) throw new DbError({ code: 'unsafe', message: 'UPDATE bez filtra je zakázaný' });
      const resp = await request('PATCH', table, { query: buildQuery(filters, { select: opts.select }), body: patch, prefer: 'return=representation' });
      return (await json(resp)) ?? [];
    },
    async delete(table, filters) {
      if (!filters || !Object.keys(filters).length) throw new DbError({ code: 'unsafe', message: 'DELETE bez filtra je zakázaný' });
      const resp = await request('DELETE', table, { query: buildQuery(filters), prefer: 'return=representation' });
      return (await json(resp)) ?? [];
    },
    async rpc(fn, args = {}) {
      const resp = await request('POST', `rpc/${fn}`, { body: args });
      return json(resp);
    },
  };
  return db;
}
