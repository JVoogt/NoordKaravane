import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowText } from './duration.ts';
import { fillWith } from './fill.ts';

test('windowText: whole-day windows of three days or more read as days', () => {
  assert.equal(windowText(120), '5 days');
  assert.equal(windowText(72), '3 days');
});

test('windowText: 48 hours and other windows stay in hours', () => {
  assert.equal(windowText(48), '48 hours');
  assert.equal(windowText(24), '24 hours');
  assert.equal(windowText(100), '100 hours');
  assert.equal(windowText(1), '1 hour');
});

test('fillWith: {{dur:key}} renders a config number of hours as a duration', () => {
  assert.equal(fillWith('Pay within {{dur:eft_payment_window_hours}}.', { eft_payment_window_hours: 120 }), 'Pay within 5 days.');
  assert.equal(fillWith('Reminder after {{ dur:eft_reminder_after_hours }}.', { eft_reminder_after_hours: 24 }), 'Reminder after 24 hours.');
});

test('fillWith: a dur token on a non-number is left as written', () => {
  assert.equal(fillWith('{{dur:legal_name}}', { legal_name: 'X' }), '{{dur:legal_name}}');
});
