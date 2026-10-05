// Import zakladateľov (Task 15) a backfill mintu. Iba SYNTETICKÉ dáta (vymyslené osoby).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, mapHeader, parseBirthDate, parseTimestamp, normalizeName, suspiciousName, categoryAtEvent, instagramOf, buildPlan, applyPlan, parseArgs, main } from '../../scripts/import-founders.js';
import { findMissing, backfill, parseArgs as backfillArgs } from '../../scripts/backfill-mint.js';
import { createNft } from '../../api/_lib/nft.js';
import { FakeDb, fakeChain, testEnv, silentLog } from '../api/_support/fakes.js';

const HEADER = [
  'Timestamp', 'Meno', 'Priezvisko', 'Prezývka:', 'Dátum narodenia:', 'Mesto, z ktorého pochádzaš:', 'Sociálna sieť',
  'Stance', 'sponzori (ak máš)', 'Máš záujem o ďalšie eventy?', 'Mesto / Lokalita, kde jazdíš', 'V ktorom skateshope nakupuješ?',
  'Mailová adresa', 'Telefónne číslo',
].map(h => `"${h}"`).join(',');

// Fiktívni jazdci. Žiadne skutočné osoby.
const CSV = [
  HEADER,
  '5/20/2026 18:01:02,Testo,Fiktívny,Fikto,1.2.2000,Bratislava,@fikto.sk,regular,"Nikto, nikde",Áno,Rača,Žiadny,Testo.Fiktivny@Example.test,+421 900 000 001',
  '5/21/2026 9:15:00,Anka,Vymyslená,,15.08.2012,Trnava,https://instagram.com/anka_v,goofy,,Áno,Trnava,,anka@example.test,',
  '5/22/2026 10:00:00,Traktora,Dominatora,TD,3. 3. 1999,Nitra,,regular,,Nie,,,td@example.test,',
  '5/23/2026 11:00:00,Bez,Datumu,,nikdy,Košice,,,,,,,bez@example.test,',
  '5/24/2026 12:00:00,Bez,Mailu,,1.1.2001,Košice,,,,,,,,',
  '5/25/2026 13:00:00,Testo,Fiktívny,,1.2.2000,Bratislava,,,,,,,testo.fiktivny@example.test,',
  '6/2/2026 14:00:00,Neskoro,Prihlásený,,1.1.1995,Žilina,,,,,,,late@example.test,',
].join('\r\n') + '\r\n';

const EVENT = 'synt-founders';
const EVENT_DATE = '2026-05-31';

/* ---------- parsovanie ---------- */
test('parseCsv: úvodzovky, čiarky v poli, "" a nové riadky, BOM a CRLF', () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n\r\n1,2,3');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'he said "hi"', 'line1\nline2'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('mapHeader: slovenská hlavička Google Forms', () => {
  const m = mapHeader(parseCsv(HEADER)[0]);
  assert.deepEqual({ ...m }, { timestamp: 0, first: 1, last: 2, nickname: 3, birth: 4, city: 5, social: 6, email: 12, phone: 13 });
  assert.throws(() => mapHeader(['Meno', 'Priezvisko']), /timestamp/);
});

test('parseBirthDate: d.m.yyyy, s medzerami, nuly, ISO; neplatné null', () => {
  assert.equal(parseBirthDate('1.2.2000'), '2000-02-01');
  assert.equal(parseBirthDate('15.08.2012'), '2012-08-15');
  assert.equal(parseBirthDate(' 3. 3. 1999 '), '1999-03-03');
  assert.equal(parseBirthDate('2001-12-24'), '2001-12-24');
  for (const bad of ['nikdy', '31.2.2001', '', '1.13.2000', '2000']) assert.equal(parseBirthDate(bad), null, bad);
});

test('parseTimestamp: M/D/YYYY s časom', () => {
  assert.deepEqual(parseTimestamp('5/20/2026 18:01:02'), { date: '2026-05-20', at: '2026-05-20T18:01:02+02:00' });
  assert.equal(parseTimestamp('6/2/2026').date, '2026-06-02');
  assert.equal(parseTimestamp('20.5.2026'), null);
  assert.equal(parseTimestamp('13/1/2026 1:00'), null);
});

