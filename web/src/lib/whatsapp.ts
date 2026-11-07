import { BUSINESS } from '../data/business';

/** Message texts carried over from the old page's wa.me links. */
export const WA_TEXT: { book: string; enquire: string; findUs: string } = {
  book: "Hi, I'd like to book a service slot.",
  enquire: "Hi, I'd like to enquire about your caravan services.",
  findUs: "Hi, I'd like to book a time to bring in my caravan.",
};

/** Plain wa.me link. Throws RangeError unless number is 8 to 15 digits. */
export function waUrl(text?: string, number: string = BUSINESS.whatsappNumber): string {
  if (!/^\d{8,15}$/.test(number)) {
    throw new RangeError(`Invalid WhatsApp number: ${number}`);
  }
  const base = `https://wa.me/${number}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
