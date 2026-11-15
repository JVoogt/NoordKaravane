/**
 * Customer wording for the EFT window. Whole-day windows of three days or more read as days ("5 days"); anything
 * else stays in hours ("48 hours"), so the 48-hour wording, and the golden emails that hold it, are unchanged.
 */
export function windowText(hours: number): string {
  if (hours >= 72 && hours % 24 === 0) return `${hours / 24} days`
  return hours === 1 ? "1 hour" : `${hours} hours`
}

/** Time left before an unpaid order is released, for the reminder: "4 more days" from two days up, else hours. */
export function moreText(hours: number): string {
  if (hours >= 48) return `${Math.round(hours / 24)} more days`
  return hours === 1 ? "1 more hour" : `${hours} more hours`
}
