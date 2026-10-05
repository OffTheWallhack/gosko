// Task 10 / migrácia 003: save_results(p_event_id, p_category, p_rows, p_actor) je atomické RPC s audit_log.
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startStack, stopStack, rest, sql, sqlRows, seedUsers, ADMIN_ID } from '../../helpers/stack.js';
import { DENIED, createNftToken, riderWithRegistration } from './_fixtures.js';

const EVENT = 'bratislava-2';
let a, b, c, other;

const save = (p_rows, { as = 'service_role', p_category = 'open', p_event_id = EVENT, p_actor = ADMIN_ID } = {}) =>
  rest('/rpc/save_results', { method: 'POST', as, body: { p_event_id, p_category, p_rows, p_actor } });

const results = (category = 'open') => sqlRows(`select rider_name, place, points, registration_id from public.event_results
  where event_id = '${EVENT}' and category = '${category}' order by place, rider_name`);
const auditCount = () => Number(sql(`select count(*) from public.audit_log where action = 'results.save'`));
const nftStatus = id => sql(`select status from public.nft_tokens where registration_id = '${id}'`);

before(async () => {
  await startStack();
  seedUsers();
  a = riderWithRegistration({ display_name: 'Adam Prvý' });
  b = riderWithRegistration({ display_name: 'Boris Druhý' });
  c = riderWithRegistration({ display_name: 'Cyril Tretí' });
  other = riderWithRegistration({ display_name: 'Iný Event' }, { event_id: 'zilina-2026' });
  createNftToken({ registration_id: a.registration_id, status: 'minted', token_id: 1 });
  createNftToken({ registration_id: b.registration_id, status: 'result_set', token_id: 2 });
  createNftToken({ registration_id: c.registration_id, status: 'pending' });
});

after(stopStack);

