import { brandByKey, getBusinessConfig, kampiBrandConfig, siteUrl, usableValue, type Brand, type BrandKey } from "../../lib/business"

/**
 * Branded, table-based HTML emails (inline styles only, for email clients).
 * Palette: ink #0e0f11, paper #ebe6dd, workshop orange #e95e1d (matches the noordkaravane.co.za landing page).
 * Voice: plain, practical, friendly. Caravan people, not corporate.
 */
const C = { black: "#0e0f11", cream: "#ebe6dd", moss: "#ff7a3b", earth: "#5f594d", wine: "#e95e1d" }
const SERIF = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif"
const SANS = "'Barlow', Helvetica, Arial, sans-serif"
const KAMPI_SANS = "'Montserrat', Helvetica, Arial, sans-serif"

type Colors = typeof C

/** Email colours for a brand: today's literal C for NK; for another brand, its configured palette. */
export function emailColors(brand: Brand): Colors {
  if (brand.key === "nk") return C
  const p = brand.palette
  return { black: p.ink, cream: p.paper, moss: p.paper, earth: p.muted, wine: p.accent }
}

/** Everything a template needs to dress itself for a brand. onAccent is the text colour on an accent button. */
type Theme = { brand: Brand; c: Colors; display: string; body: string; onAccent: string }

function theme(brand: Brand): Theme {
  const c = emailColors(brand)
  return brand.key === "nk"
    ? { brand, c, display: SERIF, body: SANS, onAccent: C.black }
    : { brand, c, display: KAMPI_SANS, body: KAMPI_SANS, onAccent: c.cream }
}

