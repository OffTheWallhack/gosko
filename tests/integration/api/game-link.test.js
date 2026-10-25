// API hry proti lokálnemu PostgRESTu (tests/helpers/stack.js): /api/game/link-rider a herný súhlas
// rodiča cez /api/consent so skutočnou schémou 010–013. GoTrue lokálne nebeží: /auth/v1/user
// odpovedá podstrčený fetch podľa tokenu. Na produkčný Supabase sa nikdy nepripája.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import * as stack from '../../helpers/stack.js';
import { readEnv } from '../../../api/_lib/env.js';
import { createDb } from '../../../api/_lib/db.js';
import { createAuth } from '../../../api/_lib/auth.js';
import { createHandler as linkHandler } from '../../../api/game/link-rider.js';
import { createHandler as consentHandler } from '../../../api/consent.js';
import { call, fakeMail, silentLog } from '../../api/_support/fakes.js';
import { createRider, createRegistration, lit } from '../db/_fixtures.js';
import { createSpot, SPOT } from '../db/_game.js';

const users = new Map();   // token -> { id, email }
let env, db, auth;

before(async () => {
  await stack.startStack();
  env = readEnv({
    SUPABASE_URL: stack.REST_URL,
    SUPABASE_REST_URL: stack.REST_URL,
    SUPABASE_SERVICE_ROLE_KEY: stack.jwt('service_role'),
    SUPABASE_AUTH_URL: 'http://auth.local/auth/v1',
    PUBLIC_BASE_URL: 'https://gosko.test',
    NODE_ENV: 'test',
  });
  db = createDb({ url: env.SUPABASE_REST_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  const authFetch = async (url, init) => {
    assert.equal(url, 'http://auth.local/auth/v1/user');
    const u = users.get(String(init.headers.Authorization).replace('Bearer ', ''));
    return u ? Response.json({ ...u, email_confirmed_at: '2026-10-05T10:00:00Z' }) : Response.json({ msg: 'bad jwt' }, { status: 401 });
  };
  auth = createAuth({ env, db, fetch: authFetch });
});
after(stack.stopStack);

/** Používateľ Supabase Auth (auth.users) s tokenom pre podstrčený /auth/v1/user. */
function authUser(email) {
  const id = randomUUID();
  stack.sql(`insert into auth.users (id, email, email_confirmed_at) values (${lit(id)}, ${lit(email)}, now())`);
  const token = `jwt-${id}`;
  users.set(token, { id, email });
  return { id, email, token };
}

const handler = (mail = fakeMail()) => linkHandler({ env, db, mail, auth, log: silentLog });
const post = (u, body, mail) => call(handler(mail), { method: 'POST', headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' }, body });
const asPlayer = (fn, u, body = {}) => stack.rest(`/rpc/${fn}`, { method: 'POST', as: 'authenticated', sub: u.id, body });
const consent = () => consentHandler({ env, db, mail: fakeMail(), log: silentLog, chain: { enabled: false } });
const CONSENTS = { rules: true, privacy: true };

test('e-mail zo starej registrácie napojí toho istého jazdca; hráč dospelý môže hrať', async () => {
  const email = `stary-${randomUUID().slice(0, 8)}@test.local`;
  const riderId = createRider({ display_name: 'Starý Jazdec', birth_date: '1995-05-05', email });
  createRegistration({ rider_id: riderId, event_id: 'bratislava-2' });
  const u = authUser(email);
  const st = await call(handler(), { method: 'GET', headers: { authorization: `Bearer ${u.token}` } });
  assert.equal(st.json.rider, 'known');
  const res = await post(u, { username: `stary_${u.id.slice(0, 6)}`, city: 'Trnava', stance: 'goofy', consents: CONSENTS });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.rider, 'linked');
  assert.equal(stack.sql(`select rider_id from public.players where id = ${lit(u.id)}`), riderId);
  assert.equal(stack.sql(`select count(*) from public.rider_private where email = ${lit(email)}`), '1');
  const me = await asPlayer('game_me', u);
  assert.equal(me.body.can_write, true);
  assert.equal(me.body.stance, 'goofy');
  assert.ok(!res.body.includes('Starý') && !res.body.includes(email) && !res.body.includes('1995'));
});

test('nový e-mail vytvorí jazdca so všetkými povinnými stĺpcami a hráča', async () => {
  const u = authUser(`Novy-${randomUUID().slice(0, 8)}@Test.Local`);
  const res = await post(u, { username: `novy_${u.id.slice(0, 6)}`, name: 'Nový Hráč', birth_date: '2000-01-02', country: 'CZ', instagram: 'novy.ig', consents: CONSENTS });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.rider, 'new');
  const [row] = stack.sqlRows(`select r.country, r.public_name_mode, r.rider_ref, p.email, p.birth_date, p.instagram, p.legal_name
                               from public.players pl join public.riders r on r.id = pl.rider_id join public.rider_private p on p.rider_id = r.id
                               where pl.id = ${lit(u.id)}`);
  assert.equal(row.country, 'CZ');
  assert.equal(row.public_name_mode, 'full');
  assert.match(row.rider_ref, /^0x[0-9a-f]{64}$/);
  assert.equal(row.email, u.email.toLowerCase());
  assert.equal(row.birth_date, '2000-01-02');
  assert.equal(row.instagram, 'novy.ig');
  assert.equal(row.legal_name, 'Nový Hráč');
});

test('obsadený username (iná veľkosť písmen) vráti 409 a po novom jazdcovi neostane nič', async () => {
  const a = authUser(`a-${randomUUID().slice(0, 8)}@test.local`);
  const name = `Nick_${a.id.slice(0, 6)}`;
  assert.equal((await post(a, { username: name, name: 'Prvý Hráč', birth_date: '1999-01-01', country: 'SK', consents: CONSENTS })).statusCode, 201);
  const b = authUser(`b-${randomUUID().slice(0, 8)}@test.local`);
  const res = await post(b, { username: name.toUpperCase(), name: 'Druhý Hráč', birth_date: '1999-01-01', country: 'SK', consents: CONSENTS });
  assert.equal(res.statusCode, 409, res.body);
  assert.equal(res.json.error, 'username_taken');
  assert.equal(stack.sql(`select count(*) from public.rider_private where email = ${lit(b.email)}`), '0');
  assert.equal(stack.sql(`select count(*) from public.players where id = ${lit(b.id)}`), '0');
});

test('U16: token pre rodiča, len prezeranie; súhlas s eventom hru neodomkne, herný súhlas áno', async () => {
  const u = authUser(`kid-${randomUUID().slice(0, 8)}@test.local`);
  const mail = fakeMail();
  const res = await post(u, { username: `kid_${u.id.slice(0, 6)}`, name: 'Malý Jazdec', birth_date: '2013-03-03', country: 'SK',
    guardian_email: 'rodic@test.local', guardian_name: 'Rodič Testový', consents: CONSENTS }, mail);
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json.needs_guardian, true);
  assert.equal(res.json.guardian_mail_sent, true);
  const [g] = stack.sqlRows(`select guardian_email, token, token_expires_at from public.player_guardian where player_id = ${lit(u.id)}`);
  assert.equal(g.guardian_email, 'rodic@test.local');
  assert.ok(mail.sent[0].text.includes(`/api/consent?token=${g.token}`));
  assert.ok(!res.body.includes(g.token));

  const spot = createSpot();
  const me = await asPlayer('game_me', u);
  assert.equal(me.body.needs_guardian, true);
  const blocked = await asPlayer('check_in', u, { p_spot: spot, p_lat: SPOT.lat, p_lng: SPOT.lng });
  assert.equal(blocked.body.message, 'NEED_GUARDIAN');

  // rodič potvrdil registráciu na event: hra ostáva zamknutá (013)
  const riderId = stack.sql(`select rider_id from public.players where id = ${lit(u.id)}`);
  createRegistration({ rider_id: riderId, event_id: 'bratislava-2', category: 'u16', guardian_confirmed_at: '2026-10-01T10:00:00Z' });
  assert.equal((await asPlayer('check_in', u, { p_spot: spot, p_lat: SPOT.lat, p_lng: SPOT.lng })).body.message, 'NEED_GUARDIAN');

  const page = await call(consent(), { query: { token: g.token } });
  assert.equal(page.statusCode, 200);
  assert.ok(page.body.includes(`kid_${u.id.slice(0, 6)}`));
  const ok = await call(consent(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, rawBody: `token=${g.token}` });
  assert.equal(ok.headers.location, 'https://gosko.test/#/hra/potvrdene');
  assert.equal((await asPlayer('game_me', u)).body.can_write, true);
  const inn = await asPlayer('check_in', u, { p_spot: spot, p_lat: SPOT.lat, p_lng: SPOT.lng });
  assert.equal(inn.status, 200, JSON.stringify(inn.body));
  const again = await call(consent(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, rawBody: `token=${g.token}` });
  assert.equal(again.headers.location, 'https://gosko.test/#/registracia/neplatny-odkaz');

  // súhlas s hrou bez fotiek: klip nejde (016); hráč si vypýta nový odkaz, rodič zaškrtne fotky a videá
  assert.equal((await asPlayer('game_me', u)).body.can_publish, false);
  const clip = await asPlayer('add_clip', u, { p_spot: spot, p_kind: 'embed', p_embed_url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(clip.body.message, 'NEED_MEDIA_CONSENT');
  const resend = await post(u, { resend_guardian: true }, mail);
  assert.equal(resend.json.needs_media_consent, true);
  assert.equal(resend.json.guardian_mail_sent, true);
  const t2 = stack.sql(`select token from public.player_guardian where player_id = ${lit(u.id)}`);
  const page2 = await call(consent(), { query: { token: t2 } });
  assert.match(page2.body, /<input type="checkbox" name="media" value="1"/);
  const ok2 = await call(consent(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, rawBody: `token=${t2}&media=1` });
  assert.equal(ok2.headers.location, 'https://gosko.test/#/hra/potvrdene');
  assert.equal((await asPlayer('game_me', u)).body.can_publish, true);
  assert.equal((await asPlayer('add_clip', u, { p_spot: spot, p_kind: 'embed', p_embed_url: 'https://youtu.be/dQw4w9WgXcQ' })).status, 200);
});

test('event token potvrdí registráciu cez ten istý /api/consent ako predtým', async () => {
  const token = randomUUID();
  const riderId = createRider({ birth_date: '2012-01-01' });
  createRegistration({ rider_id: riderId, event_id: 'bratislava-2', category: 'u16', status: 'pending_guardian', guardian_token: token });
  const res = await call(consent(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, rawBody: `token=${token}` });
  assert.equal(res.headers.location, 'https://gosko.test/#/registracia/potvrdene');
});
