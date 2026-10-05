// Limit pokusov cez DB funkciu rate_limit_hit (kontrakt §2). Vráti true, ak je limit prekročený.
export async function rateLimitHit(db, key, limit, windowMinutes = 10) {
  const r = await db.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_minutes: windowMinutes });
  return r === true;
}
