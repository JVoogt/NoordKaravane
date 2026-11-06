import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"
import { lookup } from "dns/promises"
import { amountsMatch, isPayfastIp, payfastHost, verifySignature } from "../../../modules/payfast/signature"

const PF_HOSTS = ["www.payfast.co.za", "sandbox.payfast.co.za", "w1w.payfast.co.za", "w2w.payfast.co.za"]

/** PayFast docs: the notification must come from one of PayFast's valid hosts. Resolve them via DNS (cached 10 min). */
let hostIps: { at: number; ips: Set<string> } | null = null
async function isPayfastHostIp(ip: string): Promise<boolean> {
  if (!hostIps || Date.now() - hostIps.at > 600_000) {
    const ips = new Set<string>()
    await Promise.all(
      PF_HOSTS.map((h) =>
        lookup(h, { all: true, family: 4 }).then(
          (r) => r.forEach((a) => ips.add(a.address)),
          () => undefined
        )
      )
    )
    hostIps = { at: Date.now(), ips }
  }
  return hostIps.ips.has(ip.replace(/^::ffff:/, ""))
}

/**
 * PayFast ITN (Instant Transaction Notification) endpoint: POST /hooks/payfast
 * Validates, in order: source IP, signature, amount vs payment session, server-to-server confirmation.
 * Only then does it mark the payment session paid and hand the event to Medusa's payment webhook flow.
 * Always answers 200 for well-formed requests PayFast should not retry; 400 on validation failures.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  if (process.env.PAYFAST_ENABLED !== "true") return res.sendStatus(404)

  const rawBuf: Buffer | undefined = (req as any).rawBody
  const raw = rawBuf ? rawBuf.toString("utf8") : ""
  // Preserve PayFast's field order (needed for the signature).
  const data: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw || new URLSearchParams(req.body as any).toString())) data[k] = v

  const sandbox = process.env.PAYFAST_SANDBOX !== "false"
  const passphrase = process.env.PAYFAST_PASSPHRASE

  // 1. Source IP (Cloudflare sets CF-Connecting-IP).
  const ip =
    (req.headers["cf-connecting-ip"] as string) ||
    (req.headers["x-real-ip"] as string) ||
    ((req.headers["x-forwarded-for"] as string) || "").split(",")[0].trim() ||
    req.ip
  if (!(sandbox && process.env.PAYFAST_SKIP_IP_CHECK === "true") && !(isPayfastIp(ip) || (ip && (await isPayfastHostIp(ip))))) {
    logger.warn(`[payfast-itn] rejected: source ip ${ip}`)
    return res.status(400).send("invalid source")
  }

  // 2. Signature.
  if (!verifySignature(data, passphrase)) {
    logger.warn(`[payfast-itn] rejected: bad signature for ${data.m_payment_id}`)
    return res.status(400).send("invalid signature")
  }

  if (data.merchant_id !== process.env.PAYFAST_MERCHANT_ID) {
    logger.warn(`[payfast-itn] rejected: merchant_id mismatch for ${data.m_payment_id}`)
    return res.status(400).send("invalid merchant")
  }

  const sessionId = data.m_payment_id
  const paymentModule = req.scope.resolve(Modules.PAYMENT)
  let session: any
  try {
    session = await paymentModule.retrievePaymentSession(sessionId)
  } catch {
    logger.warn(`[payfast-itn] rejected: unknown payment session ${sessionId}`)
    return res.status(400).send("unknown session")
  }

  // 3. Amount.
  const expected = Number(session.data?.expected_amount ?? session.amount)
  if (!amountsMatch(expected, data.amount_gross)) {
    logger.warn(`[payfast-itn] rejected: amount ${data.amount_gross} != ${expected} for ${sessionId}`)
    return res.status(400).send("amount mismatch")
  }

  // 4. Server confirmation with PayFast (param string without signature and passphrase).
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(data)) if (k !== "signature") params.append(k, v)
  try {
    const confirm = await fetch(`https://${payfastHost(sandbox)}/eng/query/validate`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    const body = (await confirm.text()).trim()
    if (body !== "VALID") {
      logger.warn(`[payfast-itn] rejected: server confirmation said "${body}" for ${sessionId}`)
      return res.status(400).send("not confirmed")
    }
  } catch (e: any) {
    logger.error(`[payfast-itn] server confirmation failed: ${e?.message ?? e}`)
    return res.status(500).send("confirmation error")
  }

  // Mark the session paid so provider.authorizePayment can authorize it, then let Medusa process it.
  if (data.payment_status === "COMPLETE") {
    await paymentModule.updatePaymentSession({
      id: session.id,
      amount: session.amount,
      currency_code: session.currency_code,
      data: { ...(session.data ?? {}), itn_status: "COMPLETE", pf_payment_id: data.pf_payment_id },
    } as any)
  }
  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  await eventBus.emit(
    {
      name: PaymentWebhookEvents.WebhookReceived,
      data: { provider: "payfast_payfast", payload: { data, rawData: raw, headers: req.headers } },
    },
    { attempts: 3 }
  )
  return res.sendStatus(200)
}
