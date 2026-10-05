// Čistá logika hry (assets/game/logic.js): vzdialenosť, hlášky chýb, U16, piny zo spot_summary, reduced motion.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../assets/game/logic.js';
import { T } from '../../assets/game/i18n-sk.js';

const LONG_DASH = /[–—]/;

describe('vzdialenosť', () => {
  test('metre do 1 km, potom km s desatinnou čiarkou, od 10 km celé', () => {
    assert.equal(G.formatDistance(0), '0 m');
    assert.equal(G.formatDistance(340.4), '340 m');
    assert.equal(G.formatDistance(999.6), '1,0 km');
    assert.equal(G.formatDistance(1234), '1,2 km');
    assert.equal(G.formatDistance(12345), '12 km');
    assert.equal(G.formatDistance(NaN), '');
  });

  test('TOO_FAR ukáže vzdialenosť a limit', () => {
    assert.equal(G.tooFarMessage({ distance_m: 340, max_m: 150 }), 'Si 340 m od spotu. Podíď bližšie, limit je 150 m.');
    assert.equal(G.tooFarMessage({ distance_m: 2400, max_m: 150 }), 'Si 2,4 km od spotu. Podíď bližšie, limit je 150 m.');
    assert.equal(G.tooFarMessage(null), T.err.TOO_FAR_GENERIC);
  });
});

describe('chyby RPC', () => {
  test('parseRpcError: kód zo správy, details ako JSON', () => {
    assert.deepEqual(G.parseRpcError({ message: 'TOO_FAR', details: '{"distance_m":340,"max_m":150}', code: 'P0001' }), { code: 'TOO_FAR', details: { distance_m: 340, max_m: 150 } });
    assert.deepEqual(G.parseRpcError({ message: 'NEED_GUARDIAN', details: null }), { code: 'NEED_GUARDIAN', details: null });
    assert.deepEqual(G.parseRpcError({ message: 'TOO_FAR', details: 'nie json' }), { code: 'TOO_FAR', details: null });
    assert.deepEqual(G.parseRpcError({ message: 'duplicate key value violates…', code: '23505' }), { code: 'UNKNOWN', details: null });
    assert.deepEqual(G.parseRpcError(null), { code: 'UNKNOWN', details: null });
    assert.deepEqual(G.parseRpcError(new TypeError('Failed to fetch')), { code: 'NETWORK', details: null });
  });

  test('errorMessage: každý kód z kontraktu §8 má slovenskú hlášku bez dlhých pomlčiek', () => {
    const codes = ['FORBIDDEN', 'NEED_GUARDIAN', 'TOO_FAR', 'SPOT_NOT_FOUND', 'SPOT_LIMIT', 'NEED_CHECKIN', 'NEED_CLIP_ON_SPOT', 'CLIP_NOT_FOUND',
      'CREW_FULL', 'ALREADY_IN_CREW', 'BAD_CODE', 'CREW_TAKEN', 'DROP_INACTIVE', 'DROP_EMPTY', 'BAD_INPUT', 'NETWORK', 'UNKNOWN'];
    for (const code of codes) {
      const msg = G.errorMessage({ message: code });
      assert.ok(msg && typeof msg === 'string', code);
      assert.doesNotMatch(msg, LONG_DASH, code);
    }
    assert.equal(G.errorMessage({ message: 'TOO_FAR', details: '{"distance_m":340,"max_m":150}' }), 'Si 340 m od spotu. Podíď bližšie, limit je 150 m.');
    assert.equal(G.errorMessage({ message: 'NIECO_NOVE' }), T.err.UNKNOWN);
  });

  test('poloha: zamietnutie, nedostupná, timeout a prehliadač bez GPS', () => {
    assert.equal(G.geoErrorMessage({ code: 1 }), T.geo.denied);
    assert.equal(G.geoErrorMessage({ code: 2 }), T.geo.unavailable);
    assert.equal(G.geoErrorMessage({ code: 3 }), T.geo.timeout);
    assert.equal(G.geoErrorMessage({ code: 'unsupported' }), T.geo.unsupported);
    assert.equal(G.geoErrorMessage(undefined), T.geo.unavailable);
    assert.match(T.geo.denied, /Povoľ polohu/);
  });
});

