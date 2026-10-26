// Crews a Turf Wars (Task 5): formulár crew, pozvánka kódom alebo odkazom, skóre spotu, hlášky.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../assets/game/logic.js';

describe('nová crew (validateCrew)', () => {
  test('názov 2 až 30, TAG 2 až 4 veľké písmená alebo číslice, farba z palety', () => {
    const ok = G.validateCrew({ name: '  Ružinov   Rats ', tag: 'rr', color: G.CREW_COLORS[0] });
    assert.deepEqual(ok.errors, {});
    assert.deepEqual(ok.value, { p_name: 'Ružinov Rats', p_tag: 'RR', p_color: G.CREW_COLORS[0] });
    const bad = G.validateCrew({ name: 'R', tag: 'TOOLONG', color: 'red' });
    assert.deepEqual(Object.keys(bad.errors).sort(), ['color', 'name', 'tag']);
    assert.ok(G.validateCrew({ name: 'x'.repeat(31), tag: 'AB', color: G.CREW_COLORS[1] }).errors.name);
    assert.ok(G.validateCrew({ name: 'Crew', tag: 'Á1', color: G.CREW_COLORS[1] }).errors.tag);
    for (const c of G.CREW_COLORS) assert.match(c, /^#[0-9a-f]{6}$/i);
  });
});

describe('pozvánka', () => {
  test('odkaz na pridanie sa do crew', () => {
    assert.equal(G.crewInviteHash('ABCD2345'), '#/hra/crew/pridat/ABCD2345');
  });
  test('kód sa dá vložiť aj ako celý odkaz, malými písmenami alebo s medzerami', () => {
    assert.equal(G.parseInviteCode('abcd2345'), 'ABCD2345');
    assert.equal(G.parseInviteCode(' ABCD 2345 '), 'ABCD2345');
    assert.equal(G.parseInviteCode('https://gosko-master.vercel.app/hra/crew/pridat/ABCD2345'), 'ABCD2345');
    assert.equal(G.parseInviteCode('https://x.sk/#/hra/crew/pridat/abcd2345?x=1'), 'ABCD2345');
    for (const bad of ['', 'ABC', 'ABCD23456', 'ABCD-234', null]) assert.equal(G.parseInviteCode(bad), '', String(bad));
  });
});

describe('Turf Wars na spote', () => {
  test('kto vedie a s akým skóre (RR vedie 145 : 90)', () => {
    const rows = [{ tag: 'GG', points: 90 }, { tag: 'RR', points: 145 }, { tag: 'ZZ', points: 10 }];
    assert.equal(G.turfLine(rows), 'RR vedie 145 : 90 nad GG');
    assert.equal(G.turfLine([{ tag: 'RR', points: 40 }]), 'RR má 40 b, na ovládnutie treba 100');
    assert.equal(G.turfLine([{ tag: 'RR', points: 120 }, { tag: 'GG', points: 120 }]), 'Remíza RR a GG 120 : 120');
    assert.equal(G.turfLine([]), '');
  });
  test('zoradenie crews na spote podľa bodov, najviac 5', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ tag: `C${i}`, points: i * 10 }));
    assert.deepEqual(G.topTurf(rows).map(r => r.tag), ['C6', 'C5', 'C4', 'C3', 'C2']);
  });
});

describe('hlášky crew', () => {
  test('CREW_FULL a ALREADY_IN_CREW majú vlastný text', () => {
    assert.match(G.errorMessage({ message: 'CREW_FULL' }), /plná/);
    assert.match(G.errorMessage({ message: 'ALREADY_IN_CREW' }), /Už si v crew/);
    assert.match(G.errorMessage({ message: 'BAD_CODE' }), /Kód/);
  });
});
