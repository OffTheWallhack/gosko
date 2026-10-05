import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POINTS, EVENTS, SEASON_RULES, SITE } from '../../data.js';
import * as R from '../../assets/ranking.js';

const cfg = (rules = {}) => ({ points: POINTS, rules: { finale: null, countBest: null, ...rules }, season: 2026 });
/* eventy z data.js tak, ako ich zloží app.js (applyData) bez databázy */
const realEvents = () => EVENTS.map(e => ({ ...e, ...R.mergeEvent(e.id, e, {}, {}) }));
let n = 0;
const ev = (o = {}) => ({ id: o.id || `ev-${++n}`, city: o.city || 'Mesto', season: 2026, status: 'done', date: '', sticker: 'band', stickerDate: '', results: {}, awards: [], ...o });
const res = (...names) => names.map((name, i) => ({ name, place: i + 1 }));

describe('pointsFor', () => {
  test('tabuľka bodov z data.js', () => {
    const cases = [[1, 100], [2, 80], [3, 60], [4, 60], [5, 40], [8, 40], [9, 20], [16, 20], [17, 5], [99, 5]];
    for (const [place, pts] of cases) assert.equal(R.pointsFor(place, POINTS), pts, `miesto ${place}`);
  });
  test('1. miesto = 100 b, účasť = 5 b', () => {
    assert.equal(R.pointsFor(1, POINTS), 100);
    assert.equal(R.pointsFor(40, POINTS), 5);
  });
});

describe('bestPoints', () => {
  test('bez countBest sčíta všetko', () => assert.equal(R.bestPoints([60, 100, 80], null), 240));
  test('countBest: 2 ráta len dva najlepšie výsledky', () => assert.equal(R.bestPoints([60, 100, 5, 80], 2), 180));
  test('prázdny zoznam = 0', () => assert.equal(R.bestPoints([], 2), 0));
  test('nemení vstup', () => { const a = [5, 100]; R.bestPoints(a, 1); assert.deepEqual(a, [5, 100]); });
});

describe('slug', () => {
  test('latinské mená ostávajú ako doteraz', () => {
    assert.equal(R.slug('Lukáš Ďuraj'), 'lukas-duraj');
    assert.equal(R.slug('  Ján   Horvath '), 'jan-horvath');
    assert.equal(R.slug('Tomáš Čekovský'), 'tomas-cekovsky');
    assert.equal(R.slug('GOSko Bratislava 2026!'), 'gosko-bratislava-2026');
    assert.equal(R.slug(''), '');
  });
  test('nelatinské meno dostane neprázdny stabilný slug', () => {
    const a = R.slug('Дмитро Іванов');
    assert.ok(a.length > 0, 'slug nesmie byť prázdny');
    assert.equal(R.slug('Дмитро Іванов'), a, 'stabilný');
    assert.equal(R.slug(' дмитро  іванов '), a, 'nezáleží na medzerách ani veľkosti');
    assert.match(a, /^[\w-]+$/, 'sedí na routu #/jazdec/:slug');
    assert.notEqual(R.slug('Олена Коваль'), a, 'iné meno, iný slug');
    assert.ok(R.slug('李小龙').length > 0);
    assert.ok(R.slug('!!!').length > 0);
  });
  test('zmiešané meno sa nezlúči s čisto latinským', () => {
    assert.notEqual(R.slug('Ján 李'), R.slug('Ján'));
    assert.notEqual(R.slug('Ján 李'), R.slug('Ján 王'));
  });
  test('písmená bez rozkladu diakritiky sa prepíšu', () => {
    assert.equal(R.slug('Michał Wójcik'), 'michal-wojcik');
    assert.equal(R.slug('Søren Weiß'), 'soren-weiss');
  });
});

describe('riderKey', () => {
  test('rider_id má prednosť pred menom', () => {
    assert.equal(R.riderKey({ name: 'Marek K.', rider_id: 'a1b2' }), 'a1b2');
    assert.equal(R.riderKey({ name: 'Marek Kupkovič', rider_id: null }), 'marek-kupkovic');
    assert.equal(R.riderKey({ name: 'Marek Kupkovič' }), 'marek-kupkovic');
  });
});

