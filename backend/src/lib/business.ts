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
  legal_status: string
  registration_number: string
  vat_number: string
  physical_address: string
  email_privacy: string
  information_officer: string
  /** Other storefront brands selling NK's catalogue, keyed by brand. Validated by kampiBrandConfig. */
  brands?: { kampi?: KampiBrandConfig }
  [key: string]: unknown
}

export type BrandKey = "nk" | "kampi"
export type BrandPalette = { ink: string; paper: string; accent: string; muted: string }
export type Brand = {
  key: BrandKey
  name: string
  shopUrl: string
  logoUrl: string | null
  palette: BrandPalette
  fromName: string
  sellerLine: string | null
}
export type KampiBrandConfig = {
  sales_channel_ids: string[]
  name: string
  shop_url: string
  logo_url?: string | null
  palette: BrandPalette
  from_name: string
  tagline?: string
  whatsapp?: string
  instagram?: string
  facebook?: string
}

export const NK_PALETTE: BrandPalette = { ink: "#0e0f11", paper: "#ebe6dd", accent: "#e95e1d", muted: "#5f594d" }

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
 * With a sales channel id it is that channel's brand's shop URL (brandFor), e.g. the Kampi store at its root.
 */
export function shopUrl(salesChannelId?: string | null): string {
  if (!salesChannelId) return `${siteUrl()}/shop`
  return brandFor(salesChannelId).shopUrl
}

/** The trimmed string when v is a non-blank string holding neither {{ nor REPLACE_ME; otherwise null. Pure. */
export function usableValue(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  if (!t || t.includes("{{") || t.includes("REPLACE_ME")) return null
  return t
}

let kampiInvalidLogged = false
const optionalIgnoredLogged = new Set<string>()

/** The brands.kampi error line, once per process (missing, invalid ids, or an invalid required key). */
function logKampiInvalid(reason: string) {
  if (kampiInvalidLogged) return
  kampiInvalidLogged = true
  console.error(`[business] brands.kampi invalid: ${reason}; Kampi orders use NK branding`)
}

/** An optional display key that is blank or a placeholder is dropped; warned once per key per process. */
function warnOptionalIgnored(key: string) {
  if (optionalIgnoredLogged.has(key)) return
  optionalIgnoredLogged.add(key)
  console.warn(`[business] brands.kampi.${key} ignored: blank or placeholder`)
}

const HEX = /^#[0-9a-fA-F]{6}$/
const CHANNEL_ID = /^sc_[A-Za-z0-9]+$/
const OPTIONAL_TEXT = ["tagline", "whatsapp", "instagram", "facebook"] as const

function httpsUrl(v: unknown): string | null {
  const s = usableValue(v)
  if (!s || !s.startsWith("https://")) return null
  try {
    new URL(s)
  } catch {
    return null
  }
  return s.replace(/\/+$/, "")
}

/** Why a brands.kampi block is unusable, or the normalised block. */
function checkKampiBlock(raw: unknown): { ok: KampiBrandConfig } | { reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "not an object" }
  const r = raw as Record<string, unknown>
  const ids = r.sales_channel_ids
  if (!Array.isArray(ids) || !ids.length) return { reason: "sales_channel_ids must be a non-empty list" }
  for (const id of ids) if (usableValue(id) === null || !CHANNEL_ID.test(String(id).trim())) return { reason: `sales_channel_ids has an unusable id ${JSON.stringify(id)}` }
  const name = usableValue(r.name)
  if (!name) return { reason: "name is missing or a placeholder" }
  const from_name = usableValue(r.from_name)
  if (!from_name) return { reason: "from_name is missing or a placeholder" }
  const shop_url = httpsUrl(r.shop_url)
  if (!shop_url) return { reason: "shop_url must be an https:// URL" }
  let logo_url: string | null = null
  if (r.logo_url != null && usableValue(r.logo_url) === null) warnOptionalIgnored("logo_url")
  else if (r.logo_url != null) {
    logo_url = httpsUrl(r.logo_url)
    if (!logo_url) return { reason: "logo_url must be an https:// URL or null" }
  }
  const pal = r.palette as Record<string, unknown> | undefined
  if (!pal || typeof pal !== "object") return { reason: "palette is missing" }
  for (const k of ["ink", "paper", "accent", "muted"] as const)
    if (typeof pal[k] !== "string" || !HEX.test(pal[k] as string)) return { reason: `palette.${k} must be #rrggbb` }
  const ok: KampiBrandConfig = {
    sales_channel_ids: ids.map((id) => String(id).trim()),
    name,
    shop_url,
    logo_url,
    palette: { ink: pal.ink as string, paper: pal.paper as string, accent: pal.accent as string, muted: pal.muted as string },
    from_name,
  }
  for (const k of OPTIONAL_TEXT) {
    if (r[k] == null) continue
    const v = usableValue(r[k])
    if (v) ok[k] = v
    else warnOptionalIgnored(k)
  }
  return { ok }
}

