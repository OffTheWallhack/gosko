import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeBracket, setWinner, clearWinner, toggleCurrent, isComplete, progress, placements, nextMatch, roundName, cleanNames, MAX_RIDERS } from '../../assets/bracket.js';
import { pointsFor } from '../../assets/ranking.js';
import { POINTS } from '../../data.js';

const names = n => Array.from({ length: n }, (_, i) => `Jazdec ${i + 1}`);
/* Dohrá celý pavúk: vždy vyhrá jazdec s nižším číslom (lepšie nasadený). */
function playAll(b) {
  for (let r = 0; r < b.rounds.length; r++)
    b.rounds[r].forEach((mt, m) => { if (!mt.bye && mt.a && mt.b) setWinner(b, r, m, Number(mt.a.split(' ')[1]) < Number(mt.b.split(' ')[1]) ? mt.a : mt.b); });
  return b;
}

describe('roundName', () => {
  test('názvy kôl', () => {
    assert.deepEqual([1, 2, 4, 8, 16, 32, 3].map(roundName), ['Finále', 'Semifinále', 'Štvrťfinále', '1/8 finále', '1/16 finále', '1/32 finále', 'Kolo']);
  });
});

describe('cleanNames', () => {
  test('zjednotí medzery a vynechá prázdne', () => assert.deepEqual(cleanNames(['  Ján   Horvath ', '', '  ', 'Eva']), ['Ján Horvath', 'Eva']));
  test('duplicita bez ohľadu na veľkosť písmen hodí chybu', () => assert.throws(() => cleanNames(['Eva', 'EVA']), /opakuje: EVA/));
});

describe('makeBracket', () => {
  test('nasadenie podľa poradia: 1. proti poslednému', () => {
    const b = makeBracket(names(4), { shuffle: false });
    assert.equal(b.size, 4);
    assert.deepEqual(b.rounds[0].map(m => [m.a, m.b]), [['Jazdec 1', 'Jazdec 4'], ['Jazdec 2', 'Jazdec 3']]);
    assert.equal(b.rounds.length, 2);
    assert.deepEqual(b.rounds[1], [{ a: null, b: null, w: null }]);
    assert.equal(b.current, null);
  });
  test('5 jazdcov: pavúk na 8 s tromi voľnými postupmi', () => {
    const b = makeBracket(names(5), { shuffle: false });
    assert.equal(b.size, 8);
    const byes = b.rounds[0].filter(m => m.bye);
    assert.equal(byes.length, 3);
    assert.ok(byes.every(m => m.w), 'voľný postup má rovno víťaza');
    assert.deepEqual(b.rounds[1].flatMap(m => [m.a, m.b]).filter(Boolean).sort(), ['Jazdec 1', 'Jazdec 2', 'Jazdec 3']);
    assert.deepEqual(progress(b), { done: 0, total: 4 });
  });
  test('losovanie používa rng a nikoho nestratí', () => {
    let s = 1; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const b = makeBracket(names(6), { rng });
    assert.deepEqual([...b.riders].sort(), names(6).sort());
    assert.notDeepEqual(b.riders, names(6));
  });
  test('chyby', () => {
    assert.throws(() => makeBracket(['Sám']), /aspoň 2/);
    assert.throws(() => makeBracket(names(MAX_RIDERS + 1)), /najviac 64/);
    assert.throws(() => makeBracket(['A', 'a']), /opakuje/);
  });
});

