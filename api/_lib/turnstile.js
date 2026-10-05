// Cloudflare Turnstile siteverify. Bez tajného kľúča sa overenie preskočí
// iba mimo produkcie; v produkcii bez kľúča sa registrácia odmietne.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function createTurnstile({ env, fetch: f = globalThis.fetch, log = console }) {
  return {
    async verify(token, ip) {
      if (!env.TURNSTILE_SECRET_KEY) {
        if (!env.production) return { ok: true, bypass: true };
        log.error('[turnstile] TURNSTILE_SECRET_KEY chýba v produkcii, overenie zlyháva');
        return { ok: false, codes: ['missing-secret'] };
      }
      if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false, codes: ['missing-input-response'] };
      const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
      if (ip && ip !== 'unknown') body.set('remoteip', ip);
      try {
        const resp = await f(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(8_000) });
        const data = await resp.json();
        return { ok: data?.success === true, codes: data?.['error-codes'] || [] };
      } catch (err) {
        log.warn('[turnstile] siteverify zlyhal', err?.name);
        return { ok: false, codes: ['network'] };
      }
    },
  };
}
