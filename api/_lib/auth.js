// Overenie prihlásenia: JWT používateľa -> GET ${SUPABASE_AUTH_URL}/user.
// requireAdmin: navyše riadok v public.admins. requireUser: hráč s overeným e-mailom (hra, Task 2).
import { ApiError, bearerToken } from './http.js';
import { eq } from './db.js';
import { isUuid } from './validate.js';

export function createAuth({ env, db, fetch: f = globalThis.fetch }) {
  async function currentUser(req, missing) {
    const jwt = bearerToken(req);
    if (!jwt) throw new ApiError(401, 'unauthorized', missing);
    if (!env.SUPABASE_AUTH_URL) throw new ApiError(503, 'auth_unavailable', 'Overenie prihlásenia nie je nastavené.');
    let resp;
    try {
      resp = await f(`${env.SUPABASE_AUTH_URL}/user`, {
        headers: { Authorization: `Bearer ${jwt}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ApiError(503, 'auth_unavailable', 'Overenie prihlásenia je nedostupné. Skús to znova.');
    }
    if (resp.status === 401 || resp.status === 403) throw new ApiError(401, 'unauthorized', 'Prihlásenie vypršalo. Prihlás sa znova.');
    if (!resp.ok) throw new ApiError(503, 'auth_unavailable', 'Overenie prihlásenia je nedostupné. Skús to znova.');
    let user = null;
    try { user = await resp.json(); } catch { /* nižšie */ }
    if (!isUuid(user?.id)) throw new ApiError(401, 'unauthorized', 'Prihlásenie je neplatné. Prihlás sa znova.');
    return user;
  }

  return {
    async requireAdmin(req) {
      const user = await currentUser(req, 'Prihlás sa ako admin.');
      const row = await db.selectOne('admins', { user_id: eq(user.id) }, { select: 'user_id' });
      if (!row) throw new ApiError(403, 'forbidden', 'Nemáš oprávnenie admina.');
      return { userId: user.id };
    },
    // E-mail je overený, keď ho GoTrue potvrdil (prihlásenie odkazom alebo kódom z e-mailu).
    async requireUser(req) {
      const user = await currentUser(req, 'Prihlás sa.');
      const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
      if (!email || !(user.email_confirmed_at || user.confirmed_at)) {
        throw new ApiError(403, 'email_unverified', 'Najprv potvrď e-mail odkazom alebo kódom, ktorý sme ti poslali.');
      }
      return { userId: user.id, email };
    },
  };
}
