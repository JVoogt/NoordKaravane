import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentOption,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types"
import { getBusinessConfig } from "../../lib/business"

export const PUDO_OPTION = "pudo-locker"
export const TCG_OPTION = "tcg-door"
export const COLLECT_OPTION = "workshop-collect"
const OPTIONS = [PUDO_OPTION, TCG_OPTION, COLLECT_OPTION]

/** Total parcel weight in grams from the cart items the provider is given (variant.weight is grams). */
export function parcelWeightG(context: Record<string, any>): number {
  return (context?.items ?? []).reduce((sum: number, i: any) => {
    const w = Number(i?.variant?.weight ?? i?.variant?.product?.weight ?? 0)
    return sum + w * Number(i?.quantity ?? 1)
  }, 0)
}

/** Pure pricing rule, exported for unit tests. Amounts are rands. */
export function shippingPrice(optionId: string, weightG: number, subtotal: number): number {
  const s = getBusinessConfig().shipping
  if (optionId === COLLECT_OPTION) return 0
  const free = subtotal >= s.free_shipping_threshold_zar && weightG <= s.free_shipping_max_weight_g
  if (free) return 0
  if (optionId === PUDO_OPTION && weightG <= s.pudo_max_weight_g) return s.pudo_locker_price_zar
  // TCG door-to-door, also the fallback for Pudo on a cart that is too heavy for a locker
  // (calculatePrice must not throw, or the whole shipping list fails; validateFulfillmentData blocks it).
  const band = s.tcg_bands.find((b) => b.max_weight_g === null || weightG <= b.max_weight_g)
  return band ? band.price_zar : s.tcg_bands[s.tcg_bands.length - 1].price_zar
}

/**
 * Weight-banded rates from config/business.json (shipping.*). Options: Pudo locker (small parcels only),
 * The Courier Guy door-to-door, and free collection from the workshop in Pretoria North.
 * The owner books the shipment in the TCG / Pudo portal and enters the waybill (tracking number)
 * and optional label URL as fulfilment data in Medusa Admin.
 */
class SaCourierFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "sa-courier"

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      { id: PUDO_OPTION, name: "Pudo Locker (locker-to-locker)" },
      { id: TCG_OPTION, name: "The Courier Guy (door-to-door)" },
      { id: COLLECT_OPTION, name: "Collect from the workshop (Pretoria North)" },
    ]
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    const id = (data as any)?.data?.id ?? (data as any)?.id
    return OPTIONS.includes(id)
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext
  ): Promise<CalculatedShippingOptionPrice> {
    // TODO(phase 2b): TCG Ship Logic API for live quotes using context.shipping_address + parcel weight.
    const c = context as any
    const subtotal = Number(c.item_total ?? c.item_subtotal ?? c.subtotal ?? 0)
    const amount = shippingPrice(String(optionData?.id), parcelWeightG(c), subtotal)
    return { calculated_amount: amount, is_calculated_price_tax_inclusive: true }
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return OPTIONS.includes(String(data?.id))
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext
  ): Promise<any> {
    if (optionData?.id === PUDO_OPTION) {
      const c = context as any
      const max = getBusinessConfig().shipping.pudo_max_weight_g
      if (parcelWeightG(c) > max) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Pudo lockers only take small parcels. Please choose The Courier Guy or collect from the workshop."
        )
      }
      const locker =
        (data?.pudo_locker as string | undefined) ??
        (c?.metadata?.pudo_locker as string | undefined) ??
        (c?.cart?.metadata?.pudo_locker as string | undefined)
      if (!locker || !String(locker).trim()) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Please choose your Pudo locker (pudo_locker) before selecting this shipping option."
        )
      }
      return { ...data, pudo_locker: String(locker).trim() }
    }
    return data
  }

  async createFulfillment(
    data: Record<string, unknown>,
    _items: any[],
    _order: any,
    _fulfillment: any
  ): Promise<CreateFulfillmentResult> {
    // The owner books in the portal. Tracking number / label URL are entered in Admin
    // (fulfilment "mark as shipped" labels) or passed through `data`.
    // TODO(phase 2): create the waybill via TCG Ship Logic API here and return real labels.
    const d = data as any
    const tracking = d?.tracking_number ?? d?.waybill
    const labels = tracking
      ? [{ tracking_number: String(tracking), tracking_url: d?.tracking_url ?? "", label_url: d?.label_url ?? "" }]
      : []
    return { data: { ...data }, labels }
  }

  async cancelFulfillment(_data: Record<string, unknown>): Promise<any> {
    return {}
  }

  async createReturnFulfillment(_fulfillment: Record<string, unknown>): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] }
  }

  async getFulfillmentDocuments(_data: Record<string, unknown>): Promise<never[]> {
    return []
  }

  async getReturnDocuments(_data: Record<string, unknown>): Promise<never[]> {
    return []
  }

  async getShipmentDocuments(_data: Record<string, unknown>): Promise<never[]> {
    return []
  }

  async retrieveDocuments(_fulfillmentData: Record<string, unknown>, _documentType: string): Promise<void> {}
}

export default SaCourierFulfillmentService
