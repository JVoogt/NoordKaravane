import { describe, expect, it } from 'vitest';
import { composeMessage, NEEDS, VAN_MAX } from './compose';

describe('composeMessage', () => {
  it('builds the default message with no make and year', () => {
    expect(composeMessage('to book a service')).toBe("Hi, I'd like to book a service. I can send a photo.");
  });

  it('adds the make and year as its own sentence, trimmed', () => {
    expect(composeMessage('a quote on a repair', '  Jurgens Exclusive, 2014 ')).toBe(
      "Hi, I'd like a quote on a repair. It's a Jurgens Exclusive, 2014. I can send a photo.",
    );
  });

  it('treats a blank make and year as none', () => {
    expect(composeMessage('a 50 mm lift kit fitted', '   ')).toBe("Hi, I'd like a 50 mm lift kit fitted. I can send a photo.");
  });

  it('collapses line breaks and runs of spaces typed or pasted into the field', () => {
    expect(composeMessage('to book a service', 'Sprite\n  Scenic\t2019')).toBe(
      "Hi, I'd like to book a service. It's a Sprite Scenic 2019. I can send a photo.",
    );
  });

  it('does not double the full stop when the visitor ends with one', () => {
    expect(composeMessage('to book a service', 'Gypsey Regal 1998.')).toBe(
      "Hi, I'd like to book a service. It's a Gypsey Regal 1998. I can send a photo.",
    );
  });

  it('caps a very long make and year', () => {
    const long = 'x'.repeat(200);
    const msg = composeMessage('to book a service', long);
    expect(VAN_MAX).toBe(60);
    expect(msg).toBe(`Hi, I'd like to book a service. It's a ${'x'.repeat(60)}. I can send a photo.`);
  });

  it('caps on whole characters: an emoji at the limit is kept whole or dropped, never cut in half', () => {
    // 59 letters and two emoji (two UTF-16 units each). The cap is 60 characters: the first emoji stays, whole.
    const msg = composeMessage('to book a service', `${'x'.repeat(59)}\u{1F600}\u{1F600}`);
    expect(msg).toBe(`Hi, I'd like to book a service. It's a ${'x'.repeat(59)}\u{1F600}. I can send a photo.`);
    // A half emoji (a lone surrogate) cannot be URL-encoded: the Send link would throw.
    expect(() => encodeURIComponent(msg)).not.toThrow();
  });

  it('leaves no space before the full stop when the visitor types one after a space', () => {
    expect(composeMessage('to book a service', 'Jurgens .')).toBe("Hi, I'd like to book a service. It's a Jurgens. I can send a photo.");
  });

  it('leaves no space before the full stop when the cap lands on a space', () => {
    const msg = composeMessage('to book a service', `${'x'.repeat(59)} Exclusive`);
    expect(msg).toBe(`Hi, I'd like to book a service. It's a ${'x'.repeat(59)}. I can send a photo.`);
  });

  it('treats a make and year of only full stops and spaces as none', () => {
    expect(composeMessage('to book a service', ' . .. ')).toBe("Hi, I'd like to book a service. I can send a photo.");
  });
});

describe('NEEDS', () => {
  it('lists the five choices in page order, the service first (the default)', () => {
    expect(NEEDS.map((n) => n.label)).toEqual(['A service', 'A repair', 'Electrical or solar', 'A lift kit', 'Not sure yet']);
    expect(NEEDS.map((n) => n.id)).toEqual(['service', 'repair', 'electrical', 'lift-kit', 'not-sure']);
  });

  it('gives every choice a phrase that completes "Hi, I\'d like ..."', () => {
    expect(NEEDS.map((n) => n.phrase)).toEqual([
      'to book a service',
      'a quote on a repair',
      'help with electrical or solar',
      'a 50 mm lift kit fitted',
      "you to look at something, I'm not sure what it's called",
    ]);
  });

  it('states no price (prices live in data/pricing only)', () => {
    for (const n of NEEDS) expect(`${n.label} ${n.phrase}`).not.toMatch(/R\s?\d/);
  });
});
