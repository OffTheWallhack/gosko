// Herný profil (/hra/profil): úprava prezývky, mesta, stance, avatara a farby. Pravidlá sú aj v DB (019).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../../assets/game/logic.js';

const SQL = readFileSync(new URL('../../supabase/migrations/019_game_profile.sql', import.meta.url), 'utf8');

describe('profil hráča', () => {
  test('avatary sú tie isté ako v DB (players_avatar_check)', () => {
    const db = /avatar in \(([^)]+)\)/.exec(SQL)[1].split(',').map(s => s.trim().replace(/'/g, ''));
    assert.deepEqual(Object.keys(G.AVATARS), db);
  });
  test('validateProfile: nick, mesto do 60, stance, avatar a farba z palety', () => {
    const ok = G.validateProfile({ username: ' jano.flip ', city: ' Košice  Juh ', stance: 'goofy', avatar: 'skull', color: G.CREW_COLORS[2] });
    assert.deepEqual(ok.errors, {});
    assert.deepEqual(ok.value, { p_username: 'jano.flip', p_city: 'Košice Juh', p_stance: 'goofy', p_avatar: 'skull', p_color: G.CREW_COLORS[2] });
    assert.equal(G.validateProfile({ username: 'jano', city: '', stance: '', avatar: 'ghost', color: G.CREW_COLORS[0] }).value.p_city, null);
    const bad = G.validateProfile({ username: 'Ján', city: 'x'.repeat(61), stance: 'mongo', avatar: 'unicorn', color: '#123' });
    assert.deepEqual(Object.keys(bad.errors).sort(), ['avatar', 'city', 'color', 'stance', 'username']);
  });
  test('obsadený nick má vlastnú hlášku', () => {
    assert.match(G.errorMessage({ message: 'USERNAME_TAKEN' }), /niekto má/);
  });
});