export type EmailItem = { title: string; quantity: number; variant?: string; total?: string; sku?: string }
export type EmailData = {
  display_id?: string | number
  reference?: string
  first_name?: string
  items?: EmailItem[]
  total?: string
  shipping_total?: string
  shipping_method?: string
  pudo_locker?: string
  tracking_number?: string
  tracking_url?: string
  carrier?: string
  hours_left?: number
  supplier?: string
  ship_to?: string
  supplier_items?: { title: string; variant?: string; sku?: string; quantity: number }[]
  order_url?: string
  reset_url?: string
  // staff alerts only
  customer_email?: string
  customer_phone?: string
  ship_to_lines?: string[]
  payment_method?: string
  payment_captured?: boolean
  collect_from_workshop?: boolean
  admin_order_url?: string
  dropship_items?: { supplier: string; title: string; variant?: string; sku?: string; quantity: number }[]
  /** Lines matching a dropship supplier whose email is unusable: the supplier was NOT emailed. */
  dropship_unnotified?: { supplier: string; title: string; variant?: string; sku?: string; quantity: number }[]
  /** Reply-To override for the SMTP provider (staff alerts reply to the customer). */
  reply_to?: string
  // staff-payment-no-order only
  payment_id?: string
  payment_amount?: string
  payment_provider?: string
  admin_url?: string
  /** Customer emails: the brand the order was sold under (orderEmailData). Absent means NK. */
  brand?: BrandKey
  /** Staff alerts: the channel the order came in on (staffOrderEmailData): "NK", "Kampi" or "Unknown channel (<id>)". Absent means NK. */
  channel_label?: string
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** NK's legal segments that hold a usable value (placeholders are left out). Shown under another brand's emails. */
function legalSegments(): string[] {
  const b = getBusinessConfig()
  const reg = usableValue(b.registration_number)
  const vat = usableValue(b.vat_number)
  const addr = usableValue(b.physical_address)
  return [reg && `Reg. no. ${reg}`, vat && `VAT no. ${vat}`, addr].filter((v): v is string => !!v)
}

/** Text sign-off: NK's name, or another brand's name plus the seller line, NK's legal line and the store link. */
function signOff(t: Theme): string {
  const br = t.brand
  if (br.key === "nk") return "Noord Karavane"
  const legal = legalSegments()
  return [br.name, "", br.sellerLine, ...(legal.length ? [legal.join(" · ")] : []), br.shopUrl].join("\n")
}

/** footerHtml replaces the customer "Questions? Reply to this email" line (staff alerts use their own). */
function shell(t: Theme, preheader: string, heading: string, bodyHtml: string, footerHtml?: string): string {
  const b = getBusinessConfig()
  const C = t.c
  const SERIF = t.display
  const SANS = t.body
  const br = t.brand
  let header: string
  let footerTail: string
  if (br.key === "nk") {
    header = `<div style="font-family:${SERIF};font-size:30px;letter-spacing:3px;color:${C.cream};text-transform:uppercase;">Noord Karavane</div>
      <div style="font-family:${SANS};font-size:12px;letter-spacing:2px;color:${C.moss};text-transform:uppercase;padding-top:6px;">${esc(b.tagline)}</div>`
    footerTail = `Noord Karavane &middot; <a href="${esc(siteUrl())}" style="color:${C.wine};">${esc(b.domain)}</a> &middot; caravan specialists, Pretoria North.`
  } else {
    const tagline = kampiBrandConfig(b)?.tagline
    header =
      (br.logoUrl
        ? `<img src="${esc(br.logoUrl)}" alt="${esc(br.name)}" width="160" style="display:block;margin:0 auto 12px auto;width:160px;max-width:100%;height:auto;border:0;">
      `
        : "") +
      `<div style="font-family:${SERIF};font-size:26px;font-weight:800;letter-spacing:2px;color:${C.cream};text-transform:uppercase;">${esc(br.name)}</div>` +
      (tagline
        ? `
      <div style="font-family:${SANS};font-size:12px;letter-spacing:2px;color:${C.moss};text-transform:uppercase;padding-top:6px;">${esc(tagline)}</div>`
        : "")
    const legal = legalSegments()
    const host = new URL(br.shopUrl).host
    footerTail =
      `${esc(br.sellerLine)}<br>
      ` +
      (legal.length ? `${legal.map(esc).join(" &middot; ")}<br>
      ` : "") +
      `<a href="${esc(br.shopUrl)}" style="color:${C.wine};">${esc(host)}</a>`
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.cream};">
    <tr><td align="center" style="background:${C.black};padding:28px 24px;">
      ${header}
    </td></tr>
    <tr><td style="padding:32px 28px 8px 28px;font-family:${SANS};font-size:16px;line-height:24px;color:${C.black};">
      <h1 style="margin:0 0 16px 0;font-family:${SERIF};font-size:32px;line-height:36px;font-weight:600;color:${C.black};">${esc(heading)}</h1>
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:24px 28px 32px 28px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.earth};border-top:1px solid ${C.earth};">
      ${footerHtml ?? `Questions? Reply to this email or write to <a href="mailto:${esc(b.email_general)}" style="color:${C.wine};">${esc(b.email_general)}</a>.`}<br>
      ${footerTail}
    </td></tr>
  </table>
</td></tr></table></body></html>`
}

const p = (html: string) => `<p style="margin:0 0 16px 0;">${html}</p>`

/** withSku: staff alerts show the SKU under each line; customer emails never do. */
function itemsTable(t: Theme, d: EmailData, withSku = false): string {
  if (!d.items?.length) return ""
  const C = t.c
  const SANS = t.body
  const rows = d.items
    .map(
      (i) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #d9d1bd;font-family:${SANS};font-size:15px;">${esc(i.title)}${i.variant ? `<br><span style="color:${C.earth};font-size:13px;">${esc(i.variant)}</span>` : ""}${withSku && i.sku ? `<br><span style="color:${C.earth};font-size:13px;">SKU ${esc(i.sku)}</span>` : ""}</td>
<td align="center" style="padding:8px 8px;border-bottom:1px solid #d9d1bd;font-family:${SANS};font-size:15px;">&times;${i.quantity}</td>
<td align="right" style="padding:8px 0;border-bottom:1px solid #d9d1bd;font-family:${SANS};font-size:15px;">${esc(i.total ?? "")}</td></tr>`
    )
    .join("")
  const ship = d.shipping_total
    ? `<tr><td colspan="2" style="padding:8px 0;font-size:14px;">Shipping${d.shipping_method ? ` (${esc(d.shipping_method)})` : ""}</td><td align="right" style="padding:8px 0;font-size:14px;">${esc(d.shipping_total)}</td></tr>`
    : ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">${rows}${ship}