describe('displayName', () => {
  const privacy = { 'marek-kupkovic': 'initial', madonna: 'initial' };
  test('bez žiadosti ostáva celé meno', () => assert.equal(R.displayName('Andrej Jaško', privacy), 'Andrej Jaško'));
  test('so žiadosťou meno a iniciála', () => assert.equal(R.displayName('Marek Kupkovič', privacy), 'Marek K.'));
  test('jedno slovo ostáva', () => assert.equal(R.displayName('Madonna', privacy), 'Madonna'));
  test('bez privacy mapy', () => assert.equal(R.displayName('Marek Kupkovič'), 'Marek Kupkovič'));
});

describe('allResults', () => {
  test('sploští výsledky všetkých eventov a kategórií', () => {
    const a = ev({ results: { open: res('A', 'B'), u16: res('C') } });
    const rows = R.allResults([a]);
    assert.deepEqual(rows.map(r => [r.cat, r.name, r.place, r.slug]), [['open', 'A', 1, 'a'], ['open', 'B', 2, 'b'], ['u16', 'C', 1, 'c']]);
    assert.equal(rows[0].ev, a);
  });
});

describe('standings', () => {
  test('reálne dáta: Bratislava Open', () => {
    const st = R.standings(realEvents(), 'open', null, 2026, { points: POINTS, rules: SEASON_RULES, season: SITE.season });
    assert.deepEqual(st.map(r => [r.name, r.points]), [['Sebastian Kozmann', 100], ['Tomáš Čekovský', 80], ['Lukáš Ďuraj', 60]]);
    assert.equal(st[0].slug, 'sebastian-kozmann');
  });
  test('sezóna sčíta body zo všetkých eventov sezóny v kategórii', () => {
    const evs = [ev({ results: { open: res('A', 'B', 'C') } }), ev({ results: { open: res('B', 'A') } }), ev({ season: 2025, results: { open: res('C') } })];
    const st = R.standings(evs, 'open', null, 2026, cfg());
    assert.deepEqual(st.map(r => [r.name, r.points, r.events, r.wins, r.best]), [['A', 180, 2, 1, 1], ['B', 180, 2, 1, 1], ['C', 60, 1, 0, 3]]);
  });
  test('pri rovnosti bodov rozhodujú výhry, potom najlepšie miesto, potom abeceda', () => {
    // X: 2. + 2. = 160 b, 0 výhier; Y: 1. + 17. = 105, Z: ... nastavíme rovnosť 160
    const evs = [
      ev({ results: { open: [{ name: 'Xena', place: 2 }, { name: 'Yuri', place: 3 }, { name: 'Zoe', place: 1 }] } }),
      ev({ results: { open: [{ name: 'Xena', place: 2 }, { name: 'Yuri', place: 1 }, { name: 'Zoe', place: 17 }, { name: 'Adam', place: 3 }] } }),
    ];
    // Xena 160 (0 výhier), Yuri 160 (1 výhra), Zoe 105, Adam 60
    const st = R.standings(evs, 'open', null, 2026, cfg());
    assert.deepEqual(st.map(r => r.name), ['Yuri', 'Xena', 'Zoe', 'Adam']);
    const tie = [ev({ results: { open: [{ name: 'Bea', place: 3 }, { name: 'Ali', place: 3 }] } })];
    assert.deepEqual(R.standings(tie, 'open', null, 2026, cfg()).map(r => r.name), ['Ali', 'Bea'], 'abeceda');
    const best = [ev({ results: { open: [{ name: 'Ola', place: 2 }, { name: 'Ivo', place: 5 }] } }), ev({ results: { open: [{ name: 'Ola', place: 9 }, { name: 'Ivo', place: 3 }] } })];
    // Ola 80+20 = 100, Ivo 40+60 = 100, 0 výhier obaja, najlepšie miesto Ola 2 < Ivo 3
    assert.deepEqual(R.standings(best, 'open', null, 2026, cfg()).map(r => [r.name, r.points]), [['Ola', 100], ['Ivo', 100]]);
  });
  test('countBest: 2 ráta len dva najlepšie výsledky jazdca', () => {
    const evs = [ev({ results: { open: res('A') } }), ev({ results: { open: res('B', 'A') } }), ev({ results: { open: res('B', 'C', 'A') } })];
    const st = R.standings(evs, 'open', null, 2026, cfg({ countBest: 2 }));
    assert.deepEqual(st.map(r => [r.name, r.points]), [['B', 200], ['A', 180], ['C', 80]]);
  });
  test('rebríček jedného eventu', () => {
    const a = ev({ id: 'x1', results: { open: res('A', 'B') } }), b = ev({ id: 'x2', results: { open: res('B', 'A') } });
    const st = R.standings([a, b], 'open', 'x2', 2026, cfg());
    assert.deepEqual(st.map(r => [r.name, r.points, r.best]), [['B', 100, 1], ['A', 80, 2]]);
  });
  test('iná kategória sa nezapočíta', () => {
    const evs = [ev({ results: { open: res('A'), u16: res('B') } })];
    assert.deepEqual(R.standings(evs, 'u16', null, 2026, cfg()).map(r => r.name), ['B']);
  });
  test('dvaja rovnako menovaní jazdci s rôznym rider_id sú dva riadky', () => {
    const evs = [ev({ results: { open: [{ name: 'Marek K.', place: 1, rider_id: 'r1' }, { name: 'Marek K.', place: 2, rider_id: 'r2' }] } })];
    const st = R.standings(evs, 'open', null, 2026, cfg());
    assert.equal(st.length, 2);
    assert.deepEqual(st.map(r => [r.slug, r.points]), [['r1', 100], ['r2', 80]]);
  });
  test('ten istý rider_id pod iným menom je jeden jazdec', () => {
    const evs = [ev({ results: { open: [{ name: 'Marek Kupkovič', place: 1, rider_id: 'r1' }] } }), ev({ results: { open: [{ name: 'Marek K.', place: 2, rider_id: 'r1' }] } })];
    const st = R.standings(evs, 'open', null, 2026, cfg());
    assert.deepEqual(st.map(r => [r.slug, r.points, r.events]), [['r1', 180, 2]]);
  });
});

