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
// Token checks resolve against the repo's real example config unless a test overrides the path.
const EXAMPLE = join(HERE, '../../config/business.example.json');
function run(root, extraEnv = {}) {
  const env = { ...process.env, GUARD_ROOT: root, GUARD_BUSINESS_EXAMPLE: EXAMPLE, ...extraEnv };
  const r = spawnSync(process.execPath, [GUARD], { env, encoding: 'utf8' });
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

test('fails when src/lib/brands.ts exists but its STORE_BRANDS kampi block is not found (no silent self-disable)', () => {
  for (const [name, body] of [
    ['no STORE_BRANDS', 'export const BRANDS = {\n  kampi: {\n    tagline: \'x\',\n  },\n};\n'],
    ['no kampi block', 'export const STORE_BRANDS = {\n  nk: {\n    tagline: \'x\',\n  },\n};\n'],
  ]) {
    const r = run(tree({ ...clean, 'src/lib/brands.ts': body }));
    assert.notEqual(r.code, 0, name);
    assert.match(r.out, /src\/lib\/brands\.ts: .*kampi block/, name);
  }
});

// REM-FIX 5: every {{...}} token in Kampi content and components resolves against config/business.example.json.
test('passes when every Kampi token resolves (zar to a number, plain to a scalar); Astro object literals are not tokens', () => {
  const r = run(tree({
    ...clean,
    'src/content/kampi/legal/terms.md': 'Sold by {{legal_name}}, {{ workshop.city }}. Free over {{zar:shipping.free_shipping_threshold_zar}}, from {{zar:shipping.tcg_bands.0.price_zar}}.\n',
    'src/components/kampi/X.astro': '<div style={{ color: "red" }}>{{eft_payment_window_hours}}</div>\n',
  }));
  assert.equal(r.code, 0, r.out);
});

for (const [name, where, text, why] of [
  ['an unknown key in Kampi content', 'src/content/kampi/legal/terms.md', 'Hi {{no_such.key}}.', /unresolved token \{\{no_such\.key\}\}/],
  ['a zar token on a string', 'src/content/kampi/pages/shipping.md', 'Free over {{zar:legal_name}}.', /\{\{zar:legal_name\}\} is not a number/],
  ['a plain token on an object', 'src/components/kampi/Footer.astro', '<p>{{shipping}}</p>', /unresolved token \{\{shipping\}\}/],
  ['an unknown key in Kampi brand copy', 'src/brands/kampi/copy.ts', "export const a = '{{nope}}';", /unresolved token \{\{nope\}\}/],
]) {
  test(`fails on ${name}`, () => {
    const r = run(tree({ ...clean, [where]: `x\n${text}\n` }));
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`${where.replace(/[./]/g, '\\$&')}:2: `));
    assert.match(r.out, why);
  });
}

test('NK content tokens are not checked against the example (NK fills its own keys today)', () => {
  assert.equal(run(tree({ ...clean, 'src/content/pages/about.md': 'Hi {{no_such.key}}.\n' })).code, 0);
});

test('fails closed when config/business.example.json cannot be read', () => {
  const r = run(tree(clean), { GUARD_BUSINESS_EXAMPLE: '/nonexistent/business.example.json' });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /business\.example\.json/);
});

test('fails when it scanned zero files', () => {
  const r = run(tree({ 'README.txt': 'nothing under src, public or scripts\n' }));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /scanned 0 files/);
});
