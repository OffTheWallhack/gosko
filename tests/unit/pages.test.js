import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, RULES, SEASON_RULES, CATEGORIES } from '../../data.js';
import { pointsFor } from '../../assets/ranking.js';
import * as P from '../../assets/pages.js';

const text = sections => sections.map(s => [s.title, ...(s.paras || []), ...(s.items || [])].join(' ')).join(' ');
const nonEmpty = (sections, name) => {
  assert.ok(Array.isArray(sections) && sections.length > 0, `${name}: žiadne sekcie`);
  for (const s of sections) {
    assert.ok(s.title && s.title.trim(), `${name}: sekcia bez nadpisu`);
    assert.ok((s.paras || []).some(p => p.trim()) || (s.items || []).length || s.table, `${name}: sekcia „${s.title}“ je prázdna`);
  }
};

describe('pointsTable', () => {
  const rows = P.pointsTable(POINTS);
  test('každý riadok POINTS má riadok tabuľky s rovnakými bodmi', () => {
    assert.deepEqual(rows.map(r => r.points), POINTS.map(p => p.points));
  });
  test('rozsahy miest nadväzujú a sedia s pointsFor', () => {
    let from = 1;
    for (const [i, r] of rows.entries()) {
      assert.equal(r.from, from, `riadok ${i}`);
      assert.equal(r.to, POINTS[i].upTo);
      assert.equal(pointsFor(r.from, POINTS), r.points);
      if (Number.isFinite(r.to)) { assert.equal(pointsFor(r.to, POINTS), r.points); from = r.to + 1; }
    }
  });
  test('slovenské popisy', () => {
    assert.equal(rows[0].label, '1. miesto');
    assert.equal(rows[2].label, '3. až 4. miesto');
    assert.match(rows.at(-1).label, /^17\. miesto a horšie/);
  });
  test('iná tabuľka bodov sa vygeneruje rovnako (nie je napevno)', () => {
    const t = P.pointsTable([{ upTo: 2, points: 50 }, { upTo: Infinity, points: 1 }]);
    assert.deepEqual(t.map(r => [r.label, r.points]), [['1. až 2. miesto', 50], ['3. miesto a horšie (účasť)', 1]]);
  });
});

describe('stránky nie sú prázdne', () => {
  test('#/pravidla: súťažný poriadok v data.js', () => nonEmpty(RULES.map(r => ({ title: r.title, paras: [r.text] })), 'RULES'));
  test('#/rebricek/pravidla: rebríčkový poriadok', () => nonEmpty(P.rankingRules({ points: POINTS, rules: SEASON_RULES, categories: CATEGORIES }), 'rankingRules'));
  test('#/sukromie: zásady ochrany osobných údajov', () => nonEmpty(P.PRIVACY, 'PRIVACY'));
});

describe('rebríčkový poriadok', () => {
  const sections = P.rankingRules({ points: POINTS, rules: SEASON_RULES, categories: CATEGORIES });
  test('obsahuje tabuľku bodov vygenerovanú z POINTS', () => {
    const t = sections.find(s => s.table);
    assert.ok(t, 'chýba sekcia s tabuľkou');
    assert.deepEqual(t.table, P.pointsTable(POINTS));
  });
  test('vymenúva kategórie a krajiny, názov GOSko Ranking, nie World Ranking', () => {
    const all = text(sections);
    for (const c of CATEGORIES) assert.ok(all.includes(c.name), c.name);
    assert.match(all, /GOSko Ranking/);
    assert.doesNotMatch(all, /World Ranking/i);
    assert.match(all, /Česk/);
  });
  test('countBest sa prejaví v texte', () => {
    assert.match(text(P.rankingRules({ points: POINTS, rules: { countBest: 3 }, categories: CATEGORIES })), /3 najlepšie/);
    assert.match(text(P.rankingRules({ points: POINTS, rules: { countBest: null }, categories: CATEGORIES })), /všetky výsledky/);
  });
});

describe('zásady súkromia', () => {
  const all = text(P.PRIVACY);
  test('na blockchaine nie je žiadny osobný údaj', () => assert.match(all, /blockchain[\s\S]*žiadn[ey] osobn/i));
  test('prevádzkovateľ: OZ SFS po registrácii, dovtedy organizátor', () => {
    assert.match(all, /Slovenská federácia skateboardingu/);
    assert.match(all, /organizátor/);
  });
  test('rodič pri jazdcovi do 16 rokov', () => assert.match(all, /16 rokov/));
});

describe('texty bez dlhej pomlčky a bez World Ranking', () => {
  const all = [text(P.PRIVACY), text(P.rankingRules({ points: POINTS, rules: SEASON_RULES, categories: CATEGORIES })), RULES.map(r => r.title + r.text).join(' ')].join(' ');
  test('žiadne —', () => assert.ok(!all.includes('—')));
  test('žiadne World Ranking', () => assert.doesNotMatch(all, /World Ranking/i));
});