test('normalizeName: bez diakritiky, malé písmená, zlúčené medzery', () => {
  assert.equal(normalizeName('  Tomáš   MÁTEL '), 'tomas matel');
  assert.equal(normalizeName('Ján Horváth'), normalizeName('jan  horvath'));
  assert.equal(normalizeName('Ľuboš-Ďuriš'), 'lubos duris');
});

test('vek a kategória k dátumu eventu', () => {
  assert.equal(categoryAtEvent('2010-06-01', EVENT_DATE), 'u16');
  assert.equal(categoryAtEvent('2010-05-31', EVENT_DATE), 'open');
});

test('suspiciousName a instagramOf', () => {
  assert.match(suspiciousName('Traktora', 'Dominatora'), /vymyslen/);
  assert.match(suspiciousName('Ján', '007'), /číslice/);
  assert.equal(suspiciousName('Testo', 'Fiktívny'), null);
  assert.equal(instagramOf('@fikto.sk'), 'fikto.sk');
  assert.equal(instagramOf('https://www.instagram.com/anka_v/'), 'anka_v');
  assert.equal(instagramOf('facebook: Anka V.'), null);
});

test('buildPlan: cutoff, preskočené riadky, duplicity, kategórie, ručná kontrola', () => {
  const p = buildPlan(CSV, { eventDate: EVENT_DATE, cutoff: '2026-06-01' });
  assert.equal(p.afterCutoff, 1);
  assert.deepEqual(p.founders.map(f => f.display_name), ['Testo Fiktívny', 'Anka Vymyslená', 'Traktora Dominatora']);
  const [testo, anka] = p.founders;
  assert.equal(testo.email, 'testo.fiktivny@example.test');
  assert.equal(testo.birth_date, '2000-02-01');
  assert.equal(testo.nickname, 'Fikto');
  assert.equal(testo.instagram, 'fikto.sk');
  assert.equal(testo.phone, '+421 900 000 001');
  assert.equal(testo.category, 'open');
  assert.equal(testo.public_name_mode, 'full');
  assert.equal(anka.category, 'u16');
  assert.equal(anka.public_name_mode, 'short');
  assert.equal(anka.nickname, null);
  assert.deepEqual(p.skipped.map(s => s.line), [5, 6, 7]);
  assert.match(p.skipped[0].reason, /dátum narodenia/);
  assert.match(p.skipped[1].reason, /e-mail/);
  assert.match(p.skipped[2].reason, /duplicitný/);
  assert.ok(p.review.some(r => r.name === 'Traktora Dominatora' && /vymyslen/.test(r.reason)));
  const women = p.review.filter(r => r.kind === 'women').map(r => r.name);
  assert.deepEqual(women, ['Testo Fiktívny', 'Traktora Dominatora']);
});

/* ---------- zápis (FakeDb) ---------- */
function seedDb() {
  return new FakeDb({
    events: [{ id: EVENT, name: 'Syntetický event', date: EVENT_DATE, status: 'done' }],
    event_results: [
      { id: 'r1', event_id: EVENT, category: 'open', rider_name: 'testo fiktivny', place: 1, points: 100, registration_id: null },
      { id: 'r2', event_id: EVENT, category: 'u16', rider_name: 'Anka Vymyslena', place: 2, points: 80, registration_id: null },
      { id: 'r3', event_id: EVENT, category: 'open', rider_name: 'Neznámy Hosť', place: 3, points: 60, registration_id: null },
      { id: 'r4', event_id: 'iny-event', category: 'open', rider_name: 'Testo Fiktívny', place: 1, points: 100, registration_id: null },
    ],
  });
}
const plan = () => buildPlan(CSV, { eventDate: EVENT_DATE, cutoff: '2026-06-01' }).founders;
const run = (db, extra = {}) => applyPlan({ db, founders: plan(), eventId: EVENT, eventDate: EVENT_DATE, log: silentLog, ...extra });

