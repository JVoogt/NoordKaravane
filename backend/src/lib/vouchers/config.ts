import { z } from "@medusajs/framework/zod"
import { getBusinessConfig } from "../business"

export type VoucherProgram = {
  name: string
  value_zar: number
  min_spend_zar: number
  validity_days?: number
  ends_at?: string
  code_prefix: string
  monthly_cap: number
  enabled: boolean
}

const PROGRAM_NAME = /^[a-z0-9-]{1,40}$/

const programSchema = z.object({
  value_zar: z.number().int().positive(),
  min_spend_zar: z.number().int().positive(),
  validity_days: z.number().int().min(1).max(365).optional(),
  ends_at: z.string().datetime({ offset: true }).optional(),
  code_prefix: z.string().regex(/^[A-Z0-9]{1,8}$/),
  monthly_cap: z.number().int().min(1),
  enabled: z.boolean(),
})

/**
 * DD4. Validates business.json `voucher_programs`. An invalid entry is dropped with a reason in `errors`; never throws.
 * Unknown keys (such as `_note`) on a program are ignored.
 */
export function parseVoucherPrograms(raw: unknown): { programs: Record<string, VoucherProgram>; errors: string[] } {
  const programs: Record<string, VoucherProgram> = {}
  const errors: string[] = []
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { programs, errors }
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (name.startsWith("_")) continue
    if (!PROGRAM_NAME.test(name)) {
      errors.push(`${name}: invalid program name`)
      continue
    }
    const parsed = programSchema.safeParse(value)
    if (!parsed.success) {
      errors.push(`${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`)
      continue
    }
    const p = parsed.data
    const hasDays = p.validity_days !== undefined
    const hasEnd = p.ends_at !== undefined
    if (hasDays === hasEnd) {
      errors.push(`${name}: needs exactly one of validity_days or ends_at (got ${hasDays ? "both" : "neither"})`)
      continue
    }
    programs[name] = {
      name,
      value_zar: p.value_zar,
      min_spend_zar: p.min_spend_zar,
      ...(hasDays ? { validity_days: p.validity_days } : { ends_at: p.ends_at }),
      code_prefix: p.code_prefix,
      monthly_cap: p.monthly_cap,
      enabled: p.enabled,
    }
  }
  return { programs, errors }
}

/** Dropped-entry reasons already logged by this process (the config is cached per process, so once is enough). */
const loggedErrors = new Set<string>()

/** The enabled, valid program by name, else null (each invalid entry is logged once). Does not judge ends_at (RD3 is the service's). */
export function getVoucherProgram(name: string): VoucherProgram | null {
  const { programs, errors } = parseVoucherPrograms(getBusinessConfig().voucher_programs)
  for (const e of errors) {
    if (loggedErrors.has(e)) continue
    loggedErrors.add(e)
    console.error(`[vouchers] voucher_programs entry dropped: ${e}`)
  }
  const p = programs[name]
  return p && p.enabled ? p : null
}
