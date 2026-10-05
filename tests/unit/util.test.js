import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeUrl, csvCell, csvRows, icsText, esc, encodePasses, decodePasses, mergePasses, importTarget, UserError } from '../../assets/util.js';

describe('safeUrl', () => {
  test('http a https prejdú', () => {
    assert.equal(safeUrl('https://gosko.sk/eventy'), 'https://gosko.sk/eventy');
    assert.equal(safeUrl('http://example.com'), 'http://example.com');
    assert.equal(safeUrl('  HTTPS://Example.com/x  '), 'HTTPS://Example.com/x');
  });
  test('javascript: a iné schémy vrátia null', () => {
    for (const u of ['javascript:alert(1)', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox', '//evil.example', '/relative', 'ftp://x', 'https:/x', 'https://', ''])
      assert.equal(safeUrl(u), null, JSON.stringify(u));
  });
  test('riadiace znaky a medzery vnútri vrátia null', () => {
    assert.equal(safeUrl('https://a.sk/\nx'), null);
    assert.equal(safeUrl('https://a.sk/\rURL:evil'), null);
    assert.equal(safeUrl('https://a.sk/a b'), null);
  });
  test('nie reťazec vráti null', () => {
    for (const u of [null, undefined, 42, {}]) assert.equal(safeUrl(u), null);
  });
});

describe('csvCell', () => {
  test('obyčajný text v úvodzovkách, úvodzovky zdvojené', () => {
    assert.equal(csvCell('Ján'), '"Ján"');
    assert.equal(csvCell('a "b" c'), '"a ""b"" c"');
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(undefined), '""');
    assert.equal(csvCell(true), '"true"');
  });
  test('bunka so vzorcom sa exportuje s apostrofom', () => {
    assert.equal(csvCell('=HYPERLINK("http://x","klik")'), `"'=HYPERLINK(""http://x"",""klik"")"`);
    assert.equal(csvCell('+cmd|calc'), `"'+cmd|calc"`);
    assert.equal(csvCell('-2+3'), `"'-2+3"`);
    assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
    assert.equal(csvCell('\t=1'), `"'\t=1"`);
    assert.equal(csvCell('\r=1'), `"'\r=1"`);
    assert.equal(csvCell('+421 900 123 456'), `"'+421 900 123 456"`);
  });
  test('čísla ostávajú číslami', () => {
    assert.equal(csvCell(-5), '"-5"');
    assert.equal(csvCell('-12.5'), '"-12.5"');
    assert.equal(csvCell('+421900123456'), '"+421900123456"');
    assert.equal(csvCell(0), '"0"');
  });
  test('csvRows: hlavička, bodkočiarka, BOM a CRLF', () => {
    const text = csvRows(['name', 'note'], [{ name: 'Eva', note: '=1+1' }, { name: 'Bo', note: 'a;b' }]);
    assert.equal(text, '﻿"name";"note"\r\n"Eva";"\'=1+1"\r\n"Bo";"a;b"');
  });
});

describe('icsText', () => {
  test('escapuje lomku, bodkočiarku a čiarku', () => assert.equal(icsText('a\\b;c,d'), 'a\\\\b\\;c\\,d'));
  test('CRLF, CR aj LF sú \\n a nerozbijú riadok', () => {
    const out = icsText('riadok 1\r\nriadok 2\rriadok 3\nkoniec');
    assert.equal(out, 'riadok 1\\nriadok 2\\nriadok 3\\nkoniec');
    assert.ok(!/[\r\n]/.test(out));
  });
  test('vložená vlastnosť sa nedá podstrčiť', () => assert.ok(!/[\r\n]/.test(icsText('Event\r\nURL:https://evil'))));
  test('prázdne hodnoty', () => { assert.equal(icsText(null), ''); assert.equal(icsText(undefined), ''); });
  test('ostatné riadiace znaky zmiznú', () => assert.equal(icsText('a\u0000b\u0007c'), 'abc'));
});

describe('esc', () => {
  test('HTML znaky', () => assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'));
  test('null a čísla', () => { assert.equal(esc(null), ''); assert.equal(esc(5), '5'); });
});

describe('UserError', () => {
  test('je Error s textom pre používateľa', () => {
    const e = new UserError('Skús znova.');
    assert.ok(e instanceof Error);
    assert.equal(e.message, 'Skús znova.');
  });
});

describe('prenos passov', () => {
  const pass = { token: '3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f', eventId: 'bratislava-2', event: 'GOSko Bratislava', date: '', name: 'Ľuboš Čierny 🛹', category: 'u16' };
  test('pass sa zakóduje a dekóduje bez straty', () => {
    const s = encodePasses([pass, { ...pass, token: 'a1b2c3d4-0000-4000-8000-000000000000', category: 'open', date: '2026-11-14' }]);
    assert.match(s, /^[A-Za-z0-9_-]+$/, 'base64url, bez + / =');
    const back = decodePasses(s);
    assert.deepEqual(back, [pass, { ...pass, token: 'a1b2c3d4-0000-4000-8000-000000000000', category: 'open', date: '2026-11-14' }]);
  });
  test('zakóduje len prenášané polia', () => {
    const s = encodePasses([{ ...pass, created: 123, secret: 'x' }]);
    assert.deepEqual(decodePasses(s), [pass]);
  });
  test('neplatný vstup sa ignoruje', () => {
    for (const bad of ['', '!!!', 'bm90IGpzb24', encodePasses([]), null, undefined, 'e30'])  // e30 = {}
      assert.deepEqual(decodePasses(bad), [], String(bad));
  });
  test('neplatné položky sa vyhodia, platné ostanú', () => {
    const raw = [pass, { ...pass, token: '<script>' }, { ...pass, token: '' }, { ...pass, eventId: 'zly event' }, 'x', null, { ...pass, token: 'b'.repeat(100) }];
    const s = Buffer.from(JSON.stringify(raw)).toString('base64url');
    assert.deepEqual(decodePasses(s), [pass]);
  });
  test('dlhé texty sa orežú a chýbajúce polia doplnia', () => {
    const s = Buffer.from(JSON.stringify([{ token: pass.token, eventId: 'x', name: 'N'.repeat(500) }])).toString('base64url');
    const [p] = decodePasses(s);
    assert.equal(p.name.length, 80);
    assert.deepEqual([p.event, p.date, p.category], ['', '', '']);
  });
  test('najviac 20 passov', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...pass, token: `t-${String(i).padStart(8, '0')}` }));
    assert.equal(decodePasses(encodePasses(many)).length, 20);
  });
  test('mergePasses: doplní nové, existujúce nechá, zoradí podľa vzniku', () => {
    const mine = [{ ...pass, created: 5 }];
    const other = { ...pass, token: 'c0ffee00-0000-4000-8000-000000000000' };
    const out = mergePasses(mine, [pass, other], 9);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map(p => [p.token, p.created]), [[other.token, 9], [pass.token, 5]]);
    assert.equal(mergePasses(mine, [], 9), mine);
  });
  test('importTarget: povolí len hash routu webu', () => {
    assert.equal(importTarget(encodeURIComponent('#/checkin/abc-123')), '#/checkin/abc-123');
    assert.equal(importTarget(encodeURIComponent('/event/x')), '#/event/x');
    assert.equal(importTarget(''), '#/');
    assert.equal(importTarget(undefined), '#/');
    assert.equal(importTarget(encodeURIComponent('https://evil.example')), '#/');
    assert.equal(importTarget(encodeURIComponent('#/import-passes/xx')), '#/', 'nezacyklí sa');
    assert.equal(importTarget('%E0%A4%A'), '#/', 'pokazené kódovanie');
  });
});

