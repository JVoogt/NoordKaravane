import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makerBrand } from './maker.ts';

test('names the maker from the first word of the title', () => {
  assert.equal(makerBrand('Victron Orion XS DC-DC battery charger'), 'Victron Energy');
  assert.equal(makerBrand('Renogy Rover Li 30A MPPT Solar Charge Controller'), 'Renogy');
});

test('returns null for unknown or empty titles so the shop brand is used', () => {
  assert.equal(makerBrand('Window rubber seal'), null);
  assert.equal(makerBrand(undefined), null);
});
