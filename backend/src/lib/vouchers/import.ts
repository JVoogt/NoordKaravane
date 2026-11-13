/**
 * Cutover import planner (pure). Rows come from the Woo REST coupon export, copied as exported apart from the key
 * renames (see CONTRACTS.md, Vouchers): amount -> value_zar, minimum_amount -> min_spend_zar, date_expires_gmt + "Z"
 * -> ends_at, plus `program`. Per row, in this fixed order:
 *   1. parse: a non-empty code and an ISO ends_at with an offset or Z, else rejected
 *   2. used check: usage_count must be the integer 0, else rejected (whatever the expiry)
 *   3. expiry skip: ends_at <= now goes to skipped_expired and no other check runs
 *   4. full validation of every live row: a single-use fixed-cart coupon with a minimum spend and no restriction
 * Every rejected row is collected and thrown together in ImportRejectedError. Nothing is ever coerced.
 */

export type ImportRow = {
  code: string
  program: string
  discount_type: "fixed_cart"
  value_zar: number
  min_spend_zar: number
  usage_limit: 1
  usage_limit_per_user?: number | null
  usage_count: 0
  ends_at: string
  product_ids?: number[]
  excluded_product_ids?: number[]
  product_categories?: number[]
  excluded_product_categories?: number[]
  email_restrictions?: string[]
  free_shipping?: boolean
  exclude_sale_items?: boolean
  maximum_amount?: null
  limit_usage_to_x_items?: number | null
}

export type ImportRejection = { index: number; code: string | null; reason: string }

export class ImportRejectedError extends Error {
  rejections: ImportRejection[]
  constructor(rejections: ImportRejection[]) {
    super(`import rejected ${rejections.length} row(s): ` + rejections.map((r) => `#${r.index} ${r.code ?? "(no code)"}: ${r.reason}`).join(" | "))
    this.rejections = rejections
  }
}

const KEYS = new Set([
  "code",
  "program",
  "discount_type",
  "value_zar",
  "min_spend_zar",
  "usage_limit",
  "usage_limit_per_user",
  "usage_count",
  "ends_at",
  "product_ids",
  "excluded_product_ids",
  "product_categories",
  "excluded_product_categories",
  "email_restrictions",
  "free_shipping",
  "exclude_sale_items",
  "maximum_amount",
  "limit_usage_to_x_items",
])
const EMPTY_LIST_KEYS = ["product_ids", "excluded_product_ids", "product_categories", "excluded_product_categories", "email_restrictions"] as const
const FALSE_KEYS = ["free_shipping", "exclude_sale_items"] as const
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const SAST_OFFSET_MS = 2 * 3_600_000

/** A whole rand amount from a JSON integer or a zero-fraction decimal string ("50", "50.00"); else null. */
function wholeRand(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null
  if (typeof v === "string" && /^\d+(\.0+)?$/.test(v)) return parseInt(v, 10)
  return null
}

/** Woo "no cap": missing, null, 0, "" or a zero decimal string. */
function isNoCap(v: unknown): boolean {
  return v === undefined || v === null || v === 0 || v === "" || (typeof v === "string" && /^0+(\.0+)?$/.test(v))
}

function liveRowProblems(r: Record<string, unknown>): string[] {
  const p: string[] = []
  for (const k of Object.keys(r)) if (!KEYS.has(k) && r[k] !== undefined) p.push(`unknown key ${k}`)
  if (r.discount_type !== "fixed_cart") p.push(`discount_type must be fixed_cart (got ${JSON.stringify(r.discount_type)})`)
  if (r.usage_limit !== 1) p.push(`usage_limit must be 1 (got ${JSON.stringify(r.usage_limit)})`)
  if (r.usage_limit_per_user !== undefined && r.usage_limit_per_user !== null && r.usage_limit_per_user !== 1)
    p.push(`usage_limit_per_user must be null or 1 (got ${JSON.stringify(r.usage_limit_per_user)})`)
  const value = wholeRand(r.value_zar)
  if (value === null || value < 1) p.push(`value_zar must be a positive whole rand amount (got ${JSON.stringify(r.value_zar)})`)
  const min = wholeRand(r.min_spend_zar)
  if (min === null || min < 1) p.push(`min_spend_zar must be a whole rand amount of at least 1 (got ${JSON.stringify(r.min_spend_zar)})`)
  if (typeof r.program !== "string" || !/^[a-z0-9-]{1,40}$/.test(r.program)) p.push(`program must match ^[a-z0-9-]{1,40}$ (got ${JSON.stringify(r.program)})`)
  if (!/^[A-Z0-9-]+$/.test(String(r.code).toUpperCase())) p.push("code must match ^[A-Z0-9-]+$ after uppercasing")
  for (const k of EMPTY_LIST_KEYS) {
    const v = r[k]
    if (v !== undefined && !(Array.isArray(v) && v.length === 0)) p.push(`${k} must be empty`)
  }
  for (const k of FALSE_KEYS) if (r[k] !== undefined && r[k] !== false) p.push(`${k} must be false`)
  if (!isNoCap(r.maximum_amount)) p.push(`maximum_amount must be no cap (got ${JSON.stringify(r.maximum_amount)})`)
  if (r.limit_usage_to_x_items !== undefined && r.limit_usage_to_x_items !== null && r.limit_usage_to_x_items !== 0)
    p.push(`limit_usage_to_x_items must be null or 0 (got ${JSON.stringify(r.limit_usage_to_x_items)})`)
  return p
}