describe('setWinner a clearWinner', () => {
  test('víťaz postúpi do ďalšieho kola', () => {
    const b = makeBracket(names(4), { shuffle: false });
    setWinner(b, 0, 0, 'Jazdec 4');
    assert.equal(b.rounds[1][0].a, 'Jazdec 4');
    setWinner(b, 0, 1, 'Jazdec 2');
    assert.equal(b.rounds[1][0].b, 'Jazdec 2');
    assert.deepEqual(nextMatch(b), { r: 1, m: 0, match: b.rounds[1][0] });
  });
  test('zmena víťaza vymaže jeho postup ďalej', () => {
    const b = makeBracket(names(4), { shuffle: false });
    setWinner(b, 0, 0, 'Jazdec 1'); setWinner(b, 0, 1, 'Jazdec 2'); setWinner(b, 1, 0, 'Jazdec 1');
    assert.ok(isComplete(b));
    setWinner(b, 0, 0, 'Jazdec 4');
    assert.equal(b.rounds[1][0].a, 'Jazdec 4');
    assert.equal(b.rounds[1][0].w, null, 'finále sa musí odohrať znova');
    assert.ok(!isComplete(b));
  });
  test('clearWinner vráti súboj do stavu pred zápisom', () => {
    const b = makeBracket(names(4), { shuffle: false });
    setWinner(b, 0, 0, 'Jazdec 1');
    clearWinner(b, 0, 0);
    assert.equal(b.rounds[0][0].w, null);
    assert.equal(b.rounds[1][0].a, null);
  });
  test('chyby zápisu', () => {
    const b = makeBracket(names(3), { shuffle: false });
    const bye = b.rounds[0].findIndex(m => m.bye);
    assert.throws(() => setWinner(b, 0, bye, b.rounds[0][bye].w), /voľný postup/);
    assert.throws(() => setWinner(b, 1, 0, 'Jazdec 1'), /oboch jazdcov/);
    const real = b.rounds[0].findIndex(m => !m.bye);
    assert.throws(() => setWinner(b, 0, real, 'Niekto iný'), /nie je/);
  });
});

describe('toggleCurrent', () => {
  test('označí a odznačí súboj, víťaz zruší označenie', () => {
    const b = makeBracket(names(4), { shuffle: false });
    toggleCurrent(b, 0, 1);
    assert.deepEqual(b.current, { r: 0, m: 1 });
    assert.deepEqual(nextMatch(b, { skipCurrent: true }), { r: 0, m: 0, match: b.rounds[0][0] });
    toggleCurrent(b, 0, 1);
    assert.equal(b.current, null);
    toggleCurrent(b, 0, 1);
    setWinner(b, 0, 1, 'Jazdec 2');
    assert.equal(b.current, null);
    assert.throws(() => toggleCurrent(b, 0, 1), /nedá označiť/);
  });
});

describe('placements', () => {
  test('pavúk dá porazenému v kole s M zápasmi miesto M+1', () => {
    const b = playAll(makeBracket(names(16), { shuffle: false }));
    assert.ok(isComplete(b));
    const pl = placements(b);
    assert.equal(pl.length, 16);
    const at = n => pl.find(x => x.name === `Jazdec ${n}`).place;
    assert.equal(at(1), 1);
    assert.equal(at(2), 2, 'finále (1 zápas) → 2. miesto');
    assert.deepEqual([at(3), at(4)], [3, 3], 'semifinále (2 zápasy) → 3. miesto');
    for (const n of [5, 6, 7, 8]) assert.equal(at(n), 5, 'štvrťfinále (4 zápasy) → 5. miesto');
    for (let n = 9; n <= 16; n++) assert.equal(at(n), 9, '1/8 finále (8 zápasov) → 9. miesto');
    assert.deepEqual(pl.map(x => x.place), [...pl.map(x => x.place)].sort((a, b) => a - b), 'zoradené podľa miesta');
  });
  test('umiestnenia sedia na pásma bodovania', () => {
    const pl = placements(playAll(makeBracket(names(16), { shuffle: false })));
    const pts = pl.map(x => pointsFor(x.place, POINTS));
    assert.deepEqual([...new Set(pts)], [100, 80, 60, 40, 20]);
  });
  test('voľný postup nedá miesto, kým jazdec neprehrá', () => {
    const b = playAll(makeBracket(names(5), { shuffle: false }));
    const pl = placements(b);
    assert.equal(pl.length, 5);
    assert.equal(pl.find(x => x.name === 'Jazdec 5').place, 5, 'prehral v 1. kole (4 zápasy) → 5. miesto');
  });
  test('rozohraný pavúk dá len porazených', () => {
    const b = makeBracket(names(4), { shuffle: false });
    setWinner(b, 0, 0, 'Jazdec 1');
    assert.deepEqual(placements(b), [{ name: 'Jazdec 4', place: 3 }]);
    assert.deepEqual(progress(b), { done: 1, total: 3 });
  });
});
