#!/usr/bin/env node
// Import zakladateľov GOSko (plán, Task 15) z CSV exportu Google Forms.
//
//   node scripts/import-founders.js <csv> [--dry-run] [--event bratislava-2026-05] [--cutoff 2026-06-01]
//
// - Zakladatelia = riadky s Timestamp (M/D/YYYY) pred --cutoff.
// - Zapisuje cez service role PostgREST (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY z env):
//   riders (is_founder), rider_private, registrations (checked_in, bez NFT súhlasu).
// - Potom prepojí existujúce event_results (rider_name) s registráciou podľa normalizovaného mena.
// - Idempotentné: druhý beh nič nezmení. --dry-run nič nezapíše.
// - CSV s osobnými údajmi sa NECOMMITUJE (patrí mimo repa).
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readEnv } from '../api/_lib/env.js';
import { createDb, eq, isNull, isUniqueViolation } from '../api/_lib/db.js';
import { ageAt, isDate, isEmail, U16_LIMIT } from '../api/_lib/validate.js';

export const DEFAULTS = { event: 'bratislava-2026-05', cutoff: '2026-06-01', consentVersion: 'import-2026-05' };

/* ---------- CSV ---------- */

// RFC 4180: úvodzovky, "" vo vnútri, nové riadky v poli, BOM, CRLF.
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

export const normalizeName = s => String(s ?? '')
  .normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// Hlavičky Google Forms (slovensky) -> interné kľúče. Porovnáva sa začiatok normalizovaného textu.
const HEADER_KEYS = [
  ['timestamp', 'timestamp'],
  ['casova peciatka', 'timestamp'],
  ['meno', 'first'],
  ['priezvisko', 'last'],
  ['prezyvka', 'nickname'],
  ['datum narodenia', 'birth'],
  ['mesto z ktoreho', 'city'],
  ['socialna siet', 'social'],
  ['mailova adresa', 'email'],
  ['e mail', 'email'],
  ['email', 'email'],
  ['telefonne cislo', 'phone'],
];

export function mapHeader(header) {
  const map = {};
  header.forEach((h, i) => {
    const n = normalizeName(h);
    const hit = HEADER_KEYS.find(([p]) => n === p || n.startsWith(`${p} `));
    if (hit && map[hit[1]] === undefined) map[hit[1]] = i;
  });
  for (const k of ['timestamp', 'first', 'last', 'birth', 'email']) {
    if (map[k] === undefined) throw new Error(`CSV nemá stĺpec pre ${k}. Hlavička: ${header.join(' | ')}`);
  }
  return map;
}

const pad = n => String(n).padStart(2, '0');
function iso(y, m, d) {
  const out = `${y}-${pad(m)}-${pad(d)}`;
  return isDate(out) ? out : null;
}

// Dátum narodenia z formulára: d.m.yyyy (aj s medzerami), prípadne yyyy-mm-dd.
export function parseBirthDate(v) {
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/.exec(s);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // d/m/yyyy, ak niekto písal lomky
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

// Timestamp Google Forms: M/D/YYYY H:mm:ss -> { date: 'YYYY-MM-DD', at: ISO }
export function parseTimestamp(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v ?? '').trim());
  if (!m) return null;
  const date = iso(Number(m[3]), Number(m[1]), Number(m[2]));
  if (!date) return null;
  const at = `${date}T${pad(m[4] ?? 0)}:${m[5] ?? '00'}:${m[6] ?? '00'}+02:00`;
  return { date, at };
}

export function instagramOf(v) {
  const s = String(v ?? '').trim();
  let m = /instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(s);
  if (m) return m[1];
  m = /^@?([A-Za-z0-9._]{1,30})$/.exec(s);
  return m ? m[1] : null;
}