function sastDate(d: Date): string {
  return new Date(d.getTime() + SAST_OFFSET_MS).toISOString().slice(0, 10)
}

export function planImport(
  rows: unknown,
  existingCodes: Set<string>,
  now: Date
): { campaigns: { campaign_identifier: string; ends_at: Date; rows: ImportRow[] }[]; skipped_existing: string[]; skipped_expired: string[] } {
  if (!Array.isArray(rows)) throw new ImportRejectedError([{ index: -1, code: null, reason: "the import file must hold a JSON array of rows" }])
  const rejected: ImportRejection[] = []
  const skipped_expired: string[] = []
  const live: { index: number; row: ImportRow }[] = []
  const seen = new Map<string, number>()

  rows.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return rejected.push({ index, code: null, reason: "row is not an object" })
    const r = raw as Record<string, unknown>
    // 1. parse
    if (typeof r.code !== "string" || !r.code.trim()) return rejected.push({ index, code: null, reason: "code is missing" })
    const code = r.code.trim().toUpperCase()
    const endsAt = typeof r.ends_at === "string" && ISO_WITH_OFFSET.test(r.ends_at) ? new Date(r.ends_at) : null
    if (!endsAt || Number.isNaN(endsAt.getTime()))
      return rejected.push({ index, code, reason: `ends_at must be an ISO datetime with an offset or Z (got ${JSON.stringify(r.ends_at)})` })
    // 2. used check, every row
    if (r.usage_count !== 0)
      return rejected.push({ index, code, reason: `coupon is used or its usage_count is unknown (usage_count ${JSON.stringify(r.usage_count)})` })
    // 3. expiry skip
    if (endsAt.getTime() <= now.getTime()) return skipped_expired.push(code)
    // 4. full validation
    const problems = liveRowProblems(r)
    if (problems.length) return rejected.push({ index, code, reason: problems.join("; ") })
    const first = seen.get(code)
    if (first !== undefined) return rejected.push({ index, code, reason: `duplicate code (same as row ${first})` })
    seen.set(code, index)
    const normalised: Record<string, unknown> = { ...r, code, value_zar: wholeRand(r.value_zar), min_spend_zar: wholeRand(r.min_spend_zar) }
    if ("maximum_amount" in r) normalised.maximum_amount = null
    live.push({ index, row: normalised as ImportRow })
  })

  if (rejected.length) throw new ImportRejectedError(rejected)

  const skipped_existing: string[] = []
  const groups = new Map<string, { campaign_identifier: string; ends_at: Date; rows: ImportRow[] }>()
  for (const { row } of live) {
    if (existingCodes.has(row.code)) {
      skipped_existing.push(row.code)
      continue
    }
    const endsAt = new Date(row.ends_at)
    const id = `${row.program}-${sastDate(endsAt)}`
    const g = groups.get(id)
    if (!g) groups.set(id, { campaign_identifier: id, ends_at: endsAt, rows: [row] })
    else {
      g.rows.push(row)
      if (endsAt.getTime() > g.ends_at.getTime()) g.ends_at = endsAt
    }
  }
  return { campaigns: [...groups.values()], skipped_existing, skipped_expired }
}

/** The new ends_at for an existing import campaign: the planned end when it is later, else null (never shorten). */
export function campaignEndsAtUpdate(existing: Date, planned: Date): Date | null {
  return planned.getTime() > existing.getTime() ? planned : null
}