test('applyPlan: založí jazdcov, registrácie a prepojí výsledky podľa mena', async () => {
  const db = seedDb();
  const out = await run(db);
  assert.equal(out.ridersCreated, 3);
  assert.equal(out.registrationsCreated, 3);
  assert.equal(out.resultsLinked, 2);
  assert.deepEqual(out.unmatched, ['Neznámy Hosť']);
  assert.ok(db.t('riders').every(r => r.is_founder === true && /^0x[0-9a-f]{64}$/.test(r.rider_ref)));
  const regs = db.t('registrations');
  assert.ok(regs.every(r => r.status === 'checked_in' && r.nft_consent === false && r.consent_version === 'import-2026-05'
    && r.checked_in_at.startsWith(EVENT_DATE) && r.event_id === EVENT));
  const anka = db.t('riders').find(r => r.display_name === 'Anka Vymyslená');
  assert.equal(anka.public_name_mode, 'short');
  assert.equal(regs.find(r => r.rider_id === anka.id).category, 'u16');
  const priv = db.t('rider_private').find(p => p.rider_id === anka.id);
  assert.equal(priv.birth_date, '2012-08-15');
  assert.equal(priv.instagram, 'anka_v');
  const r1 = db.t('event_results').find(r => r.id === 'r1');
  assert.equal(r1.registration_id, regs.find(r => r.rider_id === db.t('riders')[0].id).id);
  assert.equal(db.t('event_results').find(r => r.id === 'r4').registration_id, null, 'iný event sa nemení');
});

test('applyPlan je idempotentný: druhý beh nič nezapíše', async () => {
  const db = seedDb();
  await run(db);
  const before = JSON.stringify(db.tables);
  const writes = db.calls.length;
  const out = await run(db);
  assert.equal(JSON.stringify(db.tables), before);
  assert.equal(db.calls.slice(writes).filter(c => ['insert', 'update', 'delete'].includes(c.op)).length, 0);
  assert.deepEqual([out.ridersCreated, out.ridersFlagged, out.registrationsCreated, out.resultsLinked], [0, 0, 0, 0]);
});

test('applyPlan: existujúci jazdec (rovnaký e-mail a dátum) sa len označí ako zakladateľ', async () => {
  const db = seedDb();
  db.t('riders').push({ id: 'x1', rider_ref: '0x' + 'a'.repeat(64), display_name: 'Testo Fiktívny', is_founder: false, public_name_mode: 'nick' });
  db.t('rider_private').push({ rider_id: 'x1', email: 'testo.fiktivny@example.test', birth_date: '2000-02-01', legal_name: 'Testo Fiktívny' });
  const out = await run(db);
  assert.equal(out.ridersFlagged, 1);
  assert.equal(out.ridersCreated, 2);
  const x = db.t('riders').find(r => r.id === 'x1');
  assert.equal(x.is_founder, true);
  assert.equal(x.public_name_mode, 'nick', 'ostatné údaje sa neprepíšu');
});

test('applyPlan: nejednoznačné meno sa neprepojí a vypíše', async () => {
  const db = seedDb();
  const founders = plan();
  founders.push({ ...founders[0], line: 99, email: 'iny@example.test', birth_date: '1990-01-01' }); // rovnaké meno, iný človek
  const out = await applyPlan({ db, founders, eventId: EVENT, eventDate: EVENT_DATE, log: silentLog });
  assert.deepEqual(out.ambiguous.map(a => a.rider_name), ['testo fiktivny']);
  assert.equal(db.t('event_results').find(r => r.id === 'r1').registration_id, null);
});

test('applyPlan --dry-run: nič nezapíše, ale ukáže plán', async () => {
  const db = seedDb();
  const out = await run(db, { dryRun: true });
  assert.equal(out.ridersCreated, 3);
  assert.equal(out.resultsLinked, 2);
  assert.equal(db.calls.filter(c => ['insert', 'update', 'delete'].includes(c.op)).length, 0);
});