// celé slová (alebo začiatok slova pri traktor*, dominator*, ...), aby reálne mená ako „Testo“ neprešli ako podozrivé
const SILLY = /\b(traktor\w*|dominator\w*|asdf\w*|qwer\w*|test|xxx|lol|anonym\w*|nikto|neviem|nevim|batman|superman)\b|jozko mrkvicka/;

// Zjavne vymyslené meno: na ručnú kontrolu (importuje sa aj tak).
export function suspiciousName(first, last) {
  const f = normalizeName(first);
  const l = normalizeName(last);
  const full = `${f} ${l}`.trim();
  if (!f || !l) return 'chýba meno alebo priezvisko';
  if (/\d/.test(full)) return 'číslice v mene';
  if (SILLY.test(full)) return 'meno vyzerá vymyslene';
  if (f === l) return 'meno a priezvisko sú rovnaké';
  if (f.length < 2 || l.length < 2) return 'príliš krátke meno';
  return null;
}

export const categoryAtEvent = (birthDate, eventDate) => (ageAt(birthDate, eventDate) < U16_LIMIT ? 'u16' : 'open');

const clean = v => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const cap = (v, n) => (v && v.length <= n ? v : null);

/**
 * Z CSV textu urobí zoznam zakladateľov a zoznam na ručnú kontrolu.
 * @returns {{founders: object[], skipped: object[], review: object[], afterCutoff: number}}
 */
export function buildPlan(text, { eventDate, cutoff }) {
  const rows = parseCsv(text);
  if (!rows.length) return { founders: [], skipped: [], review: [], afterCutoff: 0 };
  const col = mapHeader(rows[0]);
  const get = (r, k) => (col[k] === undefined ? '' : clean(r[col[k]]));
  const founders = [];
  const skipped = [];
  const review = [];
  const seen = new Map();
  let afterCutoff = 0;

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const first = get(r, 'first');
    const last = get(r, 'last');
    const name = `${first} ${last}`.trim();
    const ts = parseTimestamp(get(r, 'timestamp'));
    if (!ts) return skipped.push({ line, name, reason: 'neplatný Timestamp' });
    if (ts.date >= cutoff) { afterCutoff += 1; return; }
    const birth = parseBirthDate(get(r, 'birth'));
    if (!birth) return skipped.push({ line, name, reason: `neplatný dátum narodenia: "${get(r, 'birth')}"` });
    const email = get(r, 'email').toLowerCase();
    if (!isEmail(email)) return skipped.push({ line, name, reason: 'chýba alebo neplatný e-mail' });
    if (!name || name.length > 60) return skipped.push({ line, name, reason: 'meno chýba alebo má nad 60 znakov' });
    const key = `${email}|${birth}`;
    if (seen.has(key)) return skipped.push({ line, name, reason: `duplicitný riadok (rovnaký e-mail a dátum ako riadok ${seen.get(key)})` });
    seen.set(key, line);

    const age = ageAt(birth, eventDate);
    const category = age < U16_LIMIT ? 'u16' : 'open';
    const f = {
      line,
      display_name: name,
      legal_name: name,
      nickname: cap(get(r, 'nickname'), 40),
      city: cap(get(r, 'city'), 60),
      email,
      birth_date: birth,
      phone: cap(get(r, 'phone'), 40),
      instagram: instagramOf(get(r, 'social')),
      category,
      public_name_mode: category === 'u16' ? 'short' : 'full',
      consent_at: ts.at,
    };
    founders.push(f);
    const sus = suspiciousName(first, last);
    if (sus) review.push({ line, name, reason: sus });
    if (age < 6 || age > 99) review.push({ line, name, reason: `nezvyčajný vek ${age} rokov` });
    if (category === 'open') review.push({ line, name, reason: 'kategória open: over, či nejde o babskú kategóriu (women)', kind: 'women' });
  });
  return { founders, skipped, review, afterCutoff };
}

/* ---------- zápis do DB ---------- */

