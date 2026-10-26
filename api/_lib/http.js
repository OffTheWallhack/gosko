// Pomocníci pre Vercel (req, res) aj čistý Node http. Bez frameworku.

export class ApiError extends Error {
  constructor(status, code, message, extra = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const MAX_BODY = 64 * 1024;

export function header(req, name) {
  const h = req.headers || {};
  if (typeof h.get === 'function') return h.get(name) ?? undefined;
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function parseText(text) {
  if (!text || !text.trim()) return {};
  let data;
  try { data = JSON.parse(text); } catch {
    throw new ApiError(400, 'invalid_input', 'Požiadavka nemá platný formát JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError(400, 'invalid_input', 'Požiadavka musí byť JSON objekt.');
  }
  return data;
}

// Vercel telo často sparsuje sám (req.body). Čistý Node ho treba prečítať zo streamu.
// Iný Content-Type ako JSON je 415: text/plain alebo formulár z cudzej stránky prejde bez
// CORS preflightu, JSON nie (audit L2). Bez hlavičky (server-server, testy) sa telo berie ako JSON.
export async function readJson(req) {
  const ct = header(req, 'content-type');
  if (ct && !/^application\/json\b/i.test(String(ct).trim())) {
    throw new ApiError(415, 'unsupported_media_type', 'Požiadavka musí byť JSON (Content-Type: application/json).');
  }
  const b = req.body;
  if (b !== undefined && b !== null) {
    if (Buffer.isBuffer(b)) {
      if (b.length > MAX_BODY) throw new ApiError(413, 'invalid_input', 'Požiadavka je príliš veľká.');
      return parseText(b.toString('utf8'));
    }
    if (typeof b === 'string') {
      if (b.length > MAX_BODY) throw new ApiError(413, 'invalid_input', 'Požiadavka je príliš veľká.');
      return parseText(b);
    }
    if (typeof b === 'object' && !Array.isArray(b)) return b;
    throw new ApiError(400, 'invalid_input', 'Požiadavka musí byť JSON objekt.');
  }
  if (typeof req[Symbol.asyncIterator] !== 'function') return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY) throw new ApiError(413, 'invalid_input', 'Požiadavka je príliš veľká.');
    chunks.push(buf);
  }
  return parseText(Buffer.concat(chunks).toString('utf8'));
}

// Telo ako JSON alebo application/x-www-form-urlencoded (HTML formulár).
export async function readBody(req) {
  const type = String(header(req, 'content-type') || '').toLowerCase();
  if (!type.includes('application/x-www-form-urlencoded')) return readJson(req);
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b; // Vercel už sparsoval
  let text = '';
  if (typeof b === 'string') text = b;
  else if (Buffer.isBuffer(b)) text = b.toString('utf8');
  else if (typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_BODY) throw new ApiError(413, 'invalid_input', 'Požiadavka je príliš veľká.');
      chunks.push(buf);
    }
    text = Buffer.concat(chunks).toString('utf8');
  }
  if (text.length > MAX_BODY) throw new ApiError(413, 'invalid_input', 'Požiadavka je príliš veľká.');
  return Object.fromEntries(new URLSearchParams(text).entries());
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function sendRaw(res, status, contentType, text, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(text);
}

export function redirect(res, location, status = 302) {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end();
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  send(res, 405, { ok: false, error: 'method_not_allowed', message: 'Táto metóda nie je povolená.' });
  return false;
}

// Na Verceli je adresa klienta v x-vercel-forwarded-for a x-real-ip (nastavuje ich Vercel);
// x-forwarded-for je až záloha pre lokálny server a testy (prvá položka je klient).
export function clientIp(req) {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip']) {
    const v = header(req, name);
    const first = v && String(v).split(',')[0].trim();
    if (first) return first;
  }
  const xff = header(req, 'x-forwarded-for');
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

// Kľúč pre rate limit: IPv6 sa zoskupí podľa /64, inak by stačilo meniť adresu v rámci prefixu (audit L4).
export function rateLimitIp(ip) {
  const s = String(ip || 'unknown').trim().toLowerCase();
  if (!s.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(s)) return s.replace(/^::ffff:/, '');
  const [head, tail = ''] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = s.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${full.slice(0, 4).map(x => (x || '0').replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const u = new URL(req.url || '/', 'http://local');
    return Object.fromEntries(u.searchParams.entries());
  } catch {
    return {};
  }
}

// Dynamická cesta ([id].js): Vercel dá req.query.id, čistý Node ho vytiahne z URL.
export function pathParam(req, name) {
  const q = queryOf(req);
  if (q[name] !== undefined) return Array.isArray(q[name]) ? q[name][0] : String(q[name]);
  try {
    const u = new URL(req.url || '/', 'http://local');
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : undefined;
  } catch {
    return undefined;
  }
}

export function bearerToken(req) {
  const h = header(req, 'authorization');
  if (!h) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(String(h));
  return m ? m[1] : null;
}

// Klient dostane kód a text len z ApiError. Chyby DB (kódy Postgresu, názvy obmedzení) sa iba
// zalogujú a klient dostane všeobecnú odpoveď (audit L3).
export function sendError(res, err, log = console) {
  if (err instanceof ApiError) {
    const body = { ok: false, error: err.code, message: err.message };
    if (err.extra) Object.assign(body, err.extra);
    send(res, err.status, body);
    return;
  }
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    log.error('[api] chyba požiadavky', err?.name, err?.code, err?.message);
    send(res, 400, { ok: false, error: 'request_failed', message: 'Požiadavku sa nepodarilo spracovať. Skontroluj údaje a skús to znova.' });
    return;
  }
  log.error('[api] neočakávaná chyba', err?.name, err?.code, err?.message);
  send(res, 500, { ok: false, error: 'server_error', message: 'Niečo sa pokazilo na našej strane. Skús to znova o chvíľu.' });
}