test('main: číta CSV súbor, dátum eventu z DB; parseArgs', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(`${tmpdir()}/gosko-founders-`);
  try {
    const file = `${dir}/synt.csv`;
    await writeFile(file, CSV);
    const db = seedDb();
    const lines = [];
    const { out } = await main([file, '--event', EVENT], { db, log: { info: l => lines.push(l) } });
    assert.equal(out.registrationsCreated, 3);
    assert.ok(lines.some(l => l.includes('NA KONTROLU') && l.includes('Traktora')));
    assert.ok(lines.some(l => l.includes('VÝSLEDOK BEZ ZHODY: Neznámy Hosť')));
    await assert.rejects(main([file, '--event', 'neexistuje'], { db, log: { info() {} } }), /neexistuje/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  assert.deepEqual(parseArgs(['a.csv', '--dry-run', '--cutoff', '2026-07-01']), { csv: 'a.csv', dryRun: true, event: 'bratislava-2026-05', cutoff: '2026-07-01' });
  assert.throws(() => parseArgs([]), /Použitie/);
  assert.throws(() => parseArgs(['a.csv', '--cutoff', '1.6.2026']), /cutoff/);
});

/* ---------- backfill ---------- */
function backfillDb() {
  const rider = { id: 'rd1', rider_ref: '0x' + 'b'.repeat(64), display_name: 'Testo Fiktívny' };
  const reg = (id, over = {}) => ({ id, rider_id: 'rd1', event_id: EVENT, category: 'open', status: 'checked_in', nft_consent: true, created_at: id, ...over });
  return new FakeDb({
    riders: [rider],
    registrations: [
      reg('g1'), // bez tokenu -> mint
      reg('g2', { nft_consent: false }), // bez súhlasu
      reg('g3'), // už minted
      reg('g4', { category: 'u16', guardian_confirmed_at: null }), // bez súhlasu rodiča
      reg('g5'), // failed -> znova
      reg('g6', { status: 'confirmed' }), // neodbavený
    ],
    nft_tokens: [
      { registration_id: 'g3', status: 'minted', token_id: '1', chain_id: 31337, contract: 'x' },
      { registration_id: 'g5', status: 'failed', token_id: null, attempts: 1, chain_id: 31337, contract: 'x' },
    ],
    event_results: [{ event_id: EVENT, category: 'open', registration_id: 'g1', rider_name: 'T', place: 2, points: 80 }],
  });
}

test('backfill: nájde len odbavené registrácie s nft_consent bez tokenu', async () => {
  const ids = (await findMissing(backfillDb(), EVENT)).map(r => r.id);
  assert.deepEqual(ids, ['g1', 'g5']);
});

test('backfill: zmintuje chýbajúce, pošle výsledky; druhý beh nič nerobí; dry-run nemintuje', async () => {
  const db = backfillDb();
  const chain = fakeChain();
  chain.state.byReg.set('g3', 1n);
  chain.state.next = 2n;
  const nft = createNft({ env: testEnv(), db, chain: { address: '0x5FbDB2315678afecb367f032d93F642f64180aa3', ...chain }, log: silentLog });
  const dry = await backfill({ db, nft, eventId: EVENT, dryRun: true, log: silentLog });
  assert.equal(dry.candidates, 2);
  assert.equal(chain.mintCalls.length, 0);
  const out = await backfill({ db, nft, eventId: EVENT, log: silentLog });
  assert.deepEqual(out, { candidates: 2, minted: 2, failed: 0, results: 1, resultsFailed: 0 });
  assert.deepEqual(chain.resultCalls, [{ tokenId: '2', placement: 2, points: 80 }]);
  const again = await backfill({ db, nft, eventId: EVENT, log: silentLog });
  assert.equal(again.candidates, 0);
  assert.equal(chain.writeCalls, 2);
  assert.deepEqual(backfillArgs(['--dry-run', '--event', EVENT]), { dryRun: true, event: EVENT });
  assert.throws(() => backfillArgs(['--x']), /Neznámy/);
});
