import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils"
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
import { getBusinessConfig } from "../../lib/business"

/**
 * Direct EFT (manual bank transfer) payment provider. Provider id: pp_eft_eft.
 *
 * Flow: initiate -> authorize (immediately "authorized", i.e. pending capture) -> the
 * owner clicks "Capture payment" in Medusa Admin once the money lands -> "payment.captured".
 * Refunds and cancellations are manual (EFT back to the customer by the owner).
 */
class EftPaymentProviderService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "eft"

  constructor(container: Record<string, unknown>, options: Record<string, never>) {
    super(container, options)
  }

  static validateOptions(_options: Record<any, any>): void | never {}

  private instructions() {
    const b = getBusinessConfig()
    return {
      method: "eft",
      bank: { ...b.bank },
      payment_window_hours: b.eft_payment_window_hours,
      // The order display id is only known after the order exists; the storefront and emails
      // render "NK<display_id>" as the payment reference. Cart-time placeholder below.
      reference_prefix: "NK",
      reference_note: "Use your order number (e.g. NK1042) as the payment reference.",
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const id = `eft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    return {
      id,
      status: PaymentSessionStatus.PENDING,
      data: { id, ...this.instructions() },
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: { ...(input.data ?? {}), ...this.instructions() }, status: PaymentSessionStatus.PENDING }
  }

  async deletePayment(_input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: {} }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: { ...(input.data ?? {}), authorized_at: new Date().toISOString() },
    }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    // Called from the admin "Capture payment" button: the owner confirmed funds received.
    return { data: { ...(input.data ?? {}), paid_at: new Date().toISOString(), status: "paid" } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: { ...(input.data ?? {}), canceled_at: new Date().toISOString() } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    // Manual: the owner sends the money back by EFT; this only records it in Medusa.
    const refunds = Array.isArray((input.data as any)?.refunds) ? (input.data as any).refunds : []
    return {
      data: {
        ...(input.data ?? {}),
        refunds: [...refunds, { amount: input.amount, at: new Date().toISOString(), note: "manual EFT refund" }],
      },
    }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const d = (input.data ?? {}) as Record<string, any>
    if (d.status === "paid") return { status: PaymentSessionStatus.CAPTURED, data: d }
    if (d.canceled_at) return { status: PaymentSessionStatus.CANCELED, data: d }
    if (d.authorized_at) return { status: PaymentSessionStatus.AUTHORIZED, data: d }
    return { status: PaymentSessionStatus.PENDING, data: d }
  }

  async getWebhookActionAndData(_payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    return { action: "not_supported" }
  }
}

export default EftPaymentProviderService
