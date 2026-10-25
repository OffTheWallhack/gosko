// Klipy a feed (Task 4): odkazy IG/TikTok/YouTube, kontrola súboru pred nahratím, postup nahratia.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EMBED_OK, EMBED_BAD } from '../helpers/embed-cases.js';
import * as G from '../../assets/game/logic.js';
import { submitClip } from '../../assets/game/clips.js';
import { DEFAULT_CFG } from '../../assets/game/api.js';

const MB = 1024 * 1024;
const PLAYER = '0b5b0000-0000-4000-8000-000000000001';
const SPOT = '5a000000-0000-4000-8000-000000000001';
const UUID = '11111111-2222-4333-8444-555555555555';

describe('odkaz na klip (parseEmbed, rovnaké prípady ako DB game_embed_url)', () => {
  test('IG, TikTok a YouTube v normalizovanom tvare', () => {
    for (const [input, out] of EMBED_OK) assert.equal(G.parseEmbed(input)?.url, out, input);
  });
  test('všetko ostatné je null', () => {
    for (const input of EMBED_BAD) assert.equal(G.parseEmbed(input), null, input);
    assert.equal(G.parseEmbed(null), null);
  });
  test('platforma a id pre prehrávač', () => {
    assert.deepEqual(G.parseEmbed('https://youtu.be/dQw4w9WgXcQ'), { platform: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(G.parseEmbed('https://www.instagram.com/reel/C1a2B3c4D5e/').platform, 'instagram');
    assert.equal(G.parseEmbed('https://vm.tiktok.com/ZMabc123/').platform, 'tiktok');
  });
});

describe('súbor pred nahratím (validateMedia)', () => {
  test('video nad 60 s je odmietnuté so slovenskou hláškou', () => {
    const r = G.validateMedia({ type: 'video/mp4', size: 10 * MB, duration: 61.2 }, DEFAULT_CFG);
    assert.match(r.error, /60 s/);
    assert.match(r.error, /61 s/);
  });
  test('video do 60 s, 50 MB a známy formát prejde, dĺžka sa zaokrúhli', () => {
    assert.deepEqual(G.validateMedia({ type: 'video/mp4', size: 49 * MB, duration: 59.6 }, DEFAULT_CFG), { kind: 'video', ext: 'mp4', duration: 60, error: '' });
    assert.equal(G.validateMedia({ type: 'video/quicktime', size: MB, duration: 3 }, DEFAULT_CFG).ext, 'mov');
    assert.equal(G.validateMedia({ type: 'video/webm', size: MB, duration: 3 }, DEFAULT_CFG).ext, 'webm');
  });
  test('veľké video, neznáma dĺžka a cudzí formát sú odmietnuté', () => {
    assert.match(G.validateMedia({ type: 'video/mp4', size: 50 * MB + 1, duration: 10 }, DEFAULT_CFG).error, /50 MB/);
    assert.ok(G.validateMedia({ type: 'video/mp4', size: MB, duration: NaN }, DEFAULT_CFG).error);
    assert.ok(G.validateMedia({ type: 'video/x-msvideo', size: MB, duration: 5 }, DEFAULT_CFG).error);
    assert.ok(G.validateMedia({ type: 'text/html', size: 100 }, DEFAULT_CFG).error);
  });
  test('fotka: akýkoľvek obrázok, zmenší sa na JPEG', () => {
    assert.deepEqual(G.validateMedia({ type: 'image/png', size: 8 * MB }, DEFAULT_CFG), { kind: 'photo', ext: 'jpg', duration: null, error: '' });
    assert.ok(G.validateMedia({ type: 'image/jpeg', size: 40 * MB }, DEFAULT_CFG).error, 'príliš veľký originál');
  });
});

/** Falošné API: zapisuje volania, addClip môže zlyhať. */
function fakeApi({ failAdd = null } = {}) {
  const calls = [];
  return {
    calls,
    async uploadMedia(path, blob, type) { calls.push(['upload', path, type, blob.size]); },
    async removeMedia(path) { calls.push(['remove', path]); },
    async addClip(args) { calls.push(['add', args]); if (failAdd) throw failAdd; return { id: 'c1', verified: true }; },
  };
}
const base = { playerId: PLAYER, spotId: SPOT, cfg: DEFAULT_CFG, uuid: () => UUID };

describe('nahratie klipu (submitClip)', () => {
  test('video nad 60 s sa vôbec nenahrá', async () => {
    const api = fakeApi();
    await assert.rejects(submitClip(api, { ...base, file: { type: 'video/mp4', size: 5 * MB }, duration: 75 }), /60 s/);
    assert.deepEqual(api.calls, []);
  });
  test('neplatný odkaz sa vôbec nepošle', async () => {
    const api = fakeApi();
    await assert.rejects(submitClip(api, { ...base, embedUrl: 'https://vimeo.com/123' }), /Instagram|TikTok|YouTube/);
    assert.deepEqual(api.calls, []);
  });
  test('odkaz: add_clip s normalizovaným odkazom a trikom', async () => {
    const api = fakeApi();
    await submitClip(api, { ...base, embedUrl: 'https://youtu.be/dQw4w9WgXcQ?si=x', trick: '  kickflip ' });
    assert.deepEqual(api.calls, [['add', { p_spot: SPOT, p_kind: 'embed', p_embed_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', p_trick: 'kickflip' }]]);
  });
  test('video: nahrá do vlastného priečinka, potom add_clip s cestou a dĺžkou', async () => {
    const api = fakeApi();
    const res = await submitClip(api, { ...base, file: { type: 'video/webm', size: 2 * MB }, duration: 12.4 });
    assert.equal(res.id, 'c1');
    assert.deepEqual(api.calls, [
      ['upload', `${PLAYER}/${UUID}.webm`, 'video/webm', 2 * MB],
      ['add', { p_spot: SPOT, p_kind: 'video', p_media_path: `${PLAYER}/${UUID}.webm`, p_duration_s: 12, p_trick: null }],
    ]);
  });
  test('fotka sa pred nahratím zmenší na JPEG (bez EXIF a polohy)', async () => {
    const api = fakeApi();
    const prepare = async () => ({ type: 'image/jpeg', size: 300_000 });
    await submitClip(api, { ...base, file: { type: 'image/heic', size: 6 * MB }, prepare });
    assert.deepEqual(api.calls[0], ['upload', `${PLAYER}/${UUID}.jpg`, 'image/jpeg', 300_000]);
    assert.equal(api.calls[1][1].p_kind, 'photo');
  });
  test('keď add_clip zlyhá, nahratý súbor sa zmaže', async () => {
    const err = Object.assign(new Error('NEED_MEDIA_CONSENT'), { code: 'NEED_MEDIA_CONSENT' });
    const api = fakeApi({ failAdd: err });
    await assert.rejects(submitClip(api, { ...base, file: { type: 'video/mp4', size: MB }, duration: 5 }), /NEED_MEDIA_CONSENT/);
    assert.deepEqual(api.calls.map(c => c[0]), ['upload', 'add', 'remove']);
    assert.equal(api.calls[2][1], `${PLAYER}/${UUID}.mp4`);
  });
});

describe('feed', () => {
  test('čas klipu po slovensky', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    assert.equal(G.timeAgo('2026-10-08T11:59:40Z', now), 'teraz');
    assert.equal(G.timeAgo('2026-10-08T11:55:00Z', now), 'pred 5 min');
    assert.equal(G.timeAgo('2026-10-08T09:00:00Z', now), 'pred 3 h');
    assert.equal(G.timeAgo('2026-10-06T12:00:00Z', now), 'pred 2 dňami');
    assert.equal(G.timeAgo('2026-10-07T11:00:00Z', now), 'včera');
  });
  test('hlášky nových chýb klipov', () => {
    for (const code of ['NEED_MEDIA_CONSENT', 'BAD_EMBED', 'BAD_MEDIA', 'MEDIA_TOO_BIG', 'VIDEO_TOO_LONG', 'CLIP_LIMIT']) {
      assert.notEqual(G.errorMessage({ message: code }), G.errorMessage({ message: 'UNKNOWN' }), code);
    }
  });
});
