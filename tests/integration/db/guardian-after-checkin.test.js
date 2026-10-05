// Migrácia 004: rodič potvrdí až po check-ine U16 jazdca (status ostáva checked_in).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, seedUsers } from '../../helpers/stack.js';
import { riderWithRegistration } from './_fixtures.js';

const confirm = p_token => rest('/rpc/confirm_guardian', { method: 'POST', as: 'service_role', body: { p_token } });

before(async () => {
  await startStack();
  seedUsers();
});

after(stopStack);

describe('confirm_guardian after check-in', () => {
  test('checked_in U16 without guardian: stays checked_in, gets guardian_confirmed_at, token cleared', async () => {
    const gt = randomUUID();
    const r = riderWithRegistration({ display_name: 'Peter Malý', mode: 'short' },
      { category: 'u16', status: 'checked_in', guardian_token: gt });
    sql(`update public.registrations set checked_in_at = now() where id = '${r.registration_id}'`);
    sql(`insert into public.event_results (event_id, category, rider_name, place, registration_id)
         values ('bratislava-2', 'u16', 'Peter Malý', 2, '${r.registration_id}')`);

    // pred potvrdením je skrytý
    assert.deepEqual((await rest(`/riders_public?select=id&id=eq.${r.rider_id}`)).body, []);
    assert.deepEqual((await rest('/results_public?select=public_name&event_id=eq.bratislava-2&category=eq.u16&place=eq.2')).body,
      [{ public_name: 'GOSko jazdec' }]);

    const res = await confirm(gt);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.id, r.registration_id);
    assert.equal(res.body.status, 'checked_in');
    assert.equal(res.body.guardian_token, null);
    assert.ok(res.body.guardian_confirmed_at);
    assert.ok(res.body.checked_in_at, 'checked_in_at is kept');

    // po potvrdení je verejný podľa public_name_mode
    assert.deepEqual((await rest(`/riders_public?select=id,public_name&id=eq.${r.rider_id}`)).body,
      [{ id: r.rider_id, public_name: 'Peter M.' }]);
    assert.deepEqual((await rest('/results_public?select=public_name,rider_id&event_id=eq.bratislava-2&category=eq.u16&place=eq.2')).body,
      [{ public_name: 'Peter M.', rider_id: r.rider_id }]);

    const again = await confirm(gt);
    assert.equal(again.status, 404);
    assert.equal(again.body.code, 'PT404');
  });

  test('pending_guardian still goes to confirmed', async () => {
    const gt = randomUUID();
    const r = riderWithRegistration({ display_name: 'Ema Mladá' }, { category: 'u16', status: 'pending_guardian', guardian_token: gt });
    const res = await confirm(gt);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'confirmed');
    assert.equal(sql(`select status || '|' || (guardian_token is null) || '|' || (guardian_confirmed_at is not null)
      from public.registrations where id = '${r.registration_id}'`), 'confirmed|true|true');
  });

  test('other states with a token are rejected with PT404 and left unchanged', async () => {
    for (const status of ['cancelled', 'no_show', 'confirmed']) {
      const gt = randomUUID();
      const r = riderWithRegistration({ display_name: `Stav ${status}` }, { category: 'u16', status, guardian_token: gt });
      const res = await confirm(gt);
      assert.equal(res.status, 404, `${status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, 'PT404');
      assert.equal(sql(`select status || '|' || (guardian_token is not null) || '|' || (guardian_confirmed_at is null)
        from public.registrations where id = '${r.registration_id}'`), `${status}|true|true`);
    }
  });

  test('checked_in with guardian already confirmed is rejected (token cannot be reused)', async () => {
    const gt = randomUUID();
    riderWithRegistration({ display_name: 'Už Potvrdený' },
      { category: 'u16', status: 'checked_in', guardian_token: gt, guardian_confirmed_at: '2026-10-01T10:00:00Z' });
    const res = await confirm(gt);
    assert.equal(res.status, 404);
    assert.equal((await confirm(randomUUID())).status, 404);
  });

  test('still service_role only', async () => {
    const gt = randomUUID();
    riderWithRegistration({ display_name: 'Bez Práv' }, { category: 'u16', status: 'checked_in', guardian_token: gt });
    for (const as of ['anon', 'authenticated', 'admin']) {
      const res = await rest('/rpc/confirm_guardian', { method: 'POST', as, body: { p_token: gt } });
      assert.ok([401, 403].includes(res.status), `${as}: ${res.status}`);
    }
    assert.equal(sql(`select count(*) from public.registrations where guardian_token = '${gt}'`), '1');
  });
});
