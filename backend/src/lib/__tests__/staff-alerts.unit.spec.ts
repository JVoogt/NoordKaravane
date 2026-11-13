import { adminUrl, staffAlertRecipients, staffAlertRecipientsWithDropped } from "../business"
import { staffOrderEmailData } from "../orders"

describe("staffAlertRecipients", () => {
  it("uses staff_order_alerts when it is a non-empty array", () =>
    expect(staffAlertRecipients({ email_orders: "orders@example.com", staff_order_alerts: ["a@example.com", "b@example.com"] })).toEqual([
      "a@example.com",
      "b@example.com",
    ]))
  it("falls back to email_orders when staff_order_alerts is missing or empty", () => {
    expect(staffAlertRecipients({ email_orders: "orders@example.com" })).toEqual(["orders@example.com"])
    expect(staffAlertRecipients({ email_orders: "orders@example.com", staff_order_alerts: [] })).toEqual(["orders@example.com"])
  })
  it("drops placeholders, empty strings and values without @", () =>
    expect(
      staffAlertRecipients({
        email_orders: "orders@example.com",
        staff_order_alerts: ["", "  ", "REPLACE_ME", "{{STAFF_EMAIL}}", "not-an-email", "ok@example.com"],
      })
    ).toEqual(["ok@example.com"]))
  it("dedupes case-insensitively, keeping the first spelling", () =>
    expect(
      staffAlertRecipients({ email_orders: "x@example.com", staff_order_alerts: ["Staff@Example.com", "staff@example.com", " STAFF@example.com "] })
    ).toEqual(["Staff@Example.com"]))
  it("falls back to email_orders when every staff_order_alerts value is a placeholder or invalid", () => {
    expect(staffAlertRecipients({ email_orders: "orders@example.com", staff_order_alerts: ["REPLACE_ME"] })).toEqual(["orders@example.com"])
    expect(staffAlertRecipients({ email_orders: "orders@example.com", staff_order_alerts: ["", "{{STAFF}}", "typo.example.com"] })).toEqual([
      "orders@example.com",
    ])
  })
  it("returns an empty list when nothing usable is configured", () => {
    expect(staffAlertRecipients({ email_orders: "REPLACE_ME" })).toEqual([])
    expect(staffAlertRecipients({ email_orders: "REPLACE_ME", staff_order_alerts: ["REPLACE_ME"] })).toEqual([])
  })
})

describe("staffAlertRecipientsWithDropped", () => {
  it("names values dropped as invalid, but not blanks or placeholders", () =>
    expect(
      staffAlertRecipientsWithDropped({
        email_orders: "orders@example.com",
        staff_order_alerts: ["", "REPLACE_ME", "{{STAFF}}", "staff.example.com", "ok@example.com"],
      })
    ).toEqual({ recipients: ["ok@example.com"], dropped: ["staff.example.com"] }))
  it("also names an invalid email_orders when the fallback is used", () =>
    expect(staffAlertRecipientsWithDropped({ email_orders: "orders.example.com", staff_order_alerts: ["typo"] })).toEqual({
      recipients: [],
      dropped: ["typo", "orders.example.com"],
    }))
})

describe("staffAlertRecipientsWithDropped with a non-array staff_order_alerts", () => {
  it("treats a single string as a one-item list", () =>
    expect(staffAlertRecipientsWithDropped({ email_orders: "orders@example.com", staff_order_alerts: "staff@example.com" as any })).toEqual({
      recipients: ["staff@example.com"],
      dropped: [],
    }))
  it("names any other non-array value as dropped and falls back to email_orders", () => {
    expect(staffAlertRecipientsWithDropped({ email_orders: "orders@example.com", staff_order_alerts: { a: "x@example.com" } as any })).toEqual({
      recipients: ["orders@example.com"],
      dropped: ['{"a":"x@example.com"}'],
    })
    expect(staffAlertRecipientsWithDropped({ email_orders: "orders@example.com", staff_order_alerts: 42 as any })).toEqual({
      recipients: ["orders@example.com"],
      dropped: ["42"],
    })
  })
  it("names non-string array entries as dropped", () =>
    expect(
      staffAlertRecipientsWithDropped({ email_orders: "orders@example.com", staff_order_alerts: [42, { a: 1 }, "ok@example.com"] as any })
    ).toEqual({ recipients: ["ok@example.com"], dropped: ["42", '{"a":1}'] }))
  it("treats null as unset", () =>
    expect(staffAlertRecipientsWithDropped({ email_orders: "orders@example.com", staff_order_alerts: null as any })).toEqual({
      recipients: ["orders@example.com"],
      dropped: [],
    }))
})

describe("adminUrl", () => {
  const prev = process.env.ADMIN_BACKEND_URL
  afterEach(() => {
    if (prev === undefined) delete process.env.ADMIN_BACKEND_URL
    else process.env.ADMIN_BACKEND_URL = prev
  })
  it("defaults to the admin host", () => {
    delete process.env.ADMIN_BACKEND_URL
    expect(adminUrl()).toBe("https://admin.noordkaravane.co.za")
  })
  it("reads ADMIN_BACKEND_URL and strips the trailing slash", () => {
    process.env.ADMIN_BACKEND_URL = "https://admin.staging.example.com/"
    expect(adminUrl()).toBe("https://admin.staging.example.com")
  })
})