/** The raw brands.kampi value, or a thrown-read marker (logged). */
function rawKampiBlock(cfg?: BusinessConfig): { raw: unknown } | null {
  try {
    return { raw: (cfg ?? getBusinessConfig()).brands?.kampi }
  } catch (e: any) {
    console.error(`[business] could not read brands.kampi (${e?.message ?? e}); Kampi orders use NK branding`)
    return null
  }
}

/**
 * The validated brands.kampi block, or null when it is missing or invalid (either logged once per process with
 * console.error; Kampi orders then use NK branding). A blank or placeholder optional display key (tagline, whatsapp,
 * instagram, facebook, logo_url) is dropped with a one-time warn and never invalidates the block. Never throws.
 * cfg defaults to getBusinessConfig().
 */
export function kampiBrandConfig(cfg?: BusinessConfig): KampiBrandConfig | null {
  const read = rawKampiBlock(cfg)
  if (!read) return null
  if (read.raw === undefined) {
    logKampiInvalid("missing")
    return null
  }
  const res = checkKampiBlock(read.raw)
  if ("ok" in res) return res.ok
  logKampiInvalid(res.reason)
  return null
}

/**
 * The configured Kampi sales channel ids (brands.kampi.sales_channel_ids), validated on their own: the styling keys
 * do not matter here, so behaviour that depends only on the channel (product auto-link, staff channel label, CAPI)
 * keeps working when a display key is broken. Empty (and logged once) when the block is missing or any id is
 * unusable. Never throws.
 */
export function kampiChannelIds(cfg?: BusinessConfig): string[] {
  const read = rawKampiBlock(cfg)
  if (!read) return []
  if (read.raw === undefined) {
    logKampiInvalid("missing")
    return []
  }
  const ids = (read.raw as Record<string, unknown> | null)?.sales_channel_ids
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => usableValue(id) === null || !CHANNEL_ID.test(String(id).trim()))) {
    logKampiInvalid(`sales_channel_ids has no usable list of sc_ ids`)
    return []
  }
  return ids.map((id) => String(id).trim())
}

/**
 * Which store an order's sales channel belongs to, from the real channel: the store's default channel is NK's own,
 * a configured Kampi id (kampiChannelIds) is Kampi, anything else (including a missing id or an unknown default) is
 * unknown. Pure apart from the cfg default.
 */
export function orderChannel(
  salesChannelId: string | null | undefined,
  defaultChannelId: string | null | undefined,
  cfg?: BusinessConfig
): "nk" | "kampi" | "unknown" {
  if (!salesChannelId) return "unknown"
  if (defaultChannelId && salesChannelId === defaultChannelId) return "nk"
  if (kampiChannelIds(cfg).includes(salesChannelId)) return "kampi"
  return "unknown"
}

function nkBrand(): Brand {
  return { key: "nk", name: "Noord Karavane", shopUrl: `${siteUrl()}/shop`, logoUrl: null, palette: NK_PALETTE, fromName: "Noord Karavane", sellerLine: null }
}

function kampiBrand(k: KampiBrandConfig, cfg: BusinessConfig): Brand {
  const seller = usableValue(cfg.legal_name) ?? usableValue(cfg.brand) ?? "Noord Karavane"
  return {
    key: "kampi",
    name: k.name,
    shopUrl: k.shop_url,
    logoUrl: k.logo_url ?? null,
    palette: k.palette,
    fromName: k.from_name,
    sellerLine: `${k.name}, sold and fulfilled by ${seller}`,
  }
}

/**
 * The brand an order on this sales channel is sold under: Kampi iff a valid brands.kampi lists the id. Never throws.
 * Styling only: behaviour (CAPI, staff channel label, auto-link) decides from the real channel (orderChannel,
 * kampiChannelIds), and an order on an unknown channel is warned where the store default is known (staff label, CAPI).
 */
export function brandFor(salesChannelId: string | null | undefined, cfg?: BusinessConfig): Brand {
  try {
    if (!salesChannelId) return nkBrand()
    const c = cfg ?? getBusinessConfig()
    const k = kampiBrandConfig(c)
    return k && k.sales_channel_ids.includes(salesChannelId) ? kampiBrand(k, c) : nkBrand()
  } catch (e: any) {
    console.error(`[business] brandFor(${salesChannelId}) failed (${e?.message ?? e}); using NK branding`)
    return nkBrand()
  }
}

/** The brand for a stored key (EmailData.brand). Kampi needs a valid brands.kampi; anything else is NK. Never throws. */
export function brandByKey(key: BrandKey | null | undefined, cfg?: BusinessConfig): Brand {
  try {
    if (key !== "kampi") return nkBrand()
    const c = cfg ?? getBusinessConfig()
    const k = kampiBrandConfig(c)
    return k ? kampiBrand(k, c) : nkBrand()
  } catch (e: any) {
    console.error(`[business] brandByKey(${key}) failed (${e?.message ?? e}); using NK branding`)
    return nkBrand()
  }
}

export function formatZar(amount: number): string {
  return `R${Number(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ")}`
}
