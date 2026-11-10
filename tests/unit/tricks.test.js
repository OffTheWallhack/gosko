import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TRICKS, TRICK_LEVELS, TRICKS_PAGE } from '../../data.js';
import { norm, dayNumber, trickOfDay, filterTricks, pickTrick, newGos, gosMiss, gosLand, gosWinner, gosLetters, gosOut } from '../../assets/tricks.js';
import { buildIndex, search } from '../../assets/search.js';

describe('data.js: TRICKS', () => {
  const levels = new Set(TRICK_LEVELS.map(l => l.id));
  test('každý trik má názov, úroveň zo zoznamu a popis', () => {
    assert.ok(TRICKS.length >= 10, 'aspoň 10 trikov');
    for (const t of TRICKS) {
      assert.ok(t.name && t.name.trim(), 'trik bez názvu');
      assert.ok(levels.has(t.level), `${t.name}: neznáma úroveň „${t.level}“ (povolené: ${[...levels].join(', ')})`);
      assert.ok(t.how && t.how.trim().length > 15, `${t.name}: chýba popis`);
    }
  });
  test('názvy sa neopakujú', () => {
    const names = TRICKS.map(t => norm(t.name));
    assert.equal(new Set(names).size, names.length);
  });
  test('každá úroveň má aspoň jeden trik (hádzanie podľa úrovne by bolo prázdne)', () => {
    for (const l of TRICK_LEVELS) assert.ok(TRICKS.some(t => t.level === l.id), `úroveň ${l.id} je prázdna`);
  });
  test('texty stránky sú vyplnené', () => {
    for (const k of ['title', 'lead', 'gosIntro', 'safety']) assert.ok(String(TRICKS_PAGE[k] || '').trim(), `TRICKS_PAGE.${k}`);
  });
});

describe('trik dňa', () => {
  test('rovnaký deň dá vždy ten istý trik, aj v rôznom čase dňa', () => {
    const a = trickOfDay(TRICKS, new Date(2026, 10, 10, 0, 5)), b = trickOfDay(TRICKS, new Date(2026, 10, 10, 23, 55));
    assert.equal(a.name, b.name);
  });
  test('prejde všetky triky, kým sa nejaký zopakuje', () => {
    const seen = new Set();
    for (let i = 0; i < TRICKS.length; i++) seen.add(trickOfDay(TRICKS, new Date(2026, 0, 1 + i)).name);
    assert.equal(seen.size, TRICKS.length);
  });
  test('susedné dni nie sú abecedne za sebou', () => {
    const a = trickOfDay(TRICKS, new Date(2026, 5, 1)), b = trickOfDay(TRICKS, new Date(2026, 5, 2));
    assert.notEqual(TRICKS.indexOf(b) - TRICKS.indexOf(a), 1);
  });
  test('prázdny zoznam: null', () => { assert.equal(trickOfDay([]), null); assert.equal(trickOfDay(undefined), null); });
  test('dayNumber rastie o 1 za deň aj cez zmenu času', () => {
    assert.equal(dayNumber(new Date(2026, 9, 26, 12)) + 1, dayNumber(new Date(2026, 9, 27, 1)));
    assert.equal(dayNumber(new Date(2026, 2, 29, 23)) + 1, dayNumber(new Date(2026, 2, 30, 0, 1)));
  });
});

describe('filter a hádzanie', () => {
  test('norm: bez diakritiky a veľkosti písmen', () => assert.equal(norm('  Ťažké Úrovne '), 'tazke urovne'));
  test('filterTricks podľa úrovne a textu', () => {
    const z = filterTricks(TRICKS, { level: 'zaklad' });
    assert.ok(z.length && z.every(t => t.level === 'zaklad'));
    assert.ok(filterTricks(TRICKS, { q: 'KICKFLIP' }).some(t => t.name === 'Kickflip'));
    assert.deepEqual(filterTricks(TRICKS, { q: 'nezmysel-xyz' }), []);
    assert.equal(filterTricks(TRICKS, {}).length, TRICKS.length);
  });
  test('pickTrick: z danej úrovne, nezopakuje práve vytiahnutý', () => {
    const pool = TRICKS.filter(t => t.level === 'tazke');
    let cur = null;
    for (let i = 0; i < 60; i++) { const n = pickTrick(TRICKS, { level: 'tazke', exclude: cur, rnd: () => (i % 7) / 7 }); assert.equal(n.level, 'tazke'); if (cur) assert.notEqual(n.name, cur.name); cur = n; }
    assert.ok(pool.length > 1);
  });
  test('pickTrick: hraničné náhodné čísla a prázdny výber', () => {
    assert.ok(pickTrick(TRICKS, { rnd: () => 0.999999 }));
    assert.equal(pickTrick(TRICKS, { level: 'neexistuje' }), null);
    const one = [{ name: 'A', level: 'zaklad', how: 'x' }];
    assert.equal(pickTrick(one, { exclude: one[0] }).name, 'A');
  });
});

