import crypto from "crypto"

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex")

export function hashEmail(email?: string | null): string | undefined {
  const v = (email ?? "").trim().toLowerCase()
  return v ? sha256(v) : undefined
}

/** Normalise to digits with country code (South Africa default), then SHA-256. */
export function hashPhone(phone?: string | null): string | undefined {
  let d = (phone ?? "").replace(/\D/g, "")
  if (!d) return undefined
  if (d.startsWith("00")) d = d.slice(2)
  else if (d.startsWith("0")) d = "27" + d.slice(1)
  return sha256(d)
}

export function hashText(v?: string | null): string | undefined {
  const t = (v ?? "").trim().toLowerCase()
  return t ? sha256(t) : undefined
}

export type CapiPurchase = {
  eventId: string
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  fbp?: string
  fbc?: string
  value: number
  currency?: string
  orderId: string
  contentIds: string[]
  numItems: number
  sourceUrl?: string
}

export async function sendPurchase(p: CapiPurchase, logger?: { info: Function; warn: Function }) {
  const pixel = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN
  if (!pixel || !token) return false

  const user_data: Record<string, unknown> = {
    em: hashEmail(p.email) ? [hashEmail(p.email)] : undefined,
    ph: hashPhone(p.phone) ? [hashPhone(p.phone)] : undefined,
    fn: hashText(p.firstName) ? [hashText(p.firstName)] : undefined,
    ln: hashText(p.lastName) ? [hashText(p.lastName)] : undefined,
    country: [sha256("za")],
    fbp: p.fbp || undefined,
    fbc: p.fbc || undefined,
  }
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: p.eventId,
        action_source: "website",
        event_source_url: p.sourceUrl,
        user_data,
        custom_data: {
          value: p.value,
          currency: p.currency || "ZAR",
          order_id: p.orderId,
          content_type: "product_group", // content_ids are product handles = feed item_group_id
          content_ids: p.contentIds,
          num_items: p.numItems,
        },
      },
    ],
  }
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  )
  if (!res.ok) {
    logger?.warn(`[meta-capi] ${res.status} ${await res.text().catch(() => "")}`)
    return false
  }
  logger?.info(`[meta-capi] Purchase ${p.eventId} sent`)
  return true
}