<tr><td colspan="2" style="padding:10px 0;font-weight:bold;font-size:16px;">Total (incl. VAT where applicable)</td><td align="right" style="padding:10px 0;font-weight:bold;font-size:16px;">${esc(d.total ?? "")}</td></tr></table>`
}

function itemsText(d: EmailData, withSku = false): string {
  const lines = (d.items ?? []).map(
    (i) => `- ${i.title}${i.variant ? ` (${i.variant})` : ""}${withSku && i.sku ? ` [${i.sku}]` : ""} x${i.quantity}  ${i.total ?? ""}`
  )
  if (d.shipping_total) lines.push(`Shipping${d.shipping_method ? ` (${d.shipping_method})` : ""}: ${d.shipping_total}`)
  lines.push(`Total: ${d.total ?? ""}`)
  return lines.join("\n")
}

function button(t: Theme, href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;"><tr><td style="background:${t.c.wine};">
<a href="${esc(href)}" style="display:inline-block;padding:12px 26px;font-family:${t.body};font-size:14px;letter-spacing:1px;text-transform:uppercase;color:${t.onAccent};font-weight:bold;text-decoration:none;">${esc(label)}</a></td></tr></table>`
}

/** Another brand's customer emails link to the order page on that brand's store; NK's emails stay as they are. */
function orderLink(t: Theme, d: EmailData): { html: string; text: string } {
  if (t.brand.key === "nk" || !d.order_url) return { html: "", text: "" }
  return { html: button(t, d.order_url, "View your order"), text: `View your order: ${d.order_url}\n\n` }
}