describe('U16', () => {
  test('needsGuardian: vek dnes, narodeniny v ten deň sa rátajú', () => {
    assert.equal(G.needsGuardian('2010-10-05', '2026-10-05'), false);
    assert.equal(G.needsGuardian('2010-10-06', '2026-10-05'), true);
    assert.equal(G.needsGuardian('2000-01-01', '2026-10-05'), false);
    assert.equal(G.needsGuardian('nie-datum', '2026-10-05'), false);
  });

  test('playerMode: anon, onboarding, prezeranie (U16 bez súhlasu), hra', () => {
    assert.equal(G.playerMode({ signedIn: false }), 'anon');
    assert.equal(G.playerMode({ signedIn: true, me: null }), 'onboarding');
    assert.equal(G.playerMode({ signedIn: true, me: { can_write: false, needs_guardian: true } }), 'browse');
    assert.equal(G.playerMode({ signedIn: true, me: { can_write: true, needs_guardian: false } }), 'play');
  });
});

describe('piny zo spot_summary', () => {
  const row = (over = {}) => ({ id: 'a', name: 'Eurovea', lat: 48.14, lng: 17.12, people_now: 0, loot_active: false,
    control_crew_id: null, control_tag: null, control_color: null, control_points: null, skulls: null, ratings: 0, ...over });

  test('summaryToPin: farba a TAG crew, počet ľudí, loot', () => {
    const p = G.summaryToPin(row({ control_crew_id: 'c', control_tag: 'RR', control_color: '#FF3366', control_points: 145, people_now: 3, loot_active: true }));
    assert.equal(p.id, 'a');
    assert.deepEqual([p.lng, p.lat], [17.12, 48.14]);
    assert.equal(p.color, '#ff3366');
    assert.equal(p.tag, 'RR');
    assert.equal(p.people, 3);
    assert.equal(p.pulse, 2);
    assert.equal(p.loot, true);
    assert.match(p.label, /Eurovea/);
    assert.match(p.label, /RR/);
    assert.match(p.label, /3 ľudia/);
  });

  test('summaryToPin: bez crew GOSko farba, zlá farba z DB sa nepoužije', () => {
    assert.equal(G.summaryToPin(row()).color, null);
    assert.equal(G.summaryToPin(row()).tag, null);
    assert.equal(G.summaryToPin(row({ control_tag: 'X', control_color: 'red;background:url(x)' })).color, null);
  });

  test('pulz podľa počtu ľudí; reduced motion pulz vypne, počet ostane', () => {
    assert.deepEqual([0, 1, 2, 4, 5, 40].map(n => G.pulseLevel(n)), [0, 1, 2, 2, 3, 3]);
    const p = G.summaryToPin(row({ people_now: 6 }), { reducedMotion: true });
    assert.equal(p.pulse, 0);
    assert.equal(p.people, 6);
  });

  test('pinsFromSummary: bez súradníc von; dôležité piny (loot, ľudia, crew) idú na koniec, teda navrch', () => {
    const pins = G.pinsFromSummary([
      row({ id: 'loot', loot_active: true }),
      row({ id: 'crowd', people_now: 4 }),
      row({ id: 'plain' }),
      row({ id: 'crew', control_crew_id: 'c', control_tag: 'AB', control_color: '#00ff00' }),
      row({ id: 'nolat', lat: null }),
    ]);
    assert.deepEqual(pins.map(p => p.id), ['plain', 'crew', 'crowd', 'loot']);
  });

  test('lebky, bust a stav do textu', () => {
    assert.deepEqual(G.skullsFilled(null), 0);
    assert.deepEqual(G.skullsFilled(3.6), 4);
    assert.deepEqual(G.skullsFilled(9), 5);
    assert.deepEqual(G.bustLevel('low'), 1);
    assert.deepEqual(G.bustLevel('high'), 3);
    assert.deepEqual(G.bustLevel(null), 0);
    assert.equal(G.statusLabel('mokre'), 'Mokré');
    assert.equal(G.statusLabel('nieco'), '');
    assert.equal(G.peopleLabel(1), '1 človek na spote');
    assert.equal(G.peopleLabel(3), '3 ľudia na spote');
    assert.equal(G.peopleLabel(7), '7 ľudí na spote');
  });
});