describe('Game of S.K.A.T.E.: počítadlo', () => {
  test('mená sa očistia, prázdne zahodia, najviac 6 hráčov', () => {
    assert.deepEqual(newGos([' Ty ', '', 'Kamoš']).players.map(p => p.name), ['Ty', 'Kamoš']);
    assert.equal(newGos('a b c d e f g h'.split(' ')).players.length, 6);
  });
  test('nedal: dostane písmeno a ťah ide ďalej; dal: len ťah', () => {
    let g = newGos(['A', 'B']);
    g = gosMiss(g); assert.equal(g.players[0].letters, 1); assert.equal(g.turn, 1);
    g = gosLand(g); assert.equal(g.turn, 0); assert.equal(g.players[1].letters, 0);
  });
  test('päť písmen = prehra, víťaz je ten druhý, potom sa už nič nemení', () => {
    let g = newGos(['A', 'B']);
    for (let i = 0; i < 5; i++) { g = gosMiss(g); g = gosLand(g); }   // A nedá, B dá
    assert.equal(gosLetters(g.players[0]), 'SKATE'); assert.ok(gosOut(g.players[0]));
    assert.equal(gosWinner(g), 1);
    const after = gosMiss(g); assert.equal(after, g);
  });
  test('traja hráči: vyradený sa preskakuje, hrá sa do posledného', () => {
    let g = newGos(['A', 'B', 'C']);
    g = { ...g, players: g.players.map((p, i) => i === 1 ? { ...p, letters: 4 } : p), turn: 1 };
    g = gosMiss(g);
    assert.ok(gosOut(g.players[1])); assert.equal(g.turn, 2); assert.equal(gosWinner(g), null);
    g = gosLand(g); assert.equal(g.turn, 0);
    g = gosLand(g); assert.equal(g.turn, 2, 'B je vyradený a ťah ho preskočí');
    g = { ...g, players: g.players.map((p, i) => i === 0 ? { ...p, letters: 5 } : p) };
    assert.equal(gosWinner(g), 2);
  });
  test('jeden hráč nemá víťaza', () => assert.equal(gosWinner(newGos(['Sám'])), null));
});

describe('vyhľadávanie', () => {
  const idx = buildIndex([
    { kind: 'event', title: 'GOSko 3', sub: 'Bratislava · 5. decembra 2026', href: '#/event/bratislava-2', keys: 'HANGAIR' },
    { kind: 'rider', title: 'Šebastián Kozmann', href: '#/jazdec/sebastian-kozmann' },
    { kind: 'trick', title: 'Kickflip', sub: 'Ollie s prekopnutím', href: '#/triky' },
    { kind: 'trick', title: 'Fakie kickflip', href: '#/triky' },
    { kind: 'park', title: 'Skatepark Rača', sub: 'Bratislava', href: '#/mapa' },
    { kind: 'trick', title: 'Kickflip', sub: 'duplikát', href: '#/triky' },
    { kind: 'page', title: '', href: '#/prazdne' },
  ]);
  test('duplikáty a prázdne položky sa zahodia', () => assert.equal(idx.length, 5));
  test('hľadá bez diakritiky aj veľkosti písmen', () => {
    assert.equal(search(idx, 'sebastian')[0].title, 'Šebastián Kozmann');
    assert.equal(search(idx, 'RACA')[0].title, 'Skatepark Rača');
  });
  test('hľadá aj v doplnkových slovách (keys) a v podtitule', () => {
    assert.equal(search(idx, 'hangair')[0].title, 'GOSko 3');
    assert.equal(search(idx, 'decembra')[0].title, 'GOSko 3');
  });
  test('všetky slová musia sedieť, presný začiatok názvu je vyššie', () => {
    const r = search(idx, 'kickflip');
    assert.equal(r[0].title, 'Kickflip'); assert.equal(r[1].title, 'Fakie kickflip');
    assert.deepEqual(search(idx, 'kickflip raca'), []);
  });
  test('prázdny dotaz nevráti nič, limit funguje', () => {
    assert.deepEqual(search(idx, '   '), []);
    assert.equal(search(idx, 'a', 2).length, 2);
  });
});
