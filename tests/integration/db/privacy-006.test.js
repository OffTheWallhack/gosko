// Migrácia 006: opravy z bezpečnostného auditu (H1, M1, M2, L1, L6, L8).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, sqlRows, seedUsers } from '../../helpers/stack.js';
import { DENIED, createNftToken, riderWithRegistration } from './_fixtures.js';

const confirm = p_token => rest('/rpc/confirm_guardian', { method: 'POST', as: 'service_role', body: { p_token } });

before(async () => {
  await startStack();
  seedUsers();
});

after(stopStack);

describe('H1: registrations_admin', () => {
  test('admin gets public names; U16 without guardian consent has no name; no personal columns', async () => {
    const short = riderWithRegistration({ display_name: 'Marek Kupkovič', mode: 'short' });
    const nick = riderWithRegistration({ display_name: 'Jana Nová', nickname: 'Janka', mode: 'nick' });
    const kid = riderWithRegistration({ display_name: 'Peter Malý', mode: 'full' }, { category: 'u16', status: 'pending_guardian', guardian_token: randomUUID() });
    const kidOk = riderWithRegistration({ display_name: 'Ondrej Malý', mode: 'full' }, { category: 'u16', status: 'confirmed', guardian_confirmed_at: '2026-10-01T10:00:00Z' });
    const ids = [short, nick, kid, kidOk].map(x => x.registration_id);
    const res = await rest(`/registrations_admin?select=*&id=in.(${ids.join(',')})&order=public_name.nullsfirst`, { as: 'admin' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['category', 'checked_in_at', 'event_id', 'id', 'public_name', 'status']);
    assert.deepEqual(res.body.map(r => r.public_name), [null, 'Janka', 'Marek K.', 'Ondrej Malý']);
    assert.equal(res.body[0].id, kid.registration_id);
  });

  test('non-admin authenticated sees nothing, anon is denied', async () => {
    const user = await rest('/registrations_admin?select=id', { as: 'authenticated' });
    assert.equal(user.status, 200);
    assert.deepEqual(user.body, []);
    const anon = await rest('/registrations_admin?select=id', { as: 'anon' });
    assert.ok(DENIED.includes(anon.status), `${anon.status}`);
  });
});

describe('M1 + L6: guardian per registration, token expiry', () => {
  test('registrations has guardian_name, guardian_email and guardian_token_expires_at', () => {
    const cols = sqlRows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'registrations'
      and column_name like 'guardian%' order by 1`).map(r => r.column_name);
    assert.deepEqual(cols, ['guardian_confirmed_at', 'guardian_email', 'guardian_name', 'guardian_token', 'guardian_token_expires_at']);
  });

  test('an expired guardian token is rejected like an unknown one (PT404) and changes nothing', async () => {
    const gt = randomUUID();
    const r = riderWithRegistration({ display_name: 'Starý Odkaz' }, { category: 'u16', status: 'pending_guardian', guardian_token: gt });
    sql(`update public.registrations set guardian_token_expires_at = now() - interval '1 minute' where id = '${r.registration_id}'`);
    const res = await confirm(gt);
    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(sql(`select status from public.registrations where id = '${r.registration_id}'`), 'pending_guardian');
  });

  test('a token that has not expired yet still works', async () => {
    const gt = randomUUID();
    const r = riderWithRegistration({ display_name: 'Platný Odkaz' }, { category: 'u16', status: 'pending_guardian', guardian_token: gt });
    sql(`update public.registrations set guardian_token_expires_at = now() + interval '1 day' where id = '${r.registration_id}'`);
    const res = await confirm(gt);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'confirmed');
  });
});

describe('M2 + L1: public views', () => {
  test('nft_tokens.rider_ref is unique and must be 0x + 64 hex', () => {
    const a = riderWithRegistration({ display_name: 'Ref Jeden' });
    const b = riderWithRegistration({ display_name: 'Ref Dva' });
    createNftToken({ registration_id: a.registration_id });
    createNftToken({ registration_id: b.registration_id });
    const ref = `0x${'ab'.repeat(32)}`;
    sql(`update public.nft_tokens set rider_ref = '${ref}' where registration_id = '${a.registration_id}'`);
    assert.throws(() => sql(`update public.nft_tokens set rider_ref = '${ref}' where registration_id = '${b.registration_id}'`), /duplicate key/);
    assert.throws(() => sql(`update public.nft_tokens set rider_ref = 'abc' where registration_id = '${b.registration_id}'`), /check constraint/);
  });

  test('riders_public has no city', async () => {
    const res = await rest('/riders_public?select=*&limit=1');
    assert.equal(res.status, 200);
    const cols = sqlRows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'riders_public'`).map(r => r.column_name);
    assert.ok(!cols.includes('city'));
  });
});

describe('L8: default function privileges', () => {
  test('a function created after 006 is not executable by anon or authenticated', async () => {
    sql(`create or replace function public.zz_after_006() returns int language sql as 'select 1'`);
    try {
      for (const role of ['anon', 'authenticated']) {
        assert.equal(sql(`select has_function_privilege('${role}', 'public.zz_after_006()', 'EXECUTE')`), 'f', role);
      }
      assert.equal(sql(`select has_function_privilege('service_role', 'public.zz_after_006()', 'EXECUTE')`), 't');
    } finally {
      sql('drop function public.zz_after_006()');
    }
  });
});