describe('redirect/index.html', () => {
  const html = readFileSync(new URL('../../redirect/index.html', import.meta.url), 'utf8');
  const fnSrc = html.match(/\/\* encode:start \*\/([\s\S]*?)\/\* encode:end \*\//)[1];
  const build = new Function('btoa', 'TextEncoder', `${fnSrc}; return { encodePasses, target };`);
  const stub = build(btoa, TextEncoder);
  test('vložený kódovač je kompatibilný s decodePasses', () => {
    const p = { token: '3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f', eventId: 'bratislava-2', event: 'GOSko Bratislava', date: '', name: 'Žofia Ďurišová', category: 'women', created: 1 };
    const s = stub.encodePasses([p]);
    assert.equal(s, encodePasses([p]));
    assert.deepEqual(decodePasses(s), [{ token: p.token, eventId: p.eventId, event: p.event, date: p.date, name: p.name, category: p.category }]);
  });
  test('cieľ presmerovania: bez passov ostane pôvodný hash, s passami ide cez import', () => {
    const origin = 'https://gosko.sk';
    assert.equal(stub.target(origin, '#/checkin/abc-123', []), 'https://gosko.sk/#/checkin/abc-123');
    assert.equal(stub.target(origin, '', []), 'https://gosko.sk/');
    const p = { token: '3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f', eventId: 'e', event: 'E', date: '', name: 'N', category: 'open' };
    const t = stub.target(origin, '#/checkin/abc-123', [p]);
    const m = t.match(/^https:\/\/gosko\.sk\/#\/import-passes\/([\w-]+)\?to=(.+)$/);
    assert.ok(m, t);
    assert.deepEqual(decodePasses(m[1]), [p]);
    assert.equal(importTarget(m[2]), '#/checkin/abc-123');
    assert.match(stub.target(origin, '', [p]), /^https:\/\/gosko\.sk\/#\/import-passes\/[\w-]+$/);
  });
  test('ukazuje na novú doménu a nemá externé skripty', () => {
    assert.match(html, /const NEW_ORIGIN = 'https:\/\/gosko\.sk'/);
    assert.ok(!/<script[^>]+src=/.test(html));
    assert.match(html, /location\.replace\(/);
  });
});
