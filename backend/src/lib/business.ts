import fs from "fs"
import path from "path"
import fallback from "../config/business.json"

export type BusinessConfig = {
  brand: string
  domain: string
  tagline: string
  legal_name: string
  email_general: string
  email_orders: string
  whatsapp: string
  production_lead_time_days: string
  eft_payment_window_hours: number
  eft_reminder_after_hours: number
  bank: {
    account_name: string
    bank_name: string
    account_number: string
    branch_code: string
    account_type: string
  }
  shipping: {
    tier_weights_g: Record<"small" | "medium" | "bulky", number>
    pudo_max_weight_g: number
    pudo_locker_price_zar: number
    tcg_bands: { max_weight_g: number | null; price_zar: number }[]
    free_shipping_threshold_zar: number
    free_shipping_max_weight_g: number
    collect_from_workshop: boolean
  }
  dropship_suppliers: Record<string, { name: string; email: string }>
  /** Staff who get an email for every new and every paid order. Falls back to email_orders when unset, empty, or holding no usable address. */
  staff_order_alerts?: string | string[]
  /** Voucher programs keyed by name (see CONTRACTS.md, Vouchers). Validated by lib/vouchers/config.ts. */
  voucher_programs?: Record<string, unknown>
  [key: string]: unknown
}

let cached: BusinessConfig | null = null

/**
 * Reads config/business.json. Path comes from BUSINESS_CONFIG_PATH (default
 * ../config/business.json, relative to the process cwd). Falls back to the copy
 * bundled at src/config/business.json (keep it in sync: `cp config/business.json backend/src/config/`).
 * The fallback is logged (console.error, or console.warn for a missing default file), never thrown. Cached for the
 * life of the process: restart after editing the file.
 */
export function getBusinessConfig(): BusinessConfig {
  if (cached) return cached
  const p = path.resolve(process.cwd(), process.env.BUSINESS_CONFIG_PATH || "../config/business.json")
  try {
    cached = JSON.parse(fs.readFileSync(p, "utf8")) as BusinessConfig
  } catch (e: any) {
    // Never throw (that would take the shop down). A missing default file is normal in dev, so only warn then;
    // a file that fails to parse, or an explicit BUSINESS_CONFIG_PATH that is missing, is a real problem.
    const msg = `[business] could not load ${p} (${e?.message ?? e}); using the bundled src/config/business.json`
    if (e?.code === "ENOENT" && !process.env.BUSINESS_CONFIG_PATH) console.warn(msg)
    else console.error(msg)
    cached = fallback as unknown as BusinessConfig
  }
  return cached
}

export function siteUrl(): string {
  return (process.env.SITE_URL || "https://noordkaravane.co.za").replace(/\/$/, "")
}

/** Base URL of the Medusa admin (same env var the password-reset links use). */
export function adminUrl(): string {
  return (process.env.ADMIN_BACKEND_URL || "https://admin.noordkaravane.co.za").replace(/\/$/, "")
}

/**
 * Who gets staff order alerts: the usable values of staff_order_alerts; if none are usable (unset, empty, or only
 * blanks/placeholders/invalid values), the usable value of email_orders. Drops blanks, placeholders ({{...}},
 * REPLACE_ME) and anything without an @; dedupes case-insensitively. `dropped` names the non-blank, non-placeholder
 * values that were rejected as invalid (a typo), so the caller can log them. A string staff_order_alerts counts as
 * a one-item list; any other non-array value is named in `dropped`. Pure.
 */
export function staffAlertRecipientsWithDropped(cfg: Pick<BusinessConfig, "email_orders" | "staff_order_alerts">): {
  recipients: string[]
  dropped: string[]
} {
  const dropped: string[] = []
  const screen = (list: unknown[]) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of list) {
      // null/undefined count as blank; any other non-string (a number, an object) is a config mistake, named in dropped.
      if (raw != null && typeof raw !== "string") {
        dropped.push(JSON.stringify(raw))
        continue
      }
      const v = typeof raw === "string" ? raw.trim() : ""
      if (!v || v.includes("{{") || v.includes("REPLACE_ME")) continue
      if (!v.includes("@")) {
        dropped.push(v)
        continue
      }
      const key = v.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(v)
    }
    return out
  }
  // A single string is a one-item list; any other non-array value is a config mistake, named in dropped.
  const raw: unknown = cfg.staff_order_alerts
  let alerts: unknown[] = []
  if (Array.isArray(raw)) alerts = raw
  else if (typeof raw === "string") alerts = [raw]
  else if (raw != null) dropped.push(JSON.stringify(raw))
  const fromAlerts = screen(alerts)
  return { recipients: fromAlerts.length ? fromAlerts : screen([cfg.email_orders]), dropped }
}

/** Usable staff alert recipients (see staffAlertRecipientsWithDropped). */
export function staffAlertRecipients(cfg: Pick<BusinessConfig, "email_orders" | "staff_order_alerts">): string[] {
  return staffAlertRecipientsWithDropped(cfg).recipients
}

/**
 * Base URL of the storefront. The Astro app is served under /shop on the apex (everything else on the apex is the
 * static landing page), so ANY link to a storefront page must go through this, never bare siteUrl().
 * URL scheme (see CONTRACTS.md): /shop/<handle>/  /shop/cart  /shop/checkout  /shop/order/confirmed/<id>
 */
export function shopUrl(): string {
  return `${siteUrl()}/shop`
}

export function formatZar(amount: number): string {
  return `R${Number(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ")}`
}
