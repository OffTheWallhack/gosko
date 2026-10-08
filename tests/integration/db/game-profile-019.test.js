// Migrácia 019: úprava herného profilu na /hra/profil (prezývka, mesto, stance, avatar a farba).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, stopStack, rest, sql } from '../../helpers/stack.js';
import { lit } from './_fixtures.js';
import { createPlayer, createSpot, rpc } from './_game.js';

const update = (p, v) => rpc('update_profile', p, { p_username: p.username, p_city: null, p_stance: null, p_avatar: 'ghost', p_color: '#FF3DA5', ...v });

before(async () => {
  await startStack();
});

after(stopStack);

describe('update_profile', () => {
  test('a player changes nick, city, stance, avatar and colour of his own profile', async () => {
    const p = createPlayer({ username: 'stary_nick' });
    const res = await update(p, { p_username: 'novy.nick', p_city: '  Košice ', p_stance: 'goofy', p_avatar: 'skull', p_color: '#6FF3FF' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const me = (await rpc('game_me', p)).body;
    assert.deepEqual([me.username, me.city, me.stance, me.avatar, me.color], ['novy.nick', 'Košice', 'goofy', 'skull', '#6FF3FF']);
    const pub = (await rest(`/players_public?id=eq.${p.id}`, { as: 'anon' })).body[0];
    assert.deepEqual([pub.username, pub.avatar, pub.color], ['novy.nick', 'skull', '#6FF3FF']);
    assert.ok(!('city' in pub), 'mesto nie je verejné');
  });

  test('taken nick (any case) is USERNAME_TAKEN; bad nick, avatar, colour, stance or long city is BAD_INPUT', async () => {
    createPlayer({ username: 'Obsadeny' });
    const p = createPlayer();
    assert.equal((await update(p, { p_username: 'obsadeny' })).body.message, 'USERNAME_TAKEN');
    for (const bad of [{ p_username: 'ab' }, { p_username: 'Ján' }, { p_avatar: 'unicorn' }, { p_color: 'red' }, { p_stance: 'mongo' }, { p_city: 'x'.repeat(61) }]) {
      const res = await update(p, bad);
      assert.equal(res.body.message, 'BAD_INPUT', JSON.stringify(bad));
    }
    assert.equal(sql(`select username from public.players where id = ${lit(p.id)}`), p.username);
  });

  test('feed shows the author avatar and colour', async () => {
    const p = createPlayer();
    await update(p, { p_avatar: 'crown', p_color: '#FFD23F' });
    const clip = (await rpc('add_clip', p, { p_spot: createSpot(), p_kind: 'embed', p_embed_url: 'https://youtu.be/dQw4w9WgXcQ' })).body.id;
    const row = (await rest(`/clips_public?id=eq.${clip}`)).body[0];
    assert.equal(row.avatar, 'crown');
    assert.equal(row.color, '#FFD23F');
  });

  test('without a player profile FORBIDDEN', async () => {
    const res = await rest('/rpc/update_profile', { method: 'POST', as: 'authenticated', body: { p_username: 'nikto_x', p_city: null, p_stance: null, p_avatar: 'ghost', p_color: '#FF3DA5' } });
    assert.equal(res.body.message, 'FORBIDDEN');
  });
});
