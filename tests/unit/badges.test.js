import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, badgesFor, badgeSvg } from '../../assets/badges.js';

const ev = (id, date) => ({ id, name: `GOSko ${id}`, date });
const BA = ev('ba', '2026-05-31'), ZA = ev('za', '2026-08-01'), BA2 = ev('ba2', '');
const rider = (o = {}) => ({ results: [], awards: [], events: [], ...o });
const ids = (r, ctx = { seasonEvents: [] }) => badgesFor(r, ctx).map(b => b.id);

describe('badgesFor', () => {
  test('nikto bez eventu nemá žiadny odznak', () => assert.deepEqual(ids(rider()), []));
  test('debut s názvom prvého eventu', () => {
    const r = rider({ events: [ZA, BA], results: [{ ev: ZA, cat: 'open', place: 9 }, { ev: BA, cat: 'open', place: 12 }] });
    const b = badgesFor(r, { seasonEvents: [] });
    assert.deepEqual(b.map(x => x.id), ['debut']);
    assert.equal(b[0].detail, 'GOSko ba', 'najskorší event');
  });
  test('pódium a šampión', () => {
    assert.deepEqual(ids(rider({ events: [BA], results: [{ ev: BA, cat: 'open', place: 3 }] })), ['debut', 'podium']);
    assert.deepEqual(ids(rider({ events: [BA], results: [{ ev: BA, cat: 'open', place: 1 }] })), ['debut', 'podium', 'champ']);
  });
  test('junior a babská sila podľa kategórie', () => {
    assert.ok(ids(rider({ events: [BA], results: [{ ev: BA, cat: 'u16', place: 7 }] })).includes('junior'));
    assert.ok(ids(rider({ events: [BA], results: [{ ev: BA, cat: 'women', place: 7 }] })).includes('women'));
  });
  test('best trick len za ocenenie s týmto názvom', () => {
    assert.deepEqual(ids(rider({ events: [BA], awards: [{ name: 'Best Trick', ev: BA }] })), ['debut', 'trick']);
    assert.deepEqual(ids(rider({ events: [BA], awards: [{ name: 'Best Slam', ev: BA }] })), ['debut']);
  });
  test('verný jazdec: všetky odjazdené eventy sezóny, najmenej dva', () => {
    const r = rider({ events: [BA, ZA], results: [{ ev: BA, cat: 'open', place: 9 }, { ev: ZA, cat: 'open', place: 9 }] });
    assert.ok(ids(r, { seasonEvents: [BA, ZA] }).includes('loyal'));
    assert.ok(!ids(r, { seasonEvents: [BA, ZA, BA2] }).includes('loyal'), 'chýba mu jeden event');
    assert.ok(!ids(rider({ events: [BA], results: [{ ev: BA, cat: 'open', place: 9 }] }), { seasonEvents: [BA] }).includes('loyal'), 'jeden event nestačí');
  });
  test('každý odznak má názov, text a ikonu', () => {
    for (const b of BADGES) assert.ok(b.id && b.name && b.text && b.icon, b.id);
  });
});

describe('badgeSvg', () => {
  test('SVG s ikonou a veľkosťou', () => {
    const svg = badgeSvg(BADGES[0], 16);
    assert.match(svg, /^<svg [^>]*width="16" height="16"/);
    assert.ok(svg.includes(BADGES[0].icon));
    assert.match(svg, /aria-hidden="true"/);
    assert.match(badgeSvg(BADGES[1]), /width="22"/);
  });
});
