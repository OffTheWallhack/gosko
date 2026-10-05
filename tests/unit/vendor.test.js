// Knižnice uložené na webe (assets/vendor) sú bajtovo zhodné s npm balíkmi: SHA-384 každého
// súboru musí sedieť so zápisom v assets/vendor/SOURCES.txt. Pri aktualizácii knižnice sa mení aj zápis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VENDOR = join(import.meta.dirname, '..', '..', 'assets', 'vendor');
const sources = readFileSync(join(VENDOR, 'SOURCES.txt'), 'utf8');
const hashes = [...sources.matchAll(/^(\S+)\s+sha384-([A-Za-z0-9+/=]+)\s*$/gm)].map(m => ({ file: m[1], hash: m[2] }));

test('SOURCES.txt má hash pre MapLibre GL (všetky súbory modulu)', () => {
  for (const f of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
    assert.ok(hashes.some(h => h.file === `maplibre-gl-6.12.0/${f}`), f);
  }
  assert.ok(existsSync(join(VENDOR, 'licenses', 'maplibre-gl.LICENSE')), 'licencia MapLibre');
});

for (const { file, hash } of hashes) {
  test(`${file}: SHA-384 sedí so SOURCES.txt`, () => {
    const actual = createHash('sha384').update(readFileSync(join(VENDOR, file))).digest('base64');
    assert.equal(actual, hash);
  });
}
