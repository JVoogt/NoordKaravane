import { getBusinessConfig, shopUrl, siteUrl } from "../../lib/business"

/**
 * Branded, table-based HTML emails (inline styles only, for email clients).
 * Palette: ink #0e0f11, paper #ebe6dd, workshop orange #e95e1d (matches the noordkaravane.co.za landing page).
 * Voice: plain, practical, friendly. Caravan people, not corporate.
 */
const C = { black: "#0e0f11", cream: "#ebe6dd", moss: "#ff7a3b", earth: "#5f594d", wine: "#e95e1d" }
const SERIF = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif"
const SANS = "'Barlow', Helvetica, Arial, sans-serif"

export type EmailItem = { title: string; quantity: number; variant?: string; total?: string }
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
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function shell(preheader: string, heading: string, bodyHtml: string): string {
  const b = getBusinessConfig()
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.cream};">
    <tr><td align="center" style="background:${C.black};padding:28px 24px;">
      <div style="font-family:${SERIF};font-size:30px;letter-spacing:3px;color:${C.cream};text-transform:uppercase;">Noord Karavane</div>
      <div style="font-family:${SANS};font-size:12px;letter-spacing:2px;color:${C.moss};text-transform:uppercase;padding-top:6px;">${esc(b.tagline)}</div>
    </td></tr>
    <tr><td style="padding:32px 28px 8px 28px;font-family:${SANS};font-size:16px;line-height:24px;color:${C.black};">
      <h1 style="margin:0 0 16px 0;font-family:${SERIF};font-size:32px;line-height:36px;font-weight:600;color:${C.black};">${esc(heading)}</h1>
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:24px 28px 32px 28px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.earth};border-top:1px solid ${C.earth};">
      Questions? Reply to this email or write to <a href="mailto:${esc(b.email_general)}" style="color:${C.wine};">${esc(b.email_general)}</a>.<br>
      Noord Karavane &middot; <a href="${esc(siteUrl())}" style="color:${C.wine};">${esc(b.domain)}</a> &middot; caravan specialists, Pretoria North.
    </td></tr>
  </table>
</td></tr></table></body></html>`
}

const p = (html: string) => `<p style="margin:0 0 16px 0;">${html}</p>`

function itemsTable(d: EmailData): string {
  if (!d.items?.length) return ""
  const rows = d.items
    .map(
      (i) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #d9d1bd;font-family:${SANS};font-size:15px;">${esc(i.title)}${i.variant ? `<br><span style="color:${C.earth};font-size:13px;">${esc(i.variant)}</span>` : ""}</td>
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

function itemsText(d: EmailData): string {
  const lines = (d.items ?? []).map((i) => `- ${i.title}${i.variant ? ` (${i.variant})` : ""} x${i.quantity}  ${i.total ?? ""}`)
  if (d.shipping_total) lines.push(`Shipping${d.shipping_method ? ` (${d.shipping_method})` : ""}: ${d.shipping_total}`)
  lines.push(`Total: ${d.total ?? ""}`)
  return lines.join("\n")
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;"><tr><td style="background:${C.wine};">
<a href="${esc(href)}" style="display:inline-block;padding:12px 26px;font-family:${SANS};font-size:14px;letter-spacing:1px;text-transform:uppercase;color:${C.black};font-weight:bold;text-decoration:none;">${esc(label)}</a></td></tr></table>`
}

