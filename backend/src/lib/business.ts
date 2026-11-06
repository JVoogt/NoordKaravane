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
  [key: string]: unknown
}

let cached: BusinessConfig | null = null

/**
 * Reads config/business.json. Path comes from BUSINESS_CONFIG_PATH (default
 * ../config/business.json, relative to the process cwd). Falls back to the copy
 * bundled at src/config/business.json (keep it in sync: `cp config/business.json backend/src/config/`).
 */
export function getBusinessConfig(): BusinessConfig {
  if (cached) return cached
  const p = path.resolve(process.cwd(), process.env.BUSINESS_CONFIG_PATH || "../config/business.json")
  try {
    cached = JSON.parse(fs.readFileSync(p, "utf8")) as BusinessConfig
  } catch {
    cached = fallback as unknown as BusinessConfig
  }
  return cached
}

export function siteUrl(): string {
  return (process.env.SITE_URL || "https://noordkaravane.co.za").replace(/\/$/, "")
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
