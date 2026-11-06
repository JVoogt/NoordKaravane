import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { generateSignature, payfastHost } from "./signature"

type Options = {
  merchantId: string
  merchantKey: string
  passphrase?: string
  sandbox?: boolean
  siteUrl?: string
  backendUrl?: string
}

/**
 * PayFast redirect payment provider (SCAFFOLD, enabled with PAYFAST_ENABLED=true).
 * Provider id: pp_payfast_payfast.
 *
 * Flow:
 *  1. initiatePayment builds the signed form fields; the storefront POSTs them to `data.form_action`.
 *  2. PayFast calls our ITN endpoint (src/api/hooks/payfast/route.ts), which validates IP,
 *     signature, amount and server confirmation, marks the session data `itn_status=COMPLETE`
 *     and emits payment.webhook_received.
 *  3. getWebhookActionAndData tells Medusa to capture; authorizePayment confirms from session data.
 *
 * TODO(before go-live): storefront return/cancel pages, sandbox end-to-end test, refunds via the
 * PayFast dashboard or API (refundPayment here only records the refund in Medusa).
 */
class PayfastPaymentProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "payfast"
  protected options_: Options

  constructor(container: Record<string, unknown>, options: Options) {
    super(container, options)
    this.options_ = options
  }

  static validateOptions(options: Record<any, any>): void | never {
    if (!options.merchantId || !options.merchantKey) {
      throw new Error("PayFast: PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY are required when PAYFAST_ENABLED=true")
    }
  }

  private formFor(sessionId: string, amount: number, extra: Record<string, unknown>) {
    const o = this.options_
    const site = (o.siteUrl || "https://noordkaravane.co.za").replace(/\/$/, "") + "/shop" // storefront lives under /shop
    const backend = (o.backendUrl || "https://api.noordkaravane.co.za").replace(/\/$/, "")
    // Field order matters for the signature: PayFast's documented order.
    const fields: Record<string, string> = {
      merchant_id: o.merchantId,
      merchant_key: o.merchantKey,
      return_url: `${site}/checkout/payfast-return?session=${encodeURIComponent(sessionId)}`,
      cancel_url: `${site}/checkout?payment=cancelled`,
      notify_url: `${backend}/hooks/payfast`,
      m_payment_id: sessionId,
      amount: Number(amount).toFixed(2),
      item_name: `Noord Karavane order`,
    }
    if (extra.email) fields.email_address = String(extra.email)
    fields.signature = generateSignature(fields, o.passphrase)
    return {
      form_action: `https://${payfastHost(o.sandbox !== false)}/eng/process`,
      form_fields: fields,
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = String((input.data as any)?.session_id ?? "")
    const email = (input.context as any)?.customer?.email
    const form = this.formFor(sessionId, Number(input.amount), { email })
    return {
      id: sessionId,
      status: PaymentSessionStatus.PENDING,
      data: { session_id: sessionId, expected_amount: Number(input.amount).toFixed(2), ...form },
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const d = (input.data ?? {}) as Record<string, any>
    const sessionId = String(d.session_id ?? "")
    const form = this.formFor(sessionId, Number(input.amount), { email: (input.context as any)?.customer?.email })
    return { status: PaymentSessionStatus.PENDING, data: { ...d, expected_amount: Number(input.amount).toFixed(2), ...form } }
  }

  async deletePayment(_input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: {} }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const d = (input.data ?? {}) as Record<string, any>
    if (d.itn_status === "COMPLETE") return { status: PaymentSessionStatus.AUTHORIZED, data: d }
    return { status: PaymentSessionStatus.PENDING, data: d }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: { ...(input.data ?? {}), captured_at: new Date().toISOString() } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: { ...(input.data ?? {}), canceled_at: new Date().toISOString() } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    // TODO: PayFast refunds API. For now, refund from the PayFast dashboard and record it here.
    return { data: { ...(input.data ?? {}), refunded_manually_at: new Date().toISOString() } }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const d = (input.data ?? {}) as Record<string, any>
    if (d.captured_at) return { status: PaymentSessionStatus.CAPTURED, data: d }
    if (d.itn_status === "COMPLETE") return { status: PaymentSessionStatus.AUTHORIZED, data: d }
    if (d.itn_status === "CANCELLED") return { status: PaymentSessionStatus.CANCELED, data: d }
    return { status: PaymentSessionStatus.PENDING, data: d }
  }

  /** The ITN route has already verified everything; this just maps the payload to a Medusa action. */
  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    const d = (payload.data ?? {}) as Record<string, any>
    const sessionId = d.m_payment_id
    if (!sessionId) return { action: PaymentActions.NOT_SUPPORTED }
    if (d.payment_status === "COMPLETE") {
      return { action: PaymentActions.SUCCESSFUL, data: { session_id: sessionId, amount: Number(d.amount_gross) } as any }
    }
    if (d.payment_status === "CANCELLED") {
      return { action: PaymentActions.CANCELED, data: { session_id: sessionId, amount: Number(d.amount_gross) } as any }
    }
    return { action: PaymentActions.PENDING, data: { session_id: sessionId, amount: Number(d.amount_gross) } as any }
  }
}

export default PayfastPaymentProviderService