function bankBlock(ref: string): { html: string; text: string } {
  const b = getBusinessConfig().bank
  const row = (k: string, v: string, bold = false) =>
    `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:${C.earth};">${k}</td><td style="padding:6px 0;font-size:15px;${bold ? "font-weight:bold;" : ""}">${esc(v)}</td></tr>`
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background:#e8e0cc;width:100%;"><tr><td style="padding:14px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${SANS};">
${row("Account name", b.account_name)}${row("Bank", b.bank_name)}${row("Account number", b.account_number)}${row("Branch code", b.branch_code)}${row("Account type", b.account_type)}${row("Payment reference", ref, true)}
</table></td></tr></table>`
  const text = `Account name: ${b.account_name}\nBank: ${b.bank_name}\nAccount number: ${b.account_number}\nBranch code: ${b.branch_code}\nAccount type: ${b.account_type}\nPayment reference: ${ref}`
  return { html, text }
}

export function renderEmail(template: string, d: EmailData): { subject: string; html: string; text: string } {
  const b = getBusinessConfig()
  const ref = d.reference ?? (d.display_id ? `NK${d.display_id}` : "")
  const hi = `Hi ${d.first_name ? esc(d.first_name) : "there"},`
  const hiText = `Hi ${d.first_name || "there"},`
  const windowH = b.eft_payment_window_hours

  switch (template) {
    case "order-placed-eft": {
      const bank = bankBlock(ref)
      const html = shell(
        `Order ${ref} is in. Pay by EFT within ${windowH} hours to lock it in.`,
        "Your order is reserved",
        p(hi) +
          p(`Thank you for your order <strong>${esc(ref)}</strong>. We start packing your order once your payment lands.`) +
          p(`Please pay by EFT within <strong>${windowH} hours</strong>, using your order number as the reference:`) +
          bank.html +
          itemsTable(d) +
          (d.pudo_locker ? p(`Delivering to Pudo locker: <strong>${esc(d.pudo_locker)}</strong>`) : "") +
          p(`Once we see the money, we'll email you and your order goes into preparation (${esc(b.production_lead_time_days)}). Unpaid orders are released after ${windowH} hours, but you can always order again.`) +
          p(`Safe travels.`)
      )
      const text = `${hiText}\n\nThank you for your order ${ref}. We start packing your order once your payment lands.\n\nPlease pay by EFT within ${windowH} hours, using your order number as the reference:\n\n${bank.text}\n\n${itemsText(d)}\n${d.pudo_locker ? `\nPudo locker: ${d.pudo_locker}\n` : ""}\nOnce we see the money we'll email you and your order goes into preparation (${b.production_lead_time_days}). Unpaid orders are released after ${windowH} hours.\n\nSafe travels.\nNoord Karavane`
      return { subject: `Order ${ref}: pay by EFT to lock it in`, html, text }
    }
    case "eft-reminder": {
      const bank = bankBlock(ref)
      const left = d.hours_left ?? windowH - b.eft_reminder_after_hours
      const html = shell(
        `Order ${ref} is still waiting on payment.`,
        "Your order is still waiting",
        p(hi) +
          p(`Order <strong>${esc(ref)}</strong> hasn't been paid yet. We'll hold it for roughly <strong>${left} more hours</strong>, then release it.`) +
          bank.html +
          itemsTable(d) +
          p(`Already paid? Lovely. It can take a little while to reflect, and you don't need to do anything. If you've changed your mind, no stress.`)
      )
      const text = `${hiText}\n\nOrder ${ref} hasn't been paid yet. We'll hold it for roughly ${left} more hours, then release it.\n\n${bank.text}\n\n${itemsText(d)}\n\nAlready paid? You don't need to do anything.\n\nNoord Karavane`
      return { subject: `Reminder: order ${ref} is waiting for payment`, html, text }
    }
    case "payment-received": {
      const html = shell(
        `Payment received for ${ref}. Your order is being prepared.`,
        "Paid. Now we pack it.",
        p(hi) +
          p(`We've received your payment for order <strong>${esc(ref)}</strong>. Your order is now <strong>being prepared</strong>.`) +
          itemsTable(d) +
          p(`Preparing your order takes <strong>${esc(b.production_lead_time_days)}</strong> before it ships. We'll email you the tracking details the moment it's on its way.`)
      )
      const text = `${hiText}\n\nWe've received your payment for order ${ref}. Your order is now being prepared.\n\n${itemsText(d)}\n\nPreparing your order takes ${b.production_lead_time_days} before it ships. We'll email you tracking details the moment it's on its way.\n\nNoord Karavane`
      return { subject: `Payment received for ${ref}: now being prepared`, html, text }
    }
    case "order-shipped": {
      const track = d.tracking_number
        ? p(`${esc(d.carrier || "Courier")} tracking number: <strong>${esc(d.tracking_number)}</strong>`) +
          (d.tracking_url ? button(d.tracking_url, "Track your parcel") : "")
        : p("Tracking details will follow shortly.")
      const html = shell(
        `Order ${ref} has shipped.`,
        "It's on its way",
        p(hi) +
          p(`Order <strong>${esc(ref)}</strong> has left the building.`) +
          track +
          (d.pudo_locker ? p(`Pick-up locker: <strong>${esc(d.pudo_locker)}</strong>. You'll get a code from Pudo when it arrives.`) : "") +
          p(`Questions about your parcel? Reply to this email or WhatsApp us.`)
      )
      const text = `${hiText}\n\nOrder ${ref} has shipped.\n${d.tracking_number ? `${d.carrier || "Courier"} tracking number: ${d.tracking_number}\n` : "Tracking details will follow shortly.\n"}${d.tracking_url ? `Track it: ${d.tracking_url}\n` : ""}${d.pudo_locker ? `Pick-up locker: ${d.pudo_locker}\n` : ""}\nQuestions about your parcel? Reply to this email or WhatsApp us.\nNoord Karavane`
      return { subject: `Order ${ref} has shipped`, html, text }
    }
    case "order-canceled": {
      const html = shell(
        `Order ${ref} was cancelled.`,
        "Order cancelled",
        p(hi) +
          p(`Order <strong>${esc(ref)}</strong> has been cancelled. If it was cancelled because payment didn't arrive within ${windowH} hours, nothing was due. If you did pay, reply to this email and we'll refund or reinstate it.`) +
          p(`Changed your mind, or paid just after the deadline? Reply to this email and we'll sort it out. You're also welcome to order again any time.`) +
          button(shopUrl() + "/", "Back to the shop")
      )
      const text = `${hiText}\n\nOrder ${ref} has been cancelled. If this was because payment didn't arrive within ${windowH} hours, nothing was due. If you did pay, reply to this email and we'll refund or reinstate it.\n\nPaid just after the deadline? Reply to this email and we'll sort it out.\n\n${shopUrl()}/\n\nNoord Karavane`
      return { subject: `Order ${ref} has been cancelled`, html, text }
    }
    case "dropship-supplier": {
      const lines = (d.supplier_items ?? []).map((i) => `${i.quantity} x ${i.title}${i.variant ? ` (${i.variant})` : ""}${i.sku ? ` [${i.sku}]` : ""}`)
      const html = shell(
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
    case "password-reset": {
      const html = shell(
        "Reset your Noord Karavane admin password.",
        "Reset your password",
        p("Hi there,") +
          p("Someone (hopefully you) asked to reset the password for the Noord Karavane admin. The link works once and expires soon.") +
          button(d.reset_url ?? "#", "Choose a new password") +
          p("Didn't ask for this? Ignore this email and nothing changes.")
      )
      const text = `Hi there,\n\nSomeone (hopefully you) asked to reset the password for the Noord Karavane admin. The link works once and expires soon:\n\n${d.reset_url ?? ""}\n\nDidn't ask for this? Ignore this email and nothing changes.\n\nNoord Karavane`
      return { subject: "Reset your Noord Karavane admin password", html, text }
    }
    default:
      throw new Error(`Unknown email template "${template}"`)
  }
}
