// Lokálny test stack: Postgres DB gosko_test + PostgREST na porte 3901.
// Iba lokálne (socket /tmp). Na produkčný Supabase sa nikdy nepripája.
// Súbežné behy (napr. iný worktree): GOSKO_TEST_DB a GOSKO_TEST_PORT zvolia inú DB a port.
import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, closeSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DB_NAME = process.env.GOSKO_TEST_DB || 'gosko_test';
export const PORT = Number(process.env.GOSKO_TEST_PORT || 3901);
export const REST_URL = `http://127.0.0.1:${PORT}`;

const CONF = join(ROOT, 'supabase', 'test', 'postgrest.conf');
const LOG = join(ROOT, 'supabase', 'test', PORT === 3901 ? 'postgrest.log' : `postgrest-${PORT}.log`);
const PIDFILE = join(tmpdir(), `gosko-postgrest-${PORT}.pid`);
const POSTGREST = process.env.POSTGREST_BIN || '/opt/homebrew/bin/postgrest';
const PG_ENV = {
  ...process.env,
  PGHOST: '/tmp',
  PGPORT: '5432',
  PGDATABASE: DB_NAME,
  PGOPTIONS: '-c client_min_messages=warning',
};

// Pevné testovacie identity (auth.users). Admin je aj v public.admins.
export const ADMIN_ID = '00000000-0000-4000-8000-00000000a001';
export const USER_ID = '00000000-0000-4000-8000-00000000b001';

function confValue(key) {
  const line = readFileSync(CONF, 'utf8').split('\n').find(l => l.trim().startsWith(`${key} `) || l.trim().startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing in ${CONF}`);
  return line.slice(line.indexOf('=') + 1).trim().replace(/^"(.*)"$/, '$1');
}

export const JWT_SECRET = confValue('jwt-secret');

/** HS256 JWT pre PostgREST. role: 'anon' | 'authenticated' | 'service_role'. */
export function jwt(role, sub, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { role, iat: now, exp: now + 3600, ...(sub ? { sub } : {}), ...extra };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Zmaže a znova vytvorí gosko_test (scripts/test-db.sh). until: '001' … '015' (default všetko + seed). */
export function resetDb({ until = '015' } = {}) {
  try {
    execFileSync('bash', [join(ROOT, 'scripts', 'test-db.sh'), until], { env: { ...process.env, GOSKO_TEST_DB: DB_NAME }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`scripts/test-db.sh failed:\n${err.stderr?.toString() || err.message}`);
  }
}

/** SQL ako superuser v gosko_test. Vráti stdout (bez formátovania). */
export function sql(query) {
  if (!query.trim()) throw new Error('empty query');
  try {
    return execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB_NAME, '-c', query], { env: PG_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (err) {
    const e = new Error(err.stderr?.toString().trim() || err.message);
    e.sqlstate = /SQLSTATE[^\w]*(\w{5})/.exec(err.stderr?.toString() || '')?.[1];
    throw e;
  }
}

/** Spustí súbor cez psql (napr. migráciu) v gosko_test. */
export function sqlFile(path) {
  try {
    execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB_NAME, '-f', path], { env: PG_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(err.stderr?.toString().trim() || err.message);
  }
}

/** Výsledok SELECT-u ako pole objektov. */
export function sqlRows(query) {
  const out = sql(`select coalesce(json_agg(t), '[]'::json) from (${query}) t`);
  return JSON.parse(out);
}

/** SQL ako konkrétna rola s JWT claims (rovnako ako PostgREST). Vráti stdout. */
export function sqlAs(role, sub, query) {
  const claims = JSON.stringify({ role, ...(sub ? { sub } : {}) }).replace(/'/g, "''");
  return sql(`begin; set local role ${role}; set local request.jwt.claims = '${claims}'; ${query}; commit;`);
}

/** Vloží testovacích používateľov do auth.users a admina do public.admins. */
export function seedUsers() {
  sql(`insert into auth.users (id, email) values ('${ADMIN_ID}', 'admin@test.local'), ('${USER_ID}', 'user@test.local') on conflict do nothing;
       insert into public.admins (user_id) values ('${ADMIN_ID}') on conflict do nothing;`);
  return { adminId: ADMIN_ID, userId: USER_ID };
}

/**
 * Požiadavka na PostgREST. as: 'anon' | 'authenticated' | 'admin' | 'service_role' | null (bez JWT).
 * Vráti { status, body, headers }. body je JSON, ak sa dá, inak text.
 */
export async function rest(path, { method = 'GET', as = 'anon', sub, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', ...headers };
  if (as) {
    const role = as === 'admin' ? 'authenticated' : as;
    const s = sub || (as === 'admin' ? ADMIN_ID : as === 'authenticated' ? USER_ID : undefined);
    h.Authorization = `Bearer ${jwt(role, s)}`;
  }
  const res = await fetch(`${REST_URL}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* text */ }
  return { status: res.status, body: parsed, headers: res.headers };
}

