// Tests for scripts/guard.mjs on throwaway trees (GUARD_ROOT points the guard at them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const EM = String.fromCharCode(0x2014); // never typed literally: the guard scans this file too
const AMP = '&';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'sf-guard-'));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}
function run(root) {
  const r = spawnSync(process.execPath, [GUARD], { env: { ...process.env, GUARD_ROOT: root }, encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
// The NK shipping page as it is today: comma-grouped and raw-number prices are NK copy, which the guard leaves alone.
const NK_SHIPPING = readFileSync(join(HERE, '../src/content/pages/shipping-info.md'), 'utf8');
const clean = { 'src/content/pages/shipping-info.md': NK_SHIPPING, 'src/lib/x.ts': 'export const a = 1;\n' };

// Raw-price fixtures are built by concatenation so this file's own lines never hold one (the diff greps scan them).
const R = 'R';
const COMMA = R + '2,500', UNSPACED = R + '2500', TOKEN = R + '{{shipping.free_shipping_threshold_zar}}';

test('passes on a clean tree that holds NK\'s own comma-grouped price and R{{...}}', () => {
  assert.ok(NK_SHIPPING.includes(COMMA));
  assert.match(NK_SHIPPING, /R\{\{/);
  const r = run(tree(clean));
  assert.equal(r.code, 0, r.out);
});

for (const [name, text] of [['an em dash', `a ${EM} b`], ['the named mdash entity', `a ${AMP}mdash; b`], ['the hex 2014 entity', `a ${AMP}#x2014; b`], ['the decimal 8212 entity', `a ${AMP}#8212; b`]]) {
  test(`fails on ${name} anywhere in src, public or scripts`, () => {
    for (const where of ['src/content/pages/about.md', 'public/robots.txt', 'scripts/x.mjs']) {
      const r = run(tree({ ...clean, [where]: `line one\n${text}\n` }));
      assert.notEqual(r.code, 0, `${name} in ${where}`);
      assert.match(r.out, new RegExp(`${where.replace(/[./]/g, '\\$&')}:2: `));
    }
  });
}

for (const [name, text] of [['comma-grouped price', `Free over ${COMMA}.`], ['unspaced price', `Free over ${UNSPACED}.`], ['R{{key}} price', `Free over ${TOKEN}.`]]) {
  test(`fails on a Kampi ${name}`, () => {
    for (const where of ['src/content/kampi/legal/terms.md', 'src/brands/kampi/copy.ts']) {
      const r = run(tree({ ...clean, [where]: `x\n${text}\n` }));
      assert.notEqual(r.code, 0, `${name} in ${where}`);
      assert.match(r.out, /raw price/);
    }
  });
}

test('fails on a raw price inside the Kampi STORE_BRANDS block, not in the NK block', () => {
  const brands = (nk, kampi) => `export const STORE_BRANDS = {\n  nk: {\n    tagline: '${nk}',\n  },\n  kampi: {\n    tagline: '${kampi}',\n  },\n};\n`;
  assert.equal(run(tree({ ...clean, 'src/lib/brands.ts': brands(`Free over ${UNSPACED}`, 'Free delivery') })).code, 0);
  const r = run(tree({ ...clean, 'src/lib/brands.ts': brands('Free delivery', `Free over ${UNSPACED}`) }));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /src\/lib\/brands\.ts:6: raw price/);
});

test('fails when it scanned zero files', () => {
  const r = run(tree({ 'README.txt': 'nothing under src, public or scripts\n' }));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /scanned 0 files/);
});
