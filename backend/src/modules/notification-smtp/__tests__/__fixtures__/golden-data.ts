import type { EmailData } from "../../templates"

/**
 * One fixed, made-up EmailData per template. The NK golden fixtures in ./nk-golden were rendered from exactly this
 * data with the example config (config/business.example.json) and SITE_URL unset, on the code before the Kampi
 * brand work. Change nothing here without regenerating them from that code.
 */
const items = [
  { title: "Gas regulator", variant: "Standard", quantity: 2, total: "R500,00", sku: "NK-GAS-1" },
  { title: "Trauma kit", quantity: 1, total: "R1 000,00", sku: "TFR-VEH-KIT" },
]

const order: EmailData = {
  display_id: 3,
  reference: "NK3",
  first_name: "Jan",
  items,
  total: "R1 630,00",
  shipping_total: "R130,00",
  shipping_method: "The Courier Guy",
  order_url: "https://noordkaravane.co.za/shop/order/confirmed/order_01ABC",
}

const staff: EmailData = {
  ...order,
  customer_email: "jan@example.com",
  customer_phone: "0820000000",
  reply_to: "jan@example.com",
  ship_to_lines: ["Jan Botha", "Example Kampeer", "1 Example Street", "Exampletown", "Gauteng", "0000"],
  payment_method: "EFT",
  payment_captured: false,
  collect_from_workshop: false,
  admin_order_url: "https://admin.noordkaravane.co.za/app/orders/order_01ABC",
  dropship_items: [{ supplier: "Example Supplier", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }],
  dropship_unnotified: [],
}

export const GOLDEN_TEMPLATES = [
  "order-placed-eft",
  "eft-reminder",
  "payment-received",
  "order-shipped",
  "order-canceled",
  "password-reset",
  "dropship-supplier",
  "staff-new-order",
  "staff-order-paid",
  "staff-payment-no-order",
] as const

export type GoldenTemplate = (typeof GOLDEN_TEMPLATES)[number]

export const STAFF_TEMPLATES: GoldenTemplate[] = ["staff-new-order", "staff-order-paid", "staff-payment-no-order"]

export const GOLDEN_DATA: Record<GoldenTemplate, EmailData> = {
  "order-placed-eft": { ...order, pudo_locker: "Example Locker 12" },
  "eft-reminder": { ...order, hours_left: 20 },
  "payment-received": order,
  "order-shipped": { ...order, carrier: "The Courier Guy", tracking_number: "TCG000111", tracking_url: "https://track.example.test/TCG000111" },
  "order-canceled": order,
  "password-reset": { reset_url: "https://admin.noordkaravane.co.za/app/reset-password?token=example-token" },
  "dropship-supplier": {
    display_id: 3,
    reference: "NK3",
    supplier: "Example Supplier",
    ship_to: "Jan Botha, 1 Example Street, Exampletown, 0000",
    shipping_method: "The Courier Guy",
    supplier_items: [{ title: "Trauma kit", variant: "Vehicle", sku: "TFR-VEH-KIT", quantity: 1 }],
  },
  "staff-new-order": staff,
  "staff-order-paid": { ...staff, payment_captured: true },
  "staff-payment-no-order": {
    payment_id: "pay_01EXAMPLE",
    payment_amount: "R1 630,00",
    payment_provider: "pp_payfast_payfast",
    admin_url: "https://admin.noordkaravane.co.za",
  },
}
