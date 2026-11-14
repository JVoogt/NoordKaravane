// Pure WhatsApp message builder for the Home page ("Tell us what's going on"). No DOM, no astro:*.
// The page renders NEEDS as radio buttons; scripts/compose.ts calls composeMessage on every change.

export interface Need {
  /** Stable key for the need. Not rendered: the radio's value is the phrase, which is what the message needs. */
  id: string;
  /** Button label. */
  label: string;
  /** Completes the sentence "Hi, I'd like ...". */
  phrase: string;
}

export const NEEDS: readonly Need[] = Object.freeze([
  { id: 'service', label: 'A service', phrase: 'to book a service' },
  { id: 'repair', label: 'A repair', phrase: 'a quote on a repair' },
  { id: 'electrical', label: 'Electrical or solar', phrase: 'help with electrical or solar' },
  { id: 'lift-kit', label: 'A lift kit', phrase: 'a 50 mm lift kit fitted' },
  { id: 'not-sure', label: 'Not sure yet', phrase: "you to look at something, I'm not sure what it's called" },
]);

/** Longest make-and-year text carried into the message. */
export const VAN_MAX = 60;

/** The message for a need phrase and an optional make and year, as typed by the visitor. */
export function composeMessage(phrase: string, van = ''): string {
  // Cut on whole characters (code points), never through an emoji: half of one cannot be URL-encoded. Then drop
  // the full stops and spaces left at the end, so the sentence closes with one full stop and no space before it.
  const clean = [...van.replace(/\s+/g, ' ').trim()].slice(0, VAN_MAX).join('').replace(/[\s.]+$/, '');
  return `Hi, I'd like ${phrase}.${clean ? ` It's a ${clean}.` : ''} I can send a photo.`;
}