describe('riders', () => {
  test('reálne dáta: každý jazdec a ocenenie', () => {
    const list = R.riders(realEvents(), { points: POINTS, rules: SEASON_RULES, season: SITE.season });
    const horvath = list.find(r => r.slug === 'jan-horvath');
    assert.ok(horvath, 'jazdec len s Best Trick je v zozname');
    assert.equal(horvath.points, 0);
    assert.deepEqual(horvath.cats, []);
    assert.equal(horvath.awards[0].name, 'Best Trick');
    assert.equal(list[0].points, 100);
    assert.deepEqual(list.filter(r => r.points === 100).map(r => r.name).sort(), ['Júlia Dubovská', 'Marek Kupkovič', 'Sebastian Kozmann'].sort());
  });
  test('zoznam eventov jazdca je bez duplicít (výsledok aj ocenenie z toho istého eventu)', () => {
    const a = ev({ results: { open: res('A') }, awards: [{ name: 'Best Trick', rider: 'A' }] });
    const [r] = R.riders([a], cfg());
    assert.deepEqual(r.events, [a]);
    assert.equal(r.awards.length, 1);
  });
  test('súčet bodov na profile = súčet v kategórii (jedna kategória)', () => {
    const evs = [ev({ results: { open: res('A', 'B') } }), ev({ results: { open: res('B', 'C', 'A') } }), ev({ results: { open: res('A') } })];
    for (const countBest of [null, 2]) {
      const c = cfg({ countBest }), st = R.standings(evs, 'open', null, 2026, c);
      for (const r of R.riders(evs, c)) assert.equal(r.points, st.find(s => s.slug === r.slug).points, `${r.name}, countBest ${countBest}`);
    }
  });
  test('body z rôznych kategórií sa nesčítavajú', () => {
    // Ema jazdí Open aj babskú kategóriu; s countBest 2 by spoločný súčet bral najlepšie dva naprieč kategóriami.
    const evs = [ev({ results: { open: res('Ema', 'Bo'), women: res('Ema') } }), ev({ results: { open: res('Bo', 'Ema'), women: res('Ema') } })];
    const c = cfg({ countBest: 2 });
    const ema = R.riders(evs, c).find(r => r.name === 'Ema');
    assert.deepEqual(ema.pointsByCat, { open: 180, women: 200 });
    assert.equal(ema.points, 200, 'hlavné číslo = kategória s najviac bodmi');
    assert.equal(ema.points, R.standings(evs, 'women', null, 2026, c).find(s => s.name === 'Ema').points);
    assert.equal(ema.pointsByCat.open, R.standings(evs, 'open', null, 2026, c).find(s => s.name === 'Ema').points);
    assert.deepEqual(ema.cats.sort(), ['open', 'women']);
  });
  test('body sú len zo sezóny cfg.season', () => {
    const evs = [ev({ season: 2025, results: { open: res('A') } }), ev({ results: { open: res('B', 'A') } })];
    const a = R.riders(evs, cfg()).find(r => r.name === 'A');
    assert.equal(a.points, 80);
    assert.equal(a.results.length, 2);
  });
  test('rider_id: dvaja rovnako menovaní jazdci ostanú oddelene', () => {
    const evs = [ev({ results: { u16: [{ name: 'Marek K.', place: 1, rider_id: 'r1' }, { name: 'Marek K.', place: 2, rider_id: 'r2' }] }, awards: [{ name: 'Best Trick', rider: 'Marek K.', rider_id: 'r2' }] })];
    const list = R.riders(evs, cfg());
    assert.equal(list.length, 2);
    assert.deepEqual(list.map(r => [r.slug, r.points, r.awards.length]), [['r1', 100, 0], ['r2', 80, 1]]);
  });
  test('zoradenie: body, potom abeceda', () => {
    const evs = [ev({ results: { open: [{ name: 'Zed', place: 3 }, { name: 'Abe', place: 3 }, { name: 'Max', place: 1 }] } })];
    assert.deepEqual(R.riders(evs, cfg()).map(r => r.name), ['Max', 'Abe', 'Zed']);
  });
});

