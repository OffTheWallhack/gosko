// Premenné prostredia podľa docs/KONTRAKT-REGISTRACIA.md §1.
// readEnv nikdy nehádže, aby sa moduly dali importovať aj bez konfigurácie.
// Chýbajúce hodnoty hlási validateEnv a jednotlivé služby (db, chain) až pri použití.

const trimSlash = s => s.replace(/\/+$/, '');

function int(v, fallback, { min = 1 } = {}) {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

// Supabase má PostgREST na /rest/v1. Lokálny test stack (kontrakt §2) je holý
// PostgREST na koreni, napr. http://127.0.0.1:3901.
export function restUrlFor(supabaseUrl) {
  if (!supabaseUrl) return '';
  const u = trimSlash(supabaseUrl);
  if (/\/rest\/v1$/.test(u)) return u;
  try {
    const { hostname, pathname } = new URL(u);
    if ((hostname === '127.0.0.1' || hostname === 'localhost') && (pathname === '/' || pathname === '')) return u;
  } catch { /* nižšie */ }
  return u + '/rest/v1';
}

export function readEnv(src = process.env) {
  const s = k => String(src[k] ?? '').trim();
  const SUPABASE_URL = trimSlash(s('SUPABASE_URL'));
  const NODE_ENV = s('NODE_ENV') || 'development';
  return {
    SUPABASE_URL,
    SUPABASE_REST_URL: s('SUPABASE_REST_URL') ? trimSlash(s('SUPABASE_REST_URL')) : restUrlFor(SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: s('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_AUTH_URL: s('SUPABASE_AUTH_URL') ? trimSlash(s('SUPABASE_AUTH_URL')) : (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : ''),
    TURNSTILE_SECRET_KEY: s('TURNSTILE_SECRET_KEY'),
    RESEND_API_KEY: s('RESEND_API_KEY'),
    MAIL_FROM: s('MAIL_FROM') || 'GOSko <registracia@gosko.sk>',
    MAIL_DEV_LOG: s('MAIL_DEV_LOG'),
    PUBLIC_BASE_URL: trimSlash(s('PUBLIC_BASE_URL') || 'https://gosko.sk'),
    CONSENT_VERSION: s('CONSENT_VERSION') || '2026-10',
    CHAIN_ID: int(src.CHAIN_ID, 84532),
    RPC_URL: s('RPC_URL'),
    NFT_CONTRACT_ADDRESS: s('NFT_CONTRACT_ADDRESS'),
    MINTER_PRIVATE_KEY: s('MINTER_PRIVATE_KEY'),
    NFT_CUSTODY_ADDRESS: s('NFT_CUSTODY_ADDRESS'),
    // GoskoLoot (hra Ghoskate, Task 6): prázdne = mint odmien vypnutý; RPC_URL, MINTER_PRIVATE_KEY a custody zdieľa s GoskoPass
    LOOT_CONTRACT_ADDRESS: s('LOOT_CONTRACT_ADDRESS'),
    CRON_SECRET: s('CRON_SECRET'),
    RATE_LIMIT_PER_10MIN: int(src.RATE_LIMIT_PER_10MIN, 5),
    NODE_ENV,
    production: NODE_ENV === 'production',
  };
}

export const nftEnabled = env => Boolean(env.NFT_CONTRACT_ADDRESS);
export const lootEnabled = env => Boolean(env.LOOT_CONTRACT_ADDRESS);

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

// Vráti zoznam problémov (prázdny = v poriadku). Hodnoty tajomstiev nikdy nevypisuje.
export function validateEnv(env) {
  const p = [];
  if (!env.SUPABASE_URL) p.push('SUPABASE_URL chýba');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) p.push('SUPABASE_SERVICE_ROLE_KEY chýba');
  if (env.production && !env.TURNSTILE_SECRET_KEY) p.push('TURNSTILE_SECRET_KEY chýba (v produkcii sa registrácia odmietne)');
  if (env.production && !env.CRON_SECRET) p.push('CRON_SECRET chýba (cron sa odmietne)');
  if (env.production && !env.RESEND_API_KEY) p.push('RESEND_API_KEY chýba (e-maily sa len zalogujú)');
  if (nftEnabled(env)) {
    if (!ADDRESS.test(env.NFT_CONTRACT_ADDRESS)) p.push('NFT_CONTRACT_ADDRESS nie je platná adresa');
    if (!PRIVATE_KEY.test(env.MINTER_PRIVATE_KEY)) p.push('MINTER_PRIVATE_KEY chýba alebo nemá tvar 0x + 64 hex');
    if (!env.RPC_URL) p.push('RPC_URL chýba');
    if (env.NFT_CUSTODY_ADDRESS && !ADDRESS.test(env.NFT_CUSTODY_ADDRESS)) p.push('NFT_CUSTODY_ADDRESS nie je platná adresa');
  }
  if (lootEnabled(env)) {
    if (!ADDRESS.test(env.LOOT_CONTRACT_ADDRESS)) p.push('LOOT_CONTRACT_ADDRESS nie je platná adresa');
    if (!PRIVATE_KEY.test(env.MINTER_PRIVATE_KEY)) p.push('MINTER_PRIVATE_KEY chýba alebo nemá tvar 0x + 64 hex (potrebuje ho aj GoskoLoot)');
    if (!env.RPC_URL) p.push('RPC_URL chýba (potrebuje ho aj GoskoLoot)');
  }
  return p;
}