function bankBlock(t: Theme, ref: string): { html: string; text: string } {
  const b = getBusinessConfig().bank
  const C = t.c
  const SANS = t.body
  const row = (k: string, v: string, bold = false) =>
    `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:${C.earth};">${k}</td><td style="padding:6px 0;font-size:15px;${bold ? "font-weight:bold;" : ""}">${esc(v)}</td></tr>`
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background:${t.brand.key === "nk" ? "#e8e0cc" : `${C.cream};border:1px solid ${C.earth}`};width:100%;"><tr><td style="padding:14px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${SANS};">
${row("Account name", b.account_name)}${row("Bank", b.bank_name)}${row("Account number", b.account_number)}${row("Branch code", b.branch_code)}${row("Account type", b.account_type)}${row("Payment reference", ref, true)}
</table></td></tr></table>`
  const text = `Account name: ${b.account_name}\nBank: ${b.bank_name}\nAccount number: ${b.account_number}\nBranch code: ${b.branch_code}\nAccount type: ${b.account_type}\nPayment reference: ${ref}`
  return { html, text }
}

/** Payment line and subject tag for staff alerts. Paid means a payment has captured_at set. */
function staffPayment(d: EmailData, ref: string): { line: string; tag: string } {
  const paid = !!d.payment_captured
  if (d.payment_method === "EFT")
    return paid
      ? { line: "EFT payment received.", tag: "paid by EFT" }
      : { line: `Awaiting EFT payment. Check the bank for reference ${ref} before packing.`, tag: "awaiting EFT payment" }
  if (d.payment_method === "PayFast")
    return paid
      ? { line: "Paid online by PayFast.", tag: "paid by PayFast" }
      : { line: "Card payment pending. Wait for the paid alert before packing.", tag: "card payment pending" }
  const method = d.payment_method || "unknown method"
  return paid ? { line: `Paid (${method}).`, tag: "paid" } : { line: `Payment pending (${method}).`, tag: "payment pending" }
}

/** Order detail block shared by the staff alerts: items with SKU, delivery, ship-to, contact, admin link. */
function staffDetail(t: Theme, d: EmailData, ref: string): { html: string; text: string } {
  const C = t.c
  const ship = d.ship_to_lines ?? []
  const delivery = d.collect_from_workshop ? "Collect from workshop" : d.shipping_method || "Not set"
  const html =
    itemsTable(t, d, true) +
    p(`Delivery: <strong>${esc(delivery)}</strong>` + (d.pudo_locker ? `<br>Pudo locker: <strong>${esc(d.pudo_locker)}</strong>` : "")) +
    p(`Ship to:<br>${ship.length ? ship.map(esc).join("<br>") : "No address given"}`) +
    p(
      `Phone: ${d.customer_phone ? `<a href="tel:${esc(d.customer_phone)}" style="color:${C.wine};">${esc(d.customer_phone)}</a>` : "not given"}<br>` +
        `Email: ${d.customer_email ? `<a href="mailto:${esc(d.customer_email)}" style="color:${C.wine};">${esc(d.customer_email)}</a>` : "not given"}`
    ) +
    (d.admin_order_url ? button(t, d.admin_order_url, `Open ${ref} in admin`) : "")
  const text = [
    itemsText(d, true),
    "",
    `Delivery: ${delivery}`,
    ...(d.pudo_locker ? [`Pudo locker: ${d.pudo_locker}`] : []),
    "",
    "Ship to:",
    ...(ship.length ? ship : ["No address given"]),
    "",
    `Phone: ${d.customer_phone || "not given"}`,
    `Email: ${d.customer_email || "not given"}`,
    ...(d.admin_order_url ? ["", `Admin: ${d.admin_order_url}`] : []),
  ].join("\n")
  return { html, text }
}

const staffFooter = (d: EmailData) =>
  `Staff alert from the Noord Karavane shop.${d.reply_to ? " Replying to this email goes to the customer." : ""}`

export function renderEmail(template: string, d: EmailData): { subject: string; html: string; text: string } {
  const b = getBusinessConfig()
  const ref = d.reference ?? (d.display_id ? `NK${d.display_id}` : "")
  const hi = `Hi ${d.first_name ? esc(d.first_name) : "there"},`
  const hiText = `Hi ${d.first_name || "there"},`
  const windowH = b.eft_payment_window_hours
  // Customer order emails follow the order's brand; password reset, supplier and staff emails are always NK.
  const t = theme(brandByKey(d.brand))
  const nk = theme(brandByKey("nk"))
  // Staff alerts name the channel; a Kampi order's subject is tagged so staff can tell the stores apart.
  const channel = d.channel_label ?? "NK"
  const channelTag = d.channel_label === "Kampi" ? "[Kampi] " : ""

  switch (template) {
    case "order-placed-eft": {
      const bank = bankBlock(t, ref)
      const link = orderLink(t, d)
      const html = shell(
        t,
        `Order ${ref} is in. Pay by EFT within ${windowH} hours to lock it in.`,
        "Your order is reserved",
        p(hi) +
          p(`Thank you for your order <strong>${esc(ref)}</strong>. We start packing your order once your payment lands.`) +
          p(`Please pay by EFT within <strong>${windowH} hours</strong>, using your order number as the reference:`) +
          bank.html +
          itemsTable(t, d) +
          (d.pudo_locker ? p(`Delivering to Pudo locker: <strong>${esc(d.pudo_locker)}</strong>`) : "") +
          p(`Once we see the money, we'll email you and your order goes into preparation (${esc(b.production_lead_time_days)}). Unpaid orders are released after ${windowH} hours, but you can always order again.`) +
          link.html +
          p(`Safe travels.`)
      )
      const text = `${hiText}\n\nThank you for your order ${ref}. We start packing your order once your payment lands.\n\nPlease pay by EFT within ${windowH} hours, using your order number as the reference:\n\n${bank.text}\n\n${itemsText(d)}\n${d.pudo_locker ? `\nPudo locker: ${d.pudo_locker}\n` : ""}\nOnce we see the money we'll email you and your order goes into preparation (${b.production_lead_time_days}). Unpaid orders are released after ${windowH} hours.\n\n${link.text}Safe travels.\n${signOff(t)}`
      return { subject: `Order ${ref}: pay by EFT to lock it in`, html, text }
    }
    case "eft-reminder": {
      const bank = bankBlock(t, ref)
      const left = d.hours_left ?? windowH - b.eft_reminder_after_hours
      const link = orderLink(t, d)
      const html = shell(
        t,
        `Order ${ref} is still waiting on payment.`,
        "Your order is still waiting",
        p(hi) +
          p(`Order <strong>${esc(ref)}</strong> hasn't been paid yet. We'll hold it for roughly <strong>${left} more hours</strong>, then release it.`) +
          bank.html +
          itemsTable(t, d) +
          p(`Already paid? Lovely. It can take a little while to reflect, and you don't need to do anything. If you've changed your mind, no stress.`) +
          link.html
      )
      const text = `${hiText}\n\nOrder ${ref} hasn't been paid yet. We'll hold it for roughly ${left} more hours, then release it.\n\n${bank.text}\n\n${itemsText(d)}\n\nAlready paid? You don't need to do anything.\n\n${link.text}${signOff(t)}`
      return { subject: `Reminder: order ${ref} is waiting for payment`, html, text }
    }
    case "payment-received": {
      const link = orderLink(t, d)
      const html = shell(
        t,
        `Payment received for ${ref}. Your order is being prepared.`,
        "Paid. Now we pack it.",
        p(hi) +
          p(`We've received your payment for order <strong>${esc(ref)}</strong>. Your order is now <strong>being prepared</strong>.`) +
          itemsTable(t, d) +
          p(`Preparing your order takes <strong>${esc(b.production_lead_time_days)}</strong> before it ships. We'll email you the tracking details the moment it's on its way.`) +
          link.html
      )
      const text = `${hiText}\n\nWe've received your payment for order ${ref}. Your order is now being prepared.\n\n${itemsText(d)}\n\nPreparing your order takes ${b.production_lead_time_days} before it ships. We'll email you tracking details the moment it's on its way.\n\n${link.text}${signOff(t)}`
      return { subject: `Payment received for ${ref}: now being prepared`, html, text }
    }
    case "order-shipped": {
      const track = d.tracking_number
        ? p(`${esc(d.carrier || "Courier")} tracking number: <strong>${esc(d.tracking_number)}</strong>`) +
          (d.tracking_url ? button(t, d.tracking_url, "Track your parcel") : "")
        : p("Tracking details will follow shortly.")
      const html = shell(
        t,
        `Order ${ref} has shipped.`,
        "It's on its way",
        p(hi) +
          p(`Order <strong>${esc(ref)}</strong> has left the building.`) +
          track +
          (d.pudo_locker ? p(`Pick-up locker: <strong>${esc(d.pudo_locker)}</strong>. You'll get a code from Pudo when it arrives.`) : "") +
          p(`Questions about your parcel? Reply to this email or WhatsApp us.`)
      )
      const text = `${hiText}\n\nOrder ${ref} has shipped.\n${d.tracking_number ? `${d.carrier || "Courier"} tracking number: ${d.tracking_number}\n` : "Tracking details will follow shortly.\n"}${d.tracking_url ? `Track it: ${d.tracking_url}\n` : ""}${d.pudo_locker ? `Pick-up locker: ${d.pudo_locker}\n` : ""}\nQuestions about your parcel? Reply to this email or WhatsApp us.\n${signOff(t)}`
      return { subject: `Order ${ref} has shipped`, html, text }
    }
    case "order-canceled": {
      const html = shell(
        t,
        `Order ${ref} was cancelled.`,
        "Order cancelled",
        p(hi) +
          p(`Order <strong>${esc(ref)}</strong> has been cancelled. If it was cancelled because payment didn't arrive within ${windowH} hours, nothing was due. If you did pay, reply to this email and we'll refund or reinstate it.`) +
          p(`Changed your mind, or paid just after the deadline? Reply to this email and we'll sort it out. You're also welcome to order again any time.`) +
          button(t, t.brand.shopUrl + "/", "Back to the shop")
      )
      const text = `${hiText}\n\nOrder ${ref} has been cancelled. If this was because payment didn't arrive within ${windowH} hours, nothing was due. If you did pay, reply to this email and we'll refund or reinstate it.\n\nPaid just after the deadline? Reply to this email and we'll sort it out.\n\n${t.brand.shopUrl}/\n\n${signOff(t)}`
      return { subject: `Order ${ref} has been cancelled`, html, text }
    }
    case "dropship-supplier": {
      const lines = (d.supplier_items ?? []).map((i) => `${i.quantity} x ${i.title}${i.variant ? ` (${i.variant})` : ""}${i.sku ? ` [${i.sku}]` : ""}`)
      const html = shell(
        nk,
        `New paid order ${ref} for you to fulfil.`,
        "New order to fulfil",
        p(`Hi ${esc(d.supplier ?? "there")},`) +
          p(`Order <strong>${esc(ref)}</strong> has been paid. Please fulfil and ship directly to the customer:`) +
          p(lines.map(esc).join("<br>")) +
          p(`Ship to: <strong>${esc(d.ship_to ?? "")}</strong><br>Shipping method chosen: ${esc(d.shipping_method ?? "")}`) +
          p(`Please reply with the tracking number once it is on its way.`)
      )
      const text = `Hi ${d.supplier ?? "there"},\n\nOrder ${ref} has been paid. Please fulfil and ship directly to the customer:\n\n${lines.join("\n")}\n\nShip to: ${d.ship_to ?? ""}\nShipping method chosen: ${d.shipping_method ?? ""}\n\nPlease reply with the tracking number once it is on its way.\n\nNoord Karavane`
      return { subject: `New paid order ${ref} to fulfil`, html, text }
    }
    case "staff-new-order": {
      const pay = staffPayment(d, ref)
      const detail = staffDetail(nk, d, ref)
      const html = shell(
        nk,
        `New order ${ref}: ${pay.tag} (${d.total ?? ""})`,
        `New order ${ref}`,
        p(`<strong>${esc(pay.line)}</strong>`) + p(`Channel: ${esc(channel)}`) + detail.html,
        staffFooter(d)
      )
      const text = `New order ${ref}\n\n${pay.line}\nChannel: ${channel}\n\n${detail.text}\n\nNoord Karavane shop`
      return { subject: `${channelTag}New order ${ref}: ${pay.tag} (${d.total ?? ""})`, html, text }
    }
    case "staff-order-paid": {
      const dispatch = d.collect_from_workshop
        ? "Prepare the order for collection at the workshop and let the customer know it is ready."
        : d.pudo_locker
          ? `Book the Pudo shipment to the customer's locker: ${d.pudo_locker}.`
          : `Book the courier for ${d.shipping_method || "the chosen shipping method"}.`
      const group = (list: EmailData["dropship_items"]) => {
        const m = new Map<string, string[]>()
        for (const i of list ?? []) {
          const line = `${i.quantity} x ${i.title}${i.variant ? ` (${i.variant})` : ""}${i.sku ? ` [${i.sku}]` : ""}`
          m.set(i.supplier, [...(m.get(i.supplier) ?? []), line])
        }
        return m
      }
      const bySupplier = group(d.dropship_items)
      const names = [...bySupplier.keys()]
      // Each dropship line maps to one order line, so equal counts mean the suppliers ship everything.
      // Sent before notifyDropshipSuppliers runs, so the copy says we are emailing them (present tense), not that they ship.
      const allDropship = !!d.items?.length && (d.dropship_items ?? []).length === d.items.length
      const steps = allDropship
        ? [
            `We are emailing ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]} to ship everything on this order. Nothing to pack here.`,
            `Watch for the tracking ${names.length > 1 ? "numbers from the suppliers" : "number from the supplier"}. If none arrives, check with them.`,
            "In the admin, create the fulfilment and mark it shipped with the tracking number. That emails the customer.",
          ]
        : [
            "Pack the items.",
            dispatch,
            "In the admin, create the fulfilment and mark it shipped with the tracking number. That emails the customer.",
          ]
      const drop = [
        ...[...bySupplier].map(([supplier, lines]) => ({
          head: `We are emailing ${supplier} to ship these lines directly. Do not pack them. If no tracking number arrives, check with them:`,
          lines,
        })),
        ...[...group(d.dropship_unnotified)].map(([supplier, lines]) => ({
          head: `${supplier} has no valid email in the shop config, so they were NOT notified. Order these lines from them yourself or pack them:`,
          lines,
        })),
      ]
      const detail = staffDetail(nk, d, ref)
      // payment.captured fired but no payment on the order shows captured: do not claim the order is paid.
      const paid = !!d.payment_captured
      const subject = paid ? `Paid: order ${ref} ready to ship (${d.total ?? ""})` : `Payment captured: order ${ref} not fully paid yet (${d.total ?? ""})`
      const intro = paid
        ? { html: `Payment is in for order <strong>${esc(ref)}</strong>. Next steps:`, text: `Payment is in for order ${ref}. Next steps:` }
        : {
            html: `A payment was captured for order <strong>${esc(ref)}</strong> but the order is not fully paid yet. Check the admin before packing. Once it is paid:`,
            text: `A payment was captured for order ${ref} but the order is not fully paid yet. Check the admin before packing. Once it is paid:`,
          }
      const html = shell(
        nk,
        subject,
        paid ? `Paid: ${ref} ready to ship` : `${ref}: not fully paid yet`,
        p(intro.html) +
          p(`Channel: ${esc(channel)}`) +
          `<ol style="margin:0 0 16px 0;padding-left:20px;">${steps.map((s) => `<li style="margin:0 0 6px 0;">${esc(s)}</li>`).join("")}</ol>` +
          drop.map((g) => p(`<strong>${esc(g.head)}</strong><br>${g.lines.map(esc).join("<br>")}`)).join("") +
          detail.html,
        staffFooter(d)
      )
      const text = `${intro.text}\nChannel: ${channel}\n\n${steps.map((s, n) => `${n + 1}. ${s}`).join("\n")}\n${drop
        .map((g) => `\n${g.head}\n${g.lines.join("\n")}\n`)
        .join("")}\n${detail.text}\n\nNoord Karavane shop`
      return { subject: channelTag + subject, html, text }
    }
    case "staff-payment-no-order": {
      const pid = d.payment_id || "unknown"
      const subject = `Payment ${pid} captured with no order: check it`
      const ordersUrl = `${d.admin_url ?? ""}/app/orders`
      const facts = [`Payment: ${pid}`, `Amount: ${d.payment_amount || "unknown"}`, `Provider: ${d.payment_provider || "unknown"}`]
      const why =
        "A payment was captured but no order is linked to it. The customer may have paid while the order was not created. " +
        "Check the payment with the provider and find the cart or customer in the admin before contacting them."
      const html = shell(
        nk,
        subject,
        "Payment with no order",
        p(`<strong>${esc(why)}</strong>`) + p(facts.map(esc).join("<br>")) + (d.admin_url ? button(nk, ordersUrl, "Open orders in admin") : ""),
        staffFooter(d)
      )
      const text = `${why}\n\n${facts.join("\n")}\n${d.admin_url ? `\nAdmin: ${ordersUrl}\n` : ""}\nNoord Karavane shop`
      return { subject, html, text }
    }
    case "password-reset": {
      const html = shell(
        nk,
        "Reset your Noord Karavane admin password.",
        "Reset your password",
        p("Hi there,") +
          p("Someone (hopefully you) asked to reset the password for the Noord Karavane admin. The link works once and expires soon.") +
          button(nk, d.reset_url ?? "#", "Choose a new password") +
          p("Didn't ask for this? Ignore this email and nothing changes.")
      )
      const text = `Hi there,\n\nSomeone (hopefully you) asked to reset the password for the Noord Karavane admin. The link works once and expires soon:\n\n${d.reset_url ?? ""}\n\nDidn't ask for this? Ignore this email and nothing changes.\n\nNoord Karavane`
      return { subject: "Reset your Noord Karavane admin password", html, text }
    }
    default:
      throw new Error(`Unknown email template "${template}"`)
  }
}