describe('nálepky', () => {
  test('eventSticker', () => {
    assert.deepEqual(R.eventSticker({ id: 'ba', sticker: 'band', city: 'Bratislava', stickerDate: '31.05.2026' }),
      { kind: 'band', title: 'Bratislava', sub: '31.05.2026', link: '#/event/ba' });
  });
  test('riderStickers: eventy od najnovšieho, medaila za top 3, trik za ocenenie', () => {
    const old = ev({ id: 'old', city: 'Žilina', date: '2026-03-01', results: { open: res('A') } });
    const neu = ev({ id: 'new', city: 'Brno', date: '2026-06-01', results: { open: res('B', 'C', 'D', 'A') }, awards: [{ name: 'Best Trick', rider: 'A' }] });
    const a = R.riders([old, neu], cfg()).find(r => r.name === 'A');
    const st = R.riderStickers(a, { catName: id => id.toUpperCase() });
    assert.deepEqual(st.map(s => [s.kind, s.title, s.link]), [
      ['band', 'Brno', '#/event/new'], ['trick', 'Brno', '#/event/new'],
      ['band', 'Žilina', '#/event/old'], ['medal', 'OPEN Žilina', '#/event/old']]);
    assert.equal(st[3].place, 1);
  });
  test('najviac MAX_STICKERS nálepiek', () => {
    const evs = Array.from({ length: 6 }, (_, i) => ev({ date: `2026-0${i + 1}-01`, results: { open: res('A') } }));
    const a = R.riders(evs, cfg())[0];
    assert.equal(R.riderStickers(a).length, R.MAX_STICKERS);
    assert.equal(R.riderStickers(a, { max: 3 }).length, 3);
  });
  test('MAX_STICKERS sedí s počtom miest na doske v board.js', () => {
    const src = readFileSync(new URL('../../assets/board.js', import.meta.url), 'utf8');
    const slots = src.match(/const SLOTS = \[([\s\S]*?)\];/)[1].match(/\{\s*x:/g).length;
    assert.equal(R.MAX_STICKERS, slots);
  });
});

describe('finaleTable', () => {
  const evs = () => [
    ev({ results: { open: res('A', 'B', 'C', 'D') } }),
    ev({ status: 'next', results: {} }),
  ];
  test('bez finále v pravidlách nič', () => assert.equal(R.finaleTable(evs(), 'open', 2026, cfg()), null));
  test('iná sezóna nič', () => assert.equal(R.finaleTable(evs(), 'open', 2025, cfg({ finale: { slots: 2 } })), null));
  test('stavy postupu', () => {
    const ft = R.finaleTable(evs(), 'open', 2026, cfg({ finale: { slots: 2 } }));
    assert.equal(ft.left, 1, 'počet zostávajúcich eventov sa spočíta z „next“');
    // gain 100, cut = 80 (B). A 100: súperov s o.points+100 >= 100 je 3 (B, C, D) → nie secure, ale i < 2 → in
    assert.deepEqual(ft.rows.map(r => [r.name, r.rank, r.state, r.gap]), [['A', 1, 'in', 0], ['B', 2, 'in', 0], ['C', 3, 'alive', 20], ['D', 4, 'alive', 20]]);
  });
  test('eventsLeft 0: kvalifikácia uzavretá', () => {
    const ft = R.finaleTable(evs(), 'open', 2026, cfg({ finale: { slots: 2, eventsLeft: 0 } }));
    assert.deepEqual(ft.rows.map(r => r.state), ['secure', 'secure', 'out', 'out']);
  });
});

describe('mergeEvent', () => {
  const base = { status: 'done', sticker: 'band', results: { open: ['Ann', 'Bob'], u16: ['Cid'] }, awards: [{ name: 'Best Trick', rider: 'Marek Kupkovič' }] };
  test('mená z data.js dostanú miesto podľa poradia', () => {
    const m = R.mergeEvent('e', base);
    assert.deepEqual(m.results.open, [{ name: 'Ann', place: 1 }, { name: 'Bob', place: 2 }]);
    assert.deepEqual(m.brackets, {});
    assert.equal(m.status, 'done');
  });
  test('databáza nahradí kategóriu z data.js, ostatné kategórie ostanú', () => {
    const remote = { results: [
      { event_id: 'e', category: 'open', rider_name: 'Zed', place: 2 }, { event_id: 'e', category: 'open', rider_name: 'Abe', place: 2 },
      { event_id: 'e', category: 'open', rider_name: 'Max', place: 1, rider_id: 'r9' }, { event_id: 'iny', category: 'u16', rider_name: 'X', place: 1 }] };
    const m = R.mergeEvent('e', base, remote);
    assert.deepEqual(m.results.open, [{ name: 'Max', place: 1, rider_id: 'r9' }, { name: 'Abe', place: 2 }, { name: 'Zed', place: 2 }]);
    assert.deepEqual(m.results.u16, [{ name: 'Cid', place: 1 }]);
  });
  test('súkromie skráti meno vo výsledkoch aj v oceneniach, rawAwards ostanú celé', () => {
    const m = R.mergeEvent('e', { ...base, results: { u16: ['Marek Kupkovič'] } }, {}, { 'marek-kupkovic': 'initial' });
    assert.equal(m.results.u16[0].name, 'Marek K.');
    assert.equal(m.awards[0].rider, 'Marek K.');
    assert.equal(m.rawAwards[0].rider, 'Marek Kupkovič');
  });
  test('ocenenia z databázy majú prednosť', () => {
    const m = R.mergeEvent('e', base, { awards: [{ event_id: 'e', name: 'Best Trick', rider_name: 'Ann' }] });
    assert.deepEqual(m.rawAwards, [{ name: 'Best Trick', rider: 'Ann' }]);
  });
  test('ďalší stop s výsledkami sa prepne na odjazdený a dostane pásovú nálepku', () => {
    const next = { status: 'next', sticker: 'next', results: {}, awards: [] };
    assert.deepEqual([R.mergeEvent('n', next).status, R.mergeEvent('n', next).sticker], ['next', 'next']);
    const m = R.mergeEvent('n', next, { results: [{ event_id: 'n', category: 'open', rider_name: 'A', place: 1 }], brackets: [{ event_id: 'n', category: 'open', data: { v: 1 } }] });
    assert.deepEqual([m.status, m.sticker], ['done', 'band']);
    assert.deepEqual(m.brackets, { open: { v: 1 } });
  });
  test('nemení vstupné dáta', () => {
    const copy = JSON.parse(JSON.stringify(base));
    R.mergeEvent('e', base, { results: [{ event_id: 'e', category: 'open', rider_name: 'Q', place: 1 }] }, { ann: 'initial' });
    assert.deepEqual(base, copy);
  });
});

/* ---------- GOSko Ranking v2: sezóna, všetky časy, krajiny, databázové eventy, NFT ---------- */
describe('GOSko Ranking v2', () => {
  test('rebríček sezóny ráta len eventy tej sezóny', () => {
    const evs = [ev({ season: 2025, results: { open: res('A', 'B') } }), ev({ season: 2026, results: { open: res('B') } })];
    assert.deepEqual(R.standings(evs, 'open', null, 2026, cfg()).map(r => [r.name, r.points]), [['B', 100]]);
    assert.deepEqual(R.standings(evs, 'open', null, 2025, cfg()).map(r => [r.name, r.points]), [['A', 100], ['B', 80]]);
  });
  test('rebríček všetkých čias (season = null) sčíta všetky sezóny', () => {
    const evs = [ev({ season: 2025, results: { open: res('A', 'B') } }), ev({ season: 2026, results: { open: res('B', 'A') } })];
    const st = R.standings(evs, 'open', null, null, cfg());
    assert.deepEqual(st.map(r => [r.name, r.points, r.events]), [['A', 180, 2], ['B', 180, 2]]);
  });
  test('všetky časy: countBest platí v každej sezóne zvlášť, sezóny sa potom sčítajú', () => {
    const evs = [
      ev({ season: 2025, results: { open: res('A') } }), ev({ season: 2025, results: { open: res('A') } }), ev({ season: 2025, results: { open: res('A') } }),
      ev({ season: 2026, results: { open: res('A') } }),
    ];
    assert.equal(R.standings(evs, 'open', null, null, cfg({ countBest: 2 }))[0].points, 300);
  });
  test('dvaja rovnako menovaní jazdci (rôzne rider_id) sú dva riadky aj v rebríčku všetkých čias', () => {
    const evs = [ev({ results: { open: [{ name: 'Jan Novak', place: 1, rider_id: 'r1' }, { name: 'Jan Novak', place: 2, rider_id: 'r2' }] } })];
    assert.equal(R.standings(evs, 'open', null, null, cfg()).length, 2);
  });
  test('jazdec z CZ je v rebríčku CZ aj v celkovom; v SK nie je', () => {
    const evs = [ev({ results: { open: [{ name: 'Petr Dvořák', place: 1, rider_id: 'cz1', country: 'CZ' }, { name: 'Ján Malý', place: 2, rider_id: 'sk1', country: 'SK' }] } })];
    assert.deepEqual(R.standings(evs, 'open', null, 2026, cfg(), { country: 'CZ' }).map(r => r.name), ['Petr Dvořák']);
    assert.deepEqual(R.standings(evs, 'open', null, 2026, cfg(), { country: 'SK' }).map(r => r.name), ['Ján Malý']);
    assert.deepEqual(R.standings(evs, 'open', null, 2026, cfg()).map(r => r.name), ['Petr Dvořák', 'Ján Malý']);
    assert.equal(R.standings(evs, 'open', null, 2026, cfg())[0].country, 'CZ');
  });
  test('výsledok bez krajiny jazdca (staršie výsledky podľa mena) má krajinu eventu, inak SK', () => {
    const evs = [ev({ country: 'CZ', results: { open: res('A') } }), ev({ results: { open: res('B') } })];
    assert.deepEqual(R.standings(evs, 'open', null, 2026, cfg(), { country: 'CZ' }).map(r => r.name), ['A']);
    assert.deepEqual(R.standings(evs, 'open', null, 2026, cfg(), { country: 'SK' }).map(r => r.name), ['B']);
  });
  test('pravidlá pri rovnosti platia aj v rebríčku krajiny', () => {
    const evs = [ev({ results: { open: [{ name: 'Bea', place: 3, country: 'CZ' }, { name: 'Ali', place: 3, country: 'CZ' }, { name: 'Cyril', place: 1, country: 'SK' }] } })];
    assert.deepEqual(R.standings(evs, 'open', null, 2026, cfg(), { country: 'CZ' }).map(r => r.name), ['Ali', 'Bea']);
  });
  test('mergeEvent prenesie krajinu a NFT z databázy, len keď ich riadok má', () => {
    const m = R.mergeEvent('e', { results: {}, awards: [] }, { results: [
      { event_id: 'e', category: 'open', rider_name: 'A', place: 1, rider_id: 'r1', country: 'CZ', nft: { chain_id: 8453, token_id: '12', status: 'result_set' } },
      { event_id: 'e', category: 'open', rider_name: 'B', place: 2 }] });
    assert.deepEqual(m.results.open, [
      { name: 'A', place: 1, rider_id: 'r1', country: 'CZ', nft: { chain_id: 8453, token_id: '12', status: 'result_set' } },
      { name: 'B', place: 2 }]);
  });
  test('riders: profil podľa rider_id má výsledky s NFT a krajinou', () => {
    const evs = [ev({ results: { open: [{ name: 'A', place: 1, rider_id: 'r1', country: 'CZ', nft: { chain_id: 8453, token_id: '3', status: 'minted' } }] } })];
    const r = R.riders(evs, cfg()).find(x => x.slug === 'r1');
    assert.equal(r.country, 'CZ');
    assert.equal(r.results[0].nft.token_id, '3');
  });
});

describe('explorerUrl', () => {
  const C = '0x1234567890abcdef1234567890abcdef12345678';
  test('Base a Base Sepolia', () => {
    assert.equal(R.explorerUrl({ chain_id: 8453, token_id: '12', status: 'result_set' }, C), `https://basescan.org/nft/${C}/12`);
    assert.equal(R.explorerUrl({ chain_id: 84532, token_id: 7, status: 'minted' }, C), `https://sepolia.basescan.org/nft/${C}/7`);
  });
  test('bez tokenu, bez adresy kontraktu, neznámy chain alebo token nevydaný/odvolaný: nič', () => {
    assert.equal(R.explorerUrl(null, C), null);
    assert.equal(R.explorerUrl({ chain_id: 8453, token_id: null, status: 'pending' }, C), null);
    assert.equal(R.explorerUrl({ chain_id: 8453, token_id: '1', status: 'minted' }, ''), null);
    assert.equal(R.explorerUrl({ chain_id: 31337, token_id: '1', status: 'minted' }, C), null);
    assert.equal(R.explorerUrl({ chain_id: 8453, token_id: '1', status: 'revoked' }, C), null);
    assert.equal(R.explorerUrl({ chain_id: 8453, token_id: '1', status: 'minted' }, 'javascript:alert(1)'), null);
    assert.equal(R.explorerUrl({ chain_id: 8453, token_id: '1x', status: 'minted' }, C), null);
  });
});

describe('officialEvents (events_public)', () => {
  const base = [ev({ id: 'bratislava-2026-05', city: 'Bratislava', status: 'done' }), ev({ id: 'bratislava-2', status: 'next', registration: true })];
  test('nový event z databázy sa pridá ako zastávka; zrušený sa nepridá', () => {
    const out = R.officialEvents(base, [
      { id: 'brno-2027', name: 'GOSko Brno', city: 'Brno', country: 'CZ', date: '2027-04-10', season: 2027, status: 'open', registration_open: true },
      { id: 'kosice-x', name: 'GOSko Košice', city: 'Košice', country: 'SK', date: null, season: 2026, status: 'cancelled', registration_open: false },
    ]);
    assert.equal(out.added.length, 1);
    const b = out.added[0];
    assert.deepEqual([b.id, b.name, b.city, b.country, b.date, b.season, b.status, b.sticker, b.registration, b.stickerDate], ['brno-2027', 'GOSko Brno', 'Brno', 'CZ', '2027-04-10', 2027, 'next', 'next', true, '10.04.2027']);
    assert.deepEqual([b.results, b.awards, b.photos, b.partners], [{}, [], [], []]);
  });
  test('existujúci event: databáza určí krajinu a či je registrácia otvorená', () => {
    const out = R.officialEvents(base, [{ id: 'bratislava-2', name: 'x', city: 'x', country: 'SK', date: '2026-11-14', season: 2026, status: 'open', registration_open: false }]);
    assert.deepEqual(out.updates, { 'bratislava-2': { country: 'SK', registration: false, date: '2026-11-14' } });
    assert.equal(out.added.length, 0);
  });
  test('dátum z data.js má prednosť; databáza ho doplní len keď chýba', () => {
    const out = R.officialEvents([ev({ id: 'a', date: '2026-05-31' })], [{ id: 'a', country: 'SK', date: '2026-06-01', status: 'done', registration_open: false }]);
    assert.equal(out.updates.a.date, undefined);
  });
});