describe('save_results', () => {
  beforeEach(() => {
    sql(`delete from public.event_results where event_id = '${EVENT}';
         update public.nft_tokens set status = case registration_id
           when '${a.registration_id}' then 'minted' when '${b.registration_id}' then 'result_set' else 'pending' end;`);
  });

  test('saves rows, computes points, writes audit_log and marks NFTs result_pending', async () => {
    const before = auditCount();
    const res = await save([
      { registration_id: a.registration_id, rider_name: 'Adam Prvý', place: 1 },
      { registration_id: b.registration_id, rider_name: 'Boris Druhý', place: 2 },
      { registration_id: c.registration_id, rider_name: 'Cyril Tretí', place: 3 },
      { registration_id: null, rider_name: 'Hosť bez registrácie', place: 4 },
    ]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body, 4);
    assert.deepEqual(results().map(r => [r.rider_name, r.place, r.points]), [
      ['Adam Prvý', 1, 100], ['Boris Druhý', 2, 80], ['Cyril Tretí', 3, 60], ['Hosť bez registrácie', 4, 60]]);

    assert.equal(nftStatus(a.registration_id), 'result_pending');
    assert.equal(nftStatus(b.registration_id), 'result_pending');
    assert.equal(nftStatus(c.registration_id), 'pending', 'unminted token stays pending');

    assert.equal(auditCount(), before + 1);
    const [log] = sqlRows(`select actor, entity, entity_id, data from public.audit_log where action = 'results.save' order by id desc limit 1`);
    assert.equal(log.actor, ADMIN_ID);
    assert.equal(log.entity, 'event_results');
    assert.equal(log.entity_id, `${EVENT}/open`);
    assert.equal(log.data.saved, 4);
    assert.equal(log.data.nft_updates, 2);
    assert.equal(log.data.rows.length, 4);
    assert.ok(!JSON.stringify(log.data.rows).includes('Adam'), 'registered riders are logged by registration_id, not name');
  });

  test('replaces the whole category on re-save', async () => {
    await save([{ registration_id: a.registration_id, rider_name: 'Adam Prvý', place: 1 }, { rider_name: 'Hosť', place: 2 }]);
    const res = await save([{ registration_id: b.registration_id, rider_name: 'Boris Druhý', place: 1 }]);
    assert.equal(res.body, 1);
    assert.deepEqual(results().map(r => r.rider_name), ['Boris Druhý']);
  });

  test('fills rider_name from the rider when it is missing', async () => {
    const res = await save([{ registration_id: c.registration_id, place: 5 }]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(results().map(r => [r.rider_name, r.points]), [['Cyril Tretí', 40]]);
  });

  test('is atomic: a bad row rolls back everything', async () => {
    await save([{ registration_id: a.registration_id, rider_name: 'Adam Prvý', place: 1 }, { rider_name: 'Hosť', place: 2 }]);
    const snapshot = results();
    sql(`update public.nft_tokens set status = 'minted' where registration_id = '${a.registration_id}'`);
    const auditBefore = auditCount();

    const bad = [
      [[{ registration_id: b.registration_id, rider_name: 'Boris', place: 1 }, { rider_name: 'Zlé miesto', place: 0 }], 400, '23514'],
      [[{ registration_id: b.registration_id, rider_name: 'Boris', place: 1 }, { rider_name: 'Bez miesta' }], 400, '23502'],
      [[{ registration_id: a.registration_id, rider_name: 'Adam', place: 1 }, { registration_id: randomUUID(), rider_name: 'Duch', place: 2 }], 409, '23503'],
      [[{ registration_id: a.registration_id, rider_name: 'Adam', place: 1 }, { registration_id: other.registration_id, rider_name: 'Iný', place: 2 }], 400, '22023'],
      [[{ rider_name: 'Dvakrát', place: 1 }, { rider_name: 'Dvakrát', place: 2 }], 409, '23505'],
      [[{ registration_id: a.registration_id, rider_name: 'Adam', place: 1 }, { registration_id: a.registration_id, rider_name: 'Adam', place: 2 }], 409, '23505'],
      [[{ rider_name: 'X', place: 'prvý' }], 400, '22P02'],
    ];
    for (const [rows, status, code] of bad) {
      const res = await save(rows);
      assert.equal(res.status, status, `${JSON.stringify(rows)} -> ${res.status} ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, code, JSON.stringify(res.body));
      assert.deepEqual(results(), snapshot, 'existing results must survive');
      assert.equal(nftStatus(a.registration_id), 'minted', 'NFT status must roll back');
      assert.equal(auditCount(), auditBefore, 'no audit row for a failed save');
    }
  });

  test('rejects bad input: unknown event, bad category, non-array rows', async () => {
    const e = await save([], { p_event_id: 'neexistuje' });
    assert.equal(e.status, 404, JSON.stringify(e.body));
    assert.equal(e.body.code, 'PT404');
    assert.equal(e.body.message, 'event_not_found');
    const cat = await save([], { p_category: 'pro' });
    assert.equal(cat.status, 400);
    assert.equal(cat.body.code, '22023');
    const obj = await save({ rider_name: 'X', place: 1 });
    assert.equal(obj.status, 400);
    assert.equal(obj.body.code, '22023');
  });

  test('an empty array clears the category and is audited', async () => {
    await save([{ rider_name: 'Hosť', place: 1 }]);
    const before = auditCount();
    const res = await save([]);
    assert.equal(res.status, 200);
    assert.equal(res.body, 0);
    assert.deepEqual(results(), []);
    assert.equal(auditCount(), before + 1);
  });

  test('005: a rider removed from the results gets result_pending so the chain value is cleared', async () => {
    await save([{ registration_id: a.registration_id, rider_name: 'Adam Prvý', place: 1 }, { registration_id: b.registration_id, rider_name: 'Boris Druhý', place: 2 }]);
    sql(`update public.nft_tokens set status = 'result_set' where registration_id in ('${a.registration_id}', '${b.registration_id}')`);
    const res = await save([{ registration_id: b.registration_id, rider_name: 'Boris Druhý', place: 1 }]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(nftStatus(a.registration_id), 'result_pending', 'removed rider: chain still holds the old result');
    assert.equal(nftStatus(b.registration_id), 'result_pending');
    const [log] = sqlRows(`select data from public.audit_log where action = 'results.save' order by id desc limit 1`);
    assert.equal(log.data.nft_updates, 2);
  });

  test('005: an empty array marks every token that had a result on chain, not unminted or untouched ones', async () => {
    await save([{ registration_id: a.registration_id, rider_name: 'Adam Prvý', place: 1 }, { registration_id: c.registration_id, rider_name: 'Cyril Tretí', place: 2 }]);
    sql(`update public.nft_tokens set status = 'result_set' where registration_id = '${a.registration_id}'`);
    const res = await save([]);
    assert.equal(res.status, 200);
    assert.equal(nftStatus(a.registration_id), 'result_pending');
    assert.equal(nftStatus(b.registration_id), 'result_set', 'token without a result in this category stays');
    assert.equal(nftStatus(c.registration_id), 'pending', 'unminted token stays pending');
  });

  test('only service_role can execute it', async () => {
    for (const as of ['anon', 'authenticated', 'admin', null]) {
      const res = await save([{ rider_name: 'Hacker', place: 1 }], { as });
      assert.ok(DENIED.includes(res.status), `${as}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    assert.equal(sql(`select count(*) from public.event_results where rider_name = 'Hacker'`), '0');
    const grants = sqlRows(`select g.grantee from information_schema.role_routine_grants g
      join pg_proc p on p.proname = g.routine_name and p.pronamespace = 'public'::regnamespace
      where g.routine_schema = 'public' and g.routine_name = 'save_results' and g.privilege_type = 'EXECUTE'
        and g.grantee <> pg_get_userbyid(p.proowner) order by 1`);
    assert.deepEqual(grants.map(g => g.grantee), ['service_role']);
  });
});