/**
 * Vykoná plán. Idempotentné. Pri dryRun iba číta a hlási, čo by sa zmenilo.
 * @returns {Promise<{ridersCreated, ridersFlagged, registrationsCreated, resultsLinked, unmatched: string[], ambiguous: object[], categoryMismatch: object[]}>}
 */
export async function applyPlan({ db, founders, eventId, eventDate, consentVersion = DEFAULTS.consentVersion, dryRun = false, rand = randomBytes, log = console }) {
  const out = { ridersCreated: 0, ridersFlagged: 0, registrationsCreated: 0, resultsLinked: 0, unmatched: [], ambiguous: [], categoryMismatch: [] };
  const regByName = new Map(); // normalizované meno -> Set(registration_id)
  const regInfo = new Map();
  const addName = (n, id) => {
    const k = normalizeName(n);
    if (!k) return;
    if (!regByName.has(k)) regByName.set(k, new Set());
    regByName.get(k).add(id);
  };

  for (const f of founders) {
    let riderId = null;
    let founder = false;
    const priv = await db.selectOne('rider_private', { email: eq(f.email), birth_date: eq(f.birth_date) }, { select: 'rider_id' });
    if (priv) {
      const rider = await db.selectOne('riders', { id: eq(priv.rider_id) }, { select: 'id,is_founder,display_name' });
      riderId = rider.id;
      founder = rider.is_founder;
      if (!founder) {
        out.ridersFlagged += 1;
        if (!dryRun) await db.update('riders', { id: eq(riderId) }, { is_founder: true });
      }
    } else if (dryRun) {
      out.ridersCreated += 1;
      out.registrationsCreated += 1;
      addName(f.display_name, `nový:${f.line}`);
      regInfo.set(`nový:${f.line}`, { category: f.category, name: f.display_name });
      continue;
    } else {
      const [rider] = await db.insert('riders', {
        rider_ref: `0x${rand(32).toString('hex')}`,
        display_name: f.display_name,
        nickname: f.nickname,
        country: 'SK',
        city: f.city,
        public_name_mode: f.public_name_mode,
        is_founder: true,
      });
      try {
        await db.insert('rider_private', {
          rider_id: rider.id, legal_name: f.legal_name, birth_date: f.birth_date, email: f.email, phone: f.phone, instagram: f.instagram,
        });
      } catch (err) {
        await db.delete('riders', { id: eq(rider.id) }).catch(() => {});
        if (!isUniqueViolation(err)) throw err;
        throw new Error(`riadok ${f.line}: jazdec vznikol súbežne, spusti import znova`);
      }
      riderId = rider.id;
      out.ridersCreated += 1;
    }

    let reg = await db.selectOne('registrations', { rider_id: eq(riderId), event_id: eq(eventId) }, { select: 'id,category' });
    if (!reg) {
      out.registrationsCreated += 1;
      if (dryRun) {
        reg = { id: `nový:${f.line}`, category: f.category };
      } else {
        [reg] = await db.insert('registrations', {
          rider_id: riderId,
          event_id: eventId,
          category: f.category,
          status: 'checked_in',
          checked_in_at: `${eventDate}T12:00:00Z`,
          consent_version: consentVersion,
          consent_at: f.consent_at,
          photo_consent: false,
          nft_consent: false,
        });
      }
    }
    addName(f.display_name, reg.id);
    regInfo.set(reg.id, { category: reg.category, name: f.display_name });
  }

  // prepojenie výsledkov podľa mena
  const results = await db.select('event_results', { event_id: eq(eventId), registration_id: isNull }, { select: 'id,category,rider_name,place' });
  const linked = await db.select('event_results', { event_id: eq(eventId), registration_id: 'not.is.null' }, { select: 'registration_id,category' });
  const taken = new Set(linked.map(r => `${r.registration_id}|${r.category}`));
  for (const r of results) {
    const ids = [...(regByName.get(normalizeName(r.rider_name)) || [])];
    if (!ids.length) { out.unmatched.push(r.rider_name); continue; }
    if (ids.length > 1) { out.ambiguous.push({ rider_name: r.rider_name, candidates: ids.length }); continue; }
    const id = ids[0];
    if (taken.has(`${id}|${r.category}`)) { out.ambiguous.push({ rider_name: r.rider_name, candidates: 1, note: 'registrácia už má výsledok v kategórii' }); continue; }
    const info = regInfo.get(id);
    if (info && info.category !== r.category) out.categoryMismatch.push({ rider_name: r.rider_name, registration: info.category, result: r.category });
    taken.add(`${id}|${r.category}`);
    out.resultsLinked += 1;
    if (!dryRun) await db.update('event_results', { id: eq(r.id), registration_id: isNull }, { registration_id: id });
  }
  return out;
}

