// Stav po nasadení samotnej migrácie 001 (bezpečnostná oprava ide do produkcie ako prvá):
// diera je zavretá a súčasný web (starý registračný formulár, check-in, admin výsledky) funguje ďalej.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, seedUsers } from '../../helpers/stack.js';
import { DENIED } from './_fixtures.js';

const minimal = { Prefer: 'return=minimal' };

before(async () => {
  await startStack({ until: '001' });
  seedUsers();
  sql(`insert into public.community_events (name, date, city, country, contact, approved)
       values ('Schválený jam', '2026-11-01', 'Bratislava', 'SK', 'tajny@kontakt.sk', true)`);
});

after(stopStack);

describe('after 001 only', () => {
  test('anon cannot write through community_events_public anymore', async () => {
    const p = await rest('/community_events_public?id=not.is.null', { method: 'PATCH', body: { name: 'HACKED' } });
    assert.ok(DENIED.includes(p.status), String(p.status));
    const d = await rest('/community_events_public?id=not.is.null', { method: 'DELETE' });
    assert.ok(DENIED.includes(d.status), String(d.status));
    assert.equal(sql(`select name from public.community_events`), 'Schválený jam');
  });

  test('the current registration form still works (client-generated token)', async () => {
    const token = randomUUID();
    const res = await rest('/registrations', { method: 'POST', headers: minimal,
      body: { event_id: 'bratislava-2', token, name: 'Nový Jazdec', instagram: '', city: 'BA', category: 'open', contact: 'novy@test.local', parent_consent: false } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(sql(`select count(*) from public.registrations where token = '${token}'`), '1');
  });

  test('anon cannot set checked_in_at, id or created_at on a registration, nor read registrations', async () => {
    for (const extra of [{ checked_in_at: '2026-01-01T00:00:00Z' }, { id: randomUUID() }, { created_at: '2000-01-01T00:00:00Z' }]) {
      const res = await rest('/registrations', { method: 'POST', headers: minimal,
        body: { event_id: 'bratislava-2', token: randomUUID(), name: 'Podvod', category: 'open', contact: 'x@test.local', ...extra } });
      assert.ok(DENIED.includes(res.status), `${Object.keys(extra)}: ${res.status}`);
    }
    assert.equal(sql(`select count(*) from public.registrations where name = 'Podvod'`), '0');
    const r = await rest('/registrations?select=*');
    assert.ok(DENIED.includes(r.status), String(r.status));
  });

  test('admin check-in by token still works, non-admin cannot', async () => {
    const token = randomUUID();
    sql(`insert into public.registrations (event_id, name, category, contact, token) values ('bratislava-2', 'Check In', 'open', 'c@test.local', '${token}')`);
    const user = await rest(`/registrations?token=eq.${token}&checked_in_at=is.null`, { method: 'PATCH', as: 'authenticated', body: { checked_in_at: new Date().toISOString() } });
    assert.ok([204, ...DENIED].includes(user.status), String(user.status));
    assert.equal(sql(`select checked_in_at is null from public.registrations where token = '${token}'`), 't');
    const admin = await rest(`/registrations?token=eq.${token}&checked_in_at=is.null`, { method: 'PATCH', as: 'admin', body: { checked_in_at: new Date().toISOString() } });
    assert.equal(admin.status, 204, JSON.stringify(admin.body));
    const row = await rest(`/registrations?select=name,checked_in_at&token=eq.${token}`, { as: 'admin' });
    assert.equal(row.body[0].name, 'Check In');
    assert.ok(row.body[0].checked_in_at);
  });

  test('admin can still save results, awards and brackets directly; anon reads them', async () => {
    assert.equal((await rest('/event_results?event_id=eq.bratislava-2026-05&category=eq.open', { method: 'DELETE', as: 'admin' })).status, 204);
    const ins = await rest('/event_results', { method: 'POST', as: 'admin', headers: minimal,
      body: [{ event_id: 'bratislava-2026-05', category: 'open', rider_name: 'Sebastian Kozmann', place: 1 }] });
    assert.equal(ins.status, 201, JSON.stringify(ins.body));
    const aw = await rest('/event_awards', { method: 'POST', as: 'admin', headers: minimal,
      body: [{ event_id: 'bratislava-2026-05', name: 'Best Trick', rider_name: 'Ján Horvath' }] });
    assert.equal(aw.status, 201, JSON.stringify(aw.body));
    const br = await rest('/brackets?on_conflict=event_id,category', { method: 'POST', as: 'admin',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { event_id: 'bratislava-2026-05', category: 'open', data: {} } });
    assert.equal(br.status, 201, JSON.stringify(br.body));
    const anon = await rest('/event_results?select=rider_name,place&event_id=eq.bratislava-2026-05');
    assert.deepEqual(anon.body, [{ rider_name: 'Sebastian Kozmann', place: 1 }]);
    const hack = await rest('/event_results', { method: 'POST', headers: minimal,
      body: [{ event_id: 'x', category: 'open', rider_name: 'Hacker', place: 1 }] });
    assert.ok(DENIED.includes(hack.status), String(hack.status));
  });
});
