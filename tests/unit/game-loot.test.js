// Loot a loadout (Task 6): nálepky z gearu na 3D dosku, zamknuté ako siluety, výber dosky, tiery dropu, hlášky.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../assets/game/logic.js';

const CATALOG = [
  { id: 'gosko-ghost', name: 'Duch GOSko', kind: 'sticker', how_to_unlock: 'Máš ju od začiatku.' },
  { id: 'ghost-drop', name: 'Ghost drop', kind: 'sticker', how_to_unlock: 'Vyjazdi loot drop.' },
  { id: 'park-pass', name: 'Park pass', kind: 'badge', how_to_unlock: 'Check-in na GOSko evente.' },
  { id: 'deck-x', name: 'Doska X', kind: 'deck', how_to_unlock: 'Neskôr.' },
];

describe('loadout', () => {
  test('gear -> nálepka pre assets/board.js (odznak okrúhly, nálepka pás s nápisom)', () => {
    assert.deepEqual(G.gearSticker(CATALOG[0]), { kind: 'band', title: 'Duch GOSko', sub: 'Ghoskate' });
    assert.deepEqual(G.gearSticker(CATALOG[2]), { kind: 'round', title: 'Park pass' });
  });
  test('vlastné, zamknuté (siluety s popisom, ako ich vyjazdiť) a nalepené len z vlastných, najviac 8', () => {
    const s = G.loadoutState(CATALOG, ['gosko-ghost', 'park-pass'], { stickers: ['park-pass', 'ghost-drop', 'neznama'] });
    assert.deepEqual(s.owned.map(g => g.id), ['gosko-ghost', 'park-pass']);
    assert.deepEqual(s.locked.map(g => [g.id, g.how_to_unlock]), [['ghost-drop', 'Vyjazdi loot drop.']]);
    assert.deepEqual(s.placed, ['park-pass'], 'zamknutá a neznáma nálepka sa nenalepí');
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, kind: 'sticker', how_to_unlock: 'x' }));
    assert.equal(G.loadoutState(many, many.map(g => g.id), { stickers: many.map(g => g.id) }).placed.length, 8);
  });
  test('bez uloženej dosky sú nalepené všetky vlastné nálepky (najviac 8); doska bez nálepiek je nepovinná', () => {
    assert.deepEqual(G.loadoutState(CATALOG, ['gosko-ghost'], {}).placed, ['gosko-ghost']);
    assert.deepEqual(G.loadoutState(CATALOG, ['gosko-ghost'], { stickers: [] }).placed, []);
  });
  test('uloženie dosky: len známe kľúče vzhľadu a zoznam nálepiek', () => {
    assert.deepEqual(G.loadoutConfig({ deck: 'ghosts', grip: 'red', wheels: 'black', trucks: 'silver', extra: 1 }, ['gosko-ghost']),
      { deck: 'ghosts', grip: 'red', wheels: 'black', trucks: 'silver', stickers: ['gosko-ghost'] });
  });
});

describe('loot drop', () => {
  test('tiery: kto čo dostane podľa poradia', () => {
    const tiers = [{ label: 'Top 3', up_to: 3, reward: 'Doska' }, { label: 'Top 50', up_to: 50, reward: 'Zľava 10 %' }];
    assert.deepEqual(G.tierLines(tiers), ['1. až 3.: Doska (Top 3)', '4. až 50.: Zľava 10 % (Top 50)']);
    assert.deepEqual(G.tierLines([{ label: 'Prvý', up_to: 1, reward: null }]), ['1.: Prvý']);
  });
  test('formulár admina: tiery musia rásť a mať kód', () => {
    const ok = G.validateLootDrop({ spot_id: '5a000000-0000-4000-8000-000000000001', title: 'Drop', tiers: [{ label: 'A', up_to: '3', code: 'X' }] });
    assert.deepEqual(ok.errors, {});
    assert.equal(ok.value.tiers[0].up_to, 3);
    const bad = G.validateLootDrop({ spot_id: '', title: '', tiers: [{ label: 'A', up_to: 5, code: 'X' }, { label: 'B', up_to: 2, code: '' }] });
    assert.deepEqual(Object.keys(bad.errors).sort(), ['spot_id', 'tiers.1.code', 'tiers.1.up_to', 'title']);
  });
  test('hlášky claimu', () => {
    assert.match(G.errorMessage({ message: 'NEED_CLIP_ON_SPOT' }), /overený klip/);
    assert.match(G.errorMessage({ message: 'DROP_EMPTY' }), /rozobratý/);
    assert.match(G.errorMessage({ message: 'GEAR_LOCKED' }), /nálepk/);
  });
  test('stav NFT odmeny', () => {
    assert.equal(G.nftLabel({ nft_type: null }), '');
    assert.match(G.nftLabel({ nft_type: 1, nft_status: 'minted' }), /vydané/);
    assert.match(G.nftLabel({ nft_type: 1, nft_status: null }), /GoskoLoot/);
  });
});
