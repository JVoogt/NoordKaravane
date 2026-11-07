import { describe, expect, it } from 'vitest';
import { BUSINESS } from '../data/business';
import { WA_TEXT, waUrl } from './whatsapp';

describe('waUrl', () => {
  it('returns the bare number url without text', () => {
    expect(waUrl()).toBe('https://wa.me/27833349357');
  });

  it('reproduces the old book link verbatim (apostrophe unescaped)', () => {
    expect(waUrl("Hi, I'd like to book a service slot.")).toBe(
      "https://wa.me/27833349357?text=Hi%2C%20I'd%20like%20to%20book%20a%20service%20slot.",
    );
    expect(waUrl(WA_TEXT.book)).toBe(
      "https://wa.me/27833349357?text=Hi%2C%20I'd%20like%20to%20book%20a%20service%20slot.",
    );
  });

  it('reproduces the old enquire and find-us links verbatim', () => {
    expect(waUrl(WA_TEXT.enquire)).toBe(
      "https://wa.me/27833349357?text=Hi%2C%20I'd%20like%20to%20enquire%20about%20your%20caravan%20services.",
    );
    expect(waUrl(WA_TEXT.findUs)).toBe(
      "https://wa.me/27833349357?text=Hi%2C%20I'd%20like%20to%20book%20a%20time%20to%20bring%20in%20my%20caravan.",
    );
  });

  it('encodes newline and bullet', () => {
    expect(waUrl('a\nb')).toContain('a%0Ab');
    expect(waUrl('• x')).toContain('%E2%80%A2%20x');
  });

  it('escapes & # ? %', () => {
    const url = waUrl('a&b#c?d%e');
    expect(url).toBe('https://wa.me/27833349357?text=a%26b%23c%3Fd%25e');
  });

  it('throws RangeError for a bad number', () => {
    expect(() => waUrl('x', '12ab')).toThrow(RangeError);
    expect(() => waUrl('x', '1234567')).toThrow(RangeError);
    expect(() => waUrl('x', '1234567890123456')).toThrow(RangeError);
  });

  it('defaults the number to BUSINESS.whatsappNumber and accepts another valid one', () => {
    expect(waUrl()).toBe(`https://wa.me/${BUSINESS.whatsappNumber}`);
    expect(waUrl('x', '27820000000')).toBe('https://wa.me/27820000000?text=x');
  });
});
