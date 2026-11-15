/**
 * Customer wording for the EFT window (the backend emails use the same rule, backend/src/lib/duration.ts). Whole-day
 * windows of three days or more read as days ("5 days"); anything else stays in hours ("48 hours").
 */
export function windowText(hours: number): string {
  if (hours >= 72 && hours % 24 === 0) return `${hours / 24} days`;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