describe("staffOrderEmailData", () => {
  const base = {
    id: "order_01ABC",
    display_id: 3,
    email: "jan@example.com",
    total: 1630,
    shipping_total: 130,
    metadata: {},
    items: [
      { product_title: "Gas regulator", variant_title: "Standard", quantity: 2, total: 500, variant_sku: "NK-GAS-1" },
      { product_title: "Trauma kit", quantity: 1, total: 1000, variant_sku: "TFR-VEH-KIT" },
    ],
    shipping_address: {
      first_name: "Jan",
      last_name: "Botha",
      company: "Botha Kampeer",
      address_1: "12 Kerk Street",
      address_2: "Unit 4",
      city: "Pretoria",
      province: "Gauteng",
      postal_code: "0182",
      phone: "0821234567",
    },
    shipping_methods: [{ name: "The Courier Guy" }],
  }
  const eft = { ...base, payment_collections: [{ payments: [{ provider_id: "pp_eft_eft", captured_at: null }] }] }
  const payfastCaptured = {
    ...base,
    payment_collections: [{ payments: [{ provider_id: "pp_payfast_payfast", captured_at: "2026-11-12T08:00:00Z" }] }],
  }
  const payfastPending = { ...base, payment_collections: [{ payments: [{ provider_id: "pp_payfast_payfast", captured_at: null }] }] }

  beforeEach(() => {
    process.env.ADMIN_BACKEND_URL = "https://admin.noordkaravane.co.za"
  })

  it("maps contact, ship-to, SKU and the admin link for an EFT order", () => {
    const d = staffOrderEmailData(eft)
    expect(d.reference).toBe("NK3")
    expect(d.customer_email).toBe("jan@example.com")
    expect(d.customer_phone).toBe("0821234567")
    expect(d.reply_to).toBe("jan@example.com")
    expect(d.ship_to_lines).toEqual(["Jan Botha", "Botha Kampeer", "12 Kerk Street", "Unit 4", "Pretoria", "Gauteng", "0182"])
    expect(d.items?.map((i) => i.sku)).toEqual(["NK-GAS-1", "TFR-VEH-KIT"])
    expect(d.admin_order_url).toBe("https://admin.noordkaravane.co.za/app/orders/order_01ABC")
    expect(d.payment_method).toBe("EFT")
    expect(d.payment_captured).toBe(false)
    expect(d.collect_from_workshop).toBe(false)
  })
  it("reports PayFast as paid only when a payment is captured", () => {
    expect(staffOrderEmailData(payfastCaptured)).toMatchObject({ payment_method: "PayFast", payment_captured: true })
    expect(staffOrderEmailData(payfastPending)).toMatchObject({ payment_method: "PayFast", payment_captured: false })
  })
  it("omits a missing company and address_2 from the ship-to lines", () => {
    const d = staffOrderEmailData({ ...eft, shipping_address: { ...base.shipping_address, company: "", address_2: null } })
    expect(d.ship_to_lines).toEqual(["Jan Botha", "12 Kerk Street", "Pretoria", "Gauteng", "0182"])
  })
  it("flags collect from workshop and the Pudo locker from metadata", () => {
    const d = staffOrderEmailData({ ...eft, metadata: { collect_from_workshop: true, pudo_locker: "Pudo Wonderpark" } })
    expect(d.collect_from_workshop).toBe(true)
    expect(d.pudo_locker).toBe("Pudo Wonderpark")
  })
  it("lists the lines a dropship supplier ships", () => {
    const d = staffOrderEmailData(payfastCaptured, { "TFR-": { name: "The First Responders", email: "tfr@example.com" } })
    expect(d.dropship_items).toEqual([{ supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
    expect(staffOrderEmailData(payfastCaptured).dropship_items).toEqual([])
  })
  it("lists lines whose supplier has no usable email as not notified, not as dropship lines", () => {
    const d: any = staffOrderEmailData(payfastCaptured, { "TFR-": { name: "The First Responders", email: "tfr.example.com" } })
    expect(d.dropship_items).toEqual([])
    expect(d.dropship_unnotified).toEqual([{ supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
    const ok: any = staffOrderEmailData(payfastCaptured, { "TFR-": { name: "The First Responders", email: "tfr@example.com" } })
    expect(ok.dropship_unnotified).toEqual([])
  })
  it("a malformed dropship_suppliers entry does not throw: its lines are not notified, named after the prefix", () => {
    for (const entry of [null, "x@y.com"]) {
      const d: any = staffOrderEmailData(payfastCaptured, { "TFR-": entry } as any)
      expect(d.dropship_items).toEqual([])
      expect(d.dropship_unnotified).toEqual([{ supplier: '"TFR-" supplier', title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
    }
  })
  it("a placeholder supplier name falls back to the prefix in the staff data", () => {
    const d: any = staffOrderEmailData(payfastCaptured, { "TFR-": { name: "REPLACE_ME", email: "tfr@example.com" } })
    expect(d.dropship_items).toEqual([{ supplier: '"TFR-" supplier', title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }])
  })
})
