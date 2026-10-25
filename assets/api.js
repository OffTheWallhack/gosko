/* Volanie Vercel API (/api/*). Odpoveď je JSON { ok, ... } alebo { ok:false, error, message } (kontrakt §3).
   Chyba je ApiError (UserError): jej text sa ukáže vo formulári, code a data (napr. candidates) ostanú pre volajúceho. */
import { UserError } from './util.js';

export class ApiError extends UserError {
  constructor(message, { status = 0, code = '', data = null } = {}) { super(message); this.status = status; this.code = code; this.data = data; }
}

const NETWORK_MSG = 'Nepodarilo sa spojiť so serverom GOSko. Skontroluj pripojenie a skús to znova.';
const fallback = status => status === 401 || status === 403 ? 'Na toto nemáš oprávnenie. Prihlás sa znova.'
  : status === 404 ? 'Nenašli sme to, čo hľadáš.'
  : status === 429 ? 'Príliš veľa pokusov. Skús to znova o chvíľu.'
  : 'Niečo sa pokazilo na našej strane. Skús to znova o chvíľu.';

export async function apiRequest(fetchFn, url, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try { res = await fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' }); }
  catch { throw new ApiError(NETWORK_MSG, { code: 'network' }); }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || data.ok === false) {
    throw new ApiError(typeof data?.message === 'string' && data.message ? data.message : fallback(res.status), { status: res.status, code: data?.error || `http_${res.status}`, data });
  }
  return data;
}

/* fetch prehliadača (v Node testoch sa podstrkuje vlastný) */
export const browserFetch = (...a) => globalThis.fetch(...a);