describe('reduced motion', () => {
  test('prefersReducedMotion číta media query a bez matchMedia je false', () => {
    assert.equal(G.prefersReducedMotion({ matchMedia: q => ({ matches: q === '(prefers-reduced-motion: reduce)' }) }), true);
    assert.equal(G.prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
    assert.equal(G.prefersReducedMotion({}), false);
    assert.equal(G.prefersReducedMotion(undefined), false);
  });
});

describe('check-in a nový spot', () => {
  test('activeCheckin: otvorený a mladší ako 120 min', () => {
    const now = Date.parse('2026-10-05T12:00:00Z');
    assert.equal(G.isActiveCheckin({ ended_at: null, started_at: '2026-10-05T11:00:00Z' }, now, 120), true);
    assert.equal(G.isActiveCheckin({ ended_at: null, started_at: '2026-10-05T09:59:00Z' }, now, 120), false);
    assert.equal(G.isActiveCheckin({ ended_at: '2026-10-05T11:30:00Z', started_at: '2026-10-05T11:00:00Z' }, now, 120), false);
    assert.equal(G.isActiveCheckin(null, now, 120), false);
  });

  test('checkoutMessage: minúty a body', () => {
    assert.equal(G.checkoutMessage({ minutes: 45, points: 45 }), 'Check-out. Jazdil si 45 min, +45 b.');
  });

  test('validateNewSpot: názov, typ, mesto, prekážky do popisu', () => {
    const ok = G.validateNewSpot({ name: '  Schody pri Eurovea ', kind: 'street', city: 'Bratislava', obstacles: ['rail', 'schody'], note: 'hladký povrch' });
    assert.deepEqual(ok.errors, {});
    assert.equal(ok.value.p_name, 'Schody pri Eurovea');
    assert.equal(ok.value.p_kind, 'street');
    assert.equal(ok.value.p_description, 'Prekážky: rail, schody. hladký povrch');
    const bad = G.validateNewSpot({ name: '', kind: 'zly', city: '', obstacles: ['rail', 'nieco'] });
    assert.ok(bad.errors.name && bad.errors.kind && bad.errors.city);
    assert.equal(G.validateNewSpot({ name: 'x', kind: 'park', city: 'BA', obstacles: [], note: 'a'.repeat(500) }).value.p_description.length, 400);
  });

  test('validateUsername zrkadlí CHECK v players', () => {
    assert.equal(G.validateUsername('jano_flip.9'), '');
    for (const bad of ['ab', 'a'.repeat(21), 'Ján', 'jano flip', '']) assert.ok(G.validateUsername(bad), bad);
  });
});

describe('texty hry', () => {
  test('žiadne dlhé pomlčky v i18n-sk', () => {
    const walk = o => Object.values(o).flatMap(v => (typeof v === 'string' ? [v] : typeof v === 'object' && v ? walk(v) : []));
    for (const s of walk(T)) assert.doesNotMatch(s, LONG_DASH, s);
  });
  test('spodné menu: MAPA · FEED · CREW · REBRÍČEK · LOADOUT', () => {
    assert.deepEqual(G.GAME_MENU.map(m => m.label), ['MAPA', 'FEED', 'CREW', 'REBRÍČEK', 'LOADOUT']);
    for (const m of G.GAME_MENU) assert.match(m.href, /^#\//);
  });
});

describe('návrat do hry po prihlásení odkazom', async () => {
  const { consumeReturn } = await import('../../assets/game/return.js');
  const mem = v => { let s = v === undefined ? null : JSON.stringify(v); return { getItem: () => s, removeItem: () => { s = null; } }; };
  test('platný záznam sa použije raz, starý alebo cudzí sa zahodí', () => {
    const now = 1_000_000_000;
    const st = mem({ hash: '#/spot/abc-1', at: now - 60_000 });
    assert.equal(consumeReturn(now, st), '#/spot/abc-1');
    assert.equal(consumeReturn(now, st), '');
    assert.equal(consumeReturn(now, mem({ hash: '#/mapa', at: now - 31 * 60_000 })), '');
    assert.equal(consumeReturn(now, mem({ hash: 'javascript:alert(1)', at: now })), '');
    assert.equal(consumeReturn(now, mem({ hash: '#/x?y=<z>', at: now })), '');
    assert.equal(consumeReturn(now, mem()), '');
  });
});

describe('skutočné adresy pre hru (web má /mapa, /spot/…, starý tvar #/… platí tiež)', async () => {
  const { currentRoute, routeUrl } = await import('../../assets/game/return.js');
  const loc = (pathname, hash = '') => ({ pathname, hash });
  test('currentRoute: cesta pod base aj starý hash', () => {
    assert.equal(currentRoute(loc('/spot/abc-1'), '/'), '#/spot/abc-1');
    assert.equal(currentRoute(loc('/mapa/'), '/'), '#/mapa');
    assert.equal(currentRoute(loc('/'), '/'), '#/');
    assert.equal(currentRoute(loc('/gosko/hra/profil'), '/gosko/'), '#/hra/profil');
    assert.equal(currentRoute(loc('/mapa', '#/spot/x'), '/'), '#/spot/x');
  });
  test('routeUrl: #/… na cestu pod base', () => {
    assert.equal(routeUrl('#/mapa', '/'), '/mapa');
    assert.equal(routeUrl('#/spot/abc', '/gosko/'), '/gosko/spot/abc');
  });
  test('herná crew nekoliduje s Robovou stránkou #/crew', () => {
    assert.equal(G.GAME_MENU.find(m => m.id === 'crew').href, '#/hra/crew');
  });
});
