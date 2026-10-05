// Overenie admina: JWT používateľa -> GET ${SUPABASE_AUTH_URL}/user -> riadok v public.admins.
import { ApiError, bearerToken } from './http.js';
import { eq } from './db.js';
import { isUuid } from './validate.js';

export function createAuth({ env, db, fetch: f = globalThis.fetch }) {
  return {
    async requireAdmin(req) {
      const jwt = bearerToken(req);
      if (!jwt) throw new ApiError(401, 'unauthorized', 'Prihlás sa ako admin.');
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
      const row = await db.selectOne('admins', { user_id: eq(user.id) }, { select: 'user_id' });
      if (!row) throw new ApiError(403, 'forbidden', 'Nemáš oprávnenie admina.');
      return { userId: user.id };
    },
  };
}