let child = null;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function killStale() {
  if (!existsSync(PIDFILE)) return;
  const pid = Number(readFileSync(PIDFILE, 'utf8'));
  if (pid && alive(pid)) {
    let comm = '';
    try { comm = execFileSync('ps', ['-p', String(pid), '-o', 'comm=']).toString(); } catch { /* gone */ }
    if (comm.includes('postgrest')) process.kill(pid, 'SIGKILL');
  }
  try { unlinkSync(PIDFILE); } catch { /* ok */ }
}

async function portBusy() {
  try {
    await fetch(`${REST_URL}/`, { signal: AbortSignal.timeout(300) });
    return true;
  } catch {
    return false;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function logTail() {
  try { return readFileSync(LOG, 'utf8').split('\n').slice(-20).join('\n'); } catch { return ''; }
}

/**
 * Vytvorí čerstvú DB (ak reset) a spustí PostgREST. Počká, kým odpovedá.
 * until: posledná migrácia ('001' … '015'); od '006' pridá seed eventov, od '012' aj spoty (default '015').
 */
export async function startStack({ reset = true, until = '015', timeoutMs = 20000 } = {}) {
  if (child) await stopStack();
  killStale();
  if (await portBusy()) {
    // stará inštancia sa môže ešte vypínať
    await sleep(500);
    if (await portBusy()) throw new Error(`Port ${PORT} is busy. Is another PostgREST (or test run) still running?`);
  }
  if (reset) resetDb({ until });
  const fd = openSync(LOG, 'w');
  child = spawn(POSTGREST, [CONF], {
    stdio: ['ignore', fd, fd],
    env: { ...process.env, PGRST_DB_URI: `postgresql://authenticator@/${DB_NAME}?host=/tmp&port=5432`, PGRST_SERVER_PORT: String(PORT) },
  });
  closeSync(fd);
  writeFileSync(PIDFILE, String(child.pid));
  let exited = null;
  child.once('exit', code => { exited = code ?? 'signal'; });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`PostgREST exited (${exited}). Log tail:\n${logTail()}`);
    try {
      const res = await fetch(`${REST_URL}/`, { signal: AbortSignal.timeout(500) });
      if (res.status === 200) { await res.arrayBuffer(); return { url: REST_URL }; }
    } catch { /* ešte nebeží */ }
    await sleep(100);
  }
  await stopStack();
  throw new Error(`PostgREST not ready within ${timeoutMs} ms. Log tail:\n${logTail()}`);
}

/** Zastaví PostgREST. DB ostáva (ďalší startStack ju vytvorí znova). */
export async function stopStack() {
  const c = child;
  child = null;
  if (c && c.exitCode === null && c.signalCode === null) {
    const done = new Promise(r => c.once('exit', r));
    c.kill('SIGTERM');
    const timer = setTimeout(() => c.kill('SIGKILL'), 3000);
    await done;
    clearTimeout(timer);
  }
  try { unlinkSync(PIDFILE); } catch { /* ok */ }
}

process.once('exit', () => { if (child) { try { child.kill('SIGKILL'); } catch { /* ok */ } } });
