// Rozloženie herných podstránok (/hra/rebricek, /hra/crew, …): stĺpec obsahu je centrovaný aj na desktope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../assets/game/game.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Špecifickosť jednoduchého selektora ako [triedy, typy] (stačí pre game.css: triedy, typy, >, *). */
const spec = sel => [(sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length, (sel.match(/(^|[\s>+~])[a-z]+/g) || []).length];
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];

test('centrovanie .g-page>* má vyššiu špecifickosť ako margin priamych potomkov stránky', () => {
  const center = /([^{}]*\.g-page>\*)\{[^}]*margin-left:auto[^}]*margin-right:auto/.exec(css);
  assert.ok(center, 'pravidlo centrovania .g-page>* chýba');
  const centerSpec = spec(center[1].trim());
  // triedy, ktoré sú priamo v .g-page a samy nastavujú margin (stránky v pages.js, crew.js, feed.js, loadout.js)
  for (const cls of ['g-board', 'g-msg', 'g-hint', 'g-page-head', 'g-holo', 'g-profile', 'g-soon', 'g-feed', 'g-crew', 'g-loadout']) {
    for (const m of css.matchAll(new RegExp(`(^|})\\s*([^{}]*\\.${cls}(?![\\w-])[^{}]*)\\{([^}]*)\\}`, 'g'))) {
      if (!/margin(?:-left|-right)?:/.test(m[3])) continue;
      for (const sel of m[2].split(',').map(s => s.trim()).filter(s => s.endsWith(`.${cls}`))) {
        assert.ok(cmp(centerSpec, spec(sel)) > 0, `${sel} prebije centrovanie (${center[1].trim()})`);
      }
    }
  }
});
