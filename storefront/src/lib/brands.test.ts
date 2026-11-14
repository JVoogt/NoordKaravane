import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_IDENTITY_KEYS, STORE_BRANDS, mergeBrandDisplay, resolveBrandKey } from './brands.ts';

test('resolveBrandKey: unset is nk, kampi is kampi', () => {
  assert.equal(resolveBrandKey(undefined), 'nk');
  assert.equal(resolveBrandKey('nk'), 'nk');
  assert.equal(resolveBrandKey('kampi'), 'kampi');
});
test('resolveBrandKey: any other value throws the DD6 message', () => {
  assert.throws(() => resolveBrandKey('KAMPI'), { message: 'Unknown BRAND "KAMPI" (expected nk or kampi)' });
  assert.throws(() => resolveBrandKey('x'), { message: 'Unknown BRAND "x" (expected nk or kampi)' });
});

test('STORE_BRANDS.nk reproduces the NK literals exactly (DD7)', () => {
  assert.deepEqual(STORE_BRANDS.nk, {
    key: 'nk', siteName: 'Noord Karavane', titleSuffix: 'Noord Karavane', themeColor: '#0e0f11',
    logo: { header: '/logo-transparent.png', footer: '/logo-white.png', alt: 'Noord Karavane' },
    icon192: '/icon-192.png', appleTouchIcon: '/apple-touch-icon.png', ogDefault: '/og-default.png',
    landing: { href: '/', label: 'Workshop & servicing' }, newsletter: true, whatsappGreeting: 'Hi Noord Karavane! ', showSellerLine: false,
    tagline: null, heroFeature: null,
  });
});

const LEGAL = {
  legal_name: 'Example Trading (Pty) Ltd', legal_status: 'Private company', registration_number: '2000/000000/07', vat_number: '4000000000',
  physical_address: '1 Example Street', postal_address: 'PO Box 1', information_officer: 'A. Person', email_privacy: 'privacy@example.test',
};
const cfg = (kampi: Record<string, unknown>) => ({
  brand: 'Example', whatsapp: '27000000000', instagram: 'https://instagram.com/nk-example', facebook: 'https://facebook.com/nk-example', tagline: 'NK tagline',
  ...LEGAL,
  brands: { kampi: { ...kampi } },
});

test('the legal identity key list is the DD7 list', () => {
  assert.deepEqual([...LEGAL_IDENTITY_KEYS], ['legal_name', 'legal_status', 'registration_number', 'vat_number', 'physical_address', 'postal_address', 'information_officer', 'email_privacy']);
});

test('mergeBrandDisplay never changes a legal identity value, for either brand (P4)', () => {
  // A block that tries to override every legal key: none of them may move.
  const hostile = Object.fromEntries(LEGAL_IDENTITY_KEYS.map((k) => [k, `OVERRIDE ${k}`]));
  for (const key of ['nk', 'kampi'] as const) {
    const out = mergeBrandDisplay(cfg(hostile), key);
    for (const k of LEGAL_IDENTITY_KEYS) assert.equal(out[k], LEGAL[k], `${key} ${k}`);
  }
});

test('mergeBrandDisplay applies the Kampi whatsapp, socials and tagline for kampi only', () => {
  const kampi = { whatsapp: '27111111111', instagram: 'https://instagram.com/kampi-example', facebook: 'https://facebook.com/kampi-example', tagline: 'Kampi tagline' };
  const k = mergeBrandDisplay(cfg(kampi), 'kampi');
  assert.equal(k.whatsapp, '27111111111');
  assert.equal(k.instagram, 'https://instagram.com/kampi-example');
  assert.equal(k.facebook, 'https://facebook.com/kampi-example');
  assert.equal(k.tagline, 'Kampi tagline');
  const n = mergeBrandDisplay(cfg(kampi), 'nk');
  assert.equal(n.whatsapp, '27000000000');
  assert.equal(n.tagline, 'NK tagline');
});

test('mergeBrandDisplay returns the nk input unchanged (same object)', () => {
  const b = cfg({ whatsapp: '27111111111' });
  assert.equal(mergeBrandDisplay(b, 'nk'), b);
});

test('mergeBrandDisplay ignores placeholder, REPLACE_ME, blank and non-string overrides', () => {
  const k = mergeBrandDisplay(cfg({ whatsapp: '{{X}}', instagram: 'REPLACE_ME', facebook: '   ', tagline: 42 }), 'kampi');
  assert.equal(k.whatsapp, '27000000000');
  assert.equal(k.instagram, 'https://instagram.com/nk-example');
  assert.equal(k.facebook, 'https://facebook.com/nk-example');
  assert.equal(k.tagline, 'NK tagline');
});

test('mergeBrandDisplay with no brands block leaves kampi values as they are', () => {
  const b = { whatsapp: '27000000000', ...LEGAL };
  assert.deepEqual(mergeBrandDisplay(b, 'kampi'), b);
});