/* ---------- CLI ---------- */

export function parseArgs(argv) {
  const opts = { dryRun: false, event: DEFAULTS.event, cutoff: DEFAULTS.cutoff, csv: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--event') opts.event = argv[++i];
    else if (a === '--cutoff') opts.cutoff = argv[++i];
    else if (a.startsWith('--')) throw new Error(`Neznámy prepínač ${a}`);
    else opts.csv = a;
  }
  if (!opts.csv) throw new Error('Použitie: node scripts/import-founders.js <csv> [--dry-run] [--event ID] [--cutoff YYYY-MM-DD]');
  if (!isDate(opts.cutoff)) throw new Error('--cutoff musí byť YYYY-MM-DD');
  return opts;
}

export async function main(argv, { env = readEnv(), db: injectedDb, log = console } = {}) {
  const opts = parseArgs(argv);
  const db = injectedDb || createDb({ url: env.SUPABASE_REST_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  const event = await db.selectOne('events', { id: eq(opts.event) }, { select: 'id,name,date' });
  if (!event) throw new Error(`Event ${opts.event} v DB neexistuje.`);
  if (!event.date) throw new Error(`Event ${opts.event} nemá dátum, vek sa nedá určiť.`);
  const text = await readFile(opts.csv, 'utf8');
  const plan = buildPlan(text, { eventDate: event.date, cutoff: opts.cutoff });

  log.info(`${opts.dryRun ? '[DRY RUN] ' : ''}Event ${event.id} (${event.date}), cutoff ${opts.cutoff}`);
  log.info(`Zakladatelia: ${plan.founders.length}, po cutoffe: ${plan.afterCutoff}, preskočené: ${plan.skipped.length}`);
  for (const s of plan.skipped) log.info(`  PRESKOČENÉ riadok ${s.line} ${s.name}: ${s.reason}`);
  for (const r of plan.review.filter(x => x.kind !== 'women')) log.info(`  NA KONTROLU riadok ${r.line} ${r.name}: ${r.reason}`);
  const women = plan.review.filter(x => x.kind === 'women');
  if (women.length) log.info(`  Kategória open (over babskú): ${women.map(w => w.name).join(', ')}`);

  const out = await applyPlan({ db, founders: plan.founders, eventId: event.id, eventDate: event.date, dryRun: opts.dryRun, log });
  log.info(`Jazdci noví: ${out.ridersCreated}, označení ako zakladateľ: ${out.ridersFlagged}, registrácie nové: ${out.registrationsCreated}, prepojené výsledky: ${out.resultsLinked}`);
  for (const n of out.unmatched) log.info(`  VÝSLEDOK BEZ ZHODY: ${n}`);
  for (const a of out.ambiguous) log.info(`  NEJEDNOZNAČNÉ: ${a.rider_name} (${a.candidates}${a.note ? `, ${a.note}` : ''})`);
  for (const c of out.categoryMismatch) log.info(`  KATEGÓRIA NESEDÍ: ${c.rider_name} registrácia ${c.registration}, výsledok ${c.result}`);
  return { plan, out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(err => { console.error(err.message); process.exit(1); });
}

