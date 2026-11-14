import type { VoucherProgram } from "./config"

/** Africa/Johannesburg is UTC+2 all year (no DST), RD1. */
const SAST_OFFSET_MS = 2 * 3_600_000
const DAY_MS = 86_400_000

/** Issue month `YYYY-MM` in SAST. */
export function sastMonth(d: Date): string {
  return new Date(d.getTime() + SAST_OFFSET_MS).toISOString().slice(0, 7)
}

/**
 * DD6. Campaign `${program}-${YYYY-MM}` (SAST issue month). ends_at = the fixed program end, else the first instant
 * of the next SAST month + validity_days days - 1 ms.
 */
export function cohortFor(program: VoucherProgram, now: Date): { campaign_identifier: string; ends_at: Date } {
  const month = sastMonth(now)
  const campaign_identifier = `${program.name}-${month}`
  if (program.ends_at) return { campaign_identifier, ends_at: new Date(program.ends_at) }
  const [y, m] = month.split("-").map(Number)
  // Date.UTC(y, m, 1) is the 1st of the NEXT month (m is 1-based here, 0-based there); shift to SAST midnight.
  const nextMonthStart = Date.UTC(y, m, 1) - SAST_OFFSET_MS
  return { campaign_identifier, ends_at: new Date(nextMonthStart + (program.validity_days ?? 0) * DAY_MS - 1) }
}
