import { renderEmail, type EmailData } from "../templates"

const EM_DASH = "—"

const data = (over: Partial<EmailData> = {}): EmailData => ({
  display_id: 3,
  reference: "NK3",
  first_name: "Jan",
  items: [
    { title: "Gas regulator", variant: "Standard", quantity: 2, total: "R500,00", sku: "NK-GAS-1" },
    { title: "Trauma kit", quantity: 1, total: "R1 000,00", sku: "TFR-VEH-KIT" },
  ],
  shipping_total: "R130,00",
  shipping_method: "The Courier Guy",
  total: "R1 630,00",
  customer_email: "jan@example.com",
  customer_phone: "0821234567",
  ship_to_lines: ["Jan Botha", "Botha Kampeer", "12 Kerk Street", "Pretoria", "Gauteng", "0182"],
  payment_method: "EFT",
  payment_captured: false,
  collect_from_workshop: false,
  admin_order_url: "https://admin.noordkaravane.co.za/app/orders/order_01ABC",
  dropship_items: [],
  ...over,
})

const noEmDash = (r: { subject: string; html: string; text: string }) => {
  expect(r.subject).not.toContain(EM_DASH)
  expect(r.html).not.toContain(EM_DASH)
  expect(r.html).not.toContain("&mdash;")
  expect(r.text).not.toContain(EM_DASH)
}

describe("renderEmail staff-new-order", () => {
  it("EFT: subject has ref and total, body says to check the bank before packing", () => {
    const r = renderEmail("staff-new-order", data())
    expect(r.subject).toBe("New order NK3: awaiting EFT payment (R1 630,00)")
    expect(r.html).toContain("Awaiting EFT payment. Check the bank for reference NK3 before packing.")
    expect(r.text).toContain("Awaiting EFT payment. Check the bank for reference NK3 before packing.")
    noEmDash(r)
  })
  it("shows SKUs, contact details, shipping, ship-to and the admin link in html and text", () => {
    const r = renderEmail("staff-new-order", data())
    for (const s of ["NK-GAS-1", "TFR-VEH-KIT", "0821234567", "jan@example.com", "The Courier Guy", "R130,00", "Botha Kampeer", "12 Kerk Street", "Gauteng", "0182"]) {
      expect(r.html).toContain(s)
      expect(r.text).toContain(s)
    }
    expect(r.html).toContain('href="https://admin.noordkaravane.co.za/app/orders/order_01ABC"')
    expect(r.text).toContain("https://admin.noordkaravane.co.za/app/orders/order_01ABC")
    expect(r.text).toContain("Jan Botha\nBotha Kampeer\n12 Kerk Street\nPretoria\nGauteng\n0182")
  })
  it("PayFast captured vs pending wording", () => {
    const paid = renderEmail("staff-new-order", data({ payment_method: "PayFast", payment_captured: true }))
    expect(paid.subject).toBe("New order NK3: paid by PayFast (R1 630,00)")
    expect(paid.text).toContain("Paid online by PayFast")
    expect(paid.text).not.toContain("Awaiting EFT")
    const pending = renderEmail("staff-new-order", data({ payment_method: "PayFast", payment_captured: false }))
    expect(pending.subject).toBe("New order NK3: card payment pending (R1 630,00)")
    expect(pending.text).toContain("Card payment pending")
    expect(pending.text).not.toContain("Paid online by PayFast")
    noEmDash(paid)
    noEmDash(pending)
  })
  it("calls out the Pudo locker and workshop collection", () => {
    const r = renderEmail("staff-new-order", data({ pudo_locker: "Pudo Wonderpark", collect_from_workshop: true }))
    expect(r.html).toContain("Pudo Wonderpark")
    expect(r.text).toContain("Pudo locker: Pudo Wonderpark")
    expect(r.text).toContain("Collect from workshop")
  })
  it("HTML-escapes customer-supplied fields", () => {
    const r = renderEmail(
      "staff-new-order",
      data({ ship_to_lines: ["<script>alert(1)</script>", "1 <b>Main</b> Road"], customer_phone: "<img src=x>", pudo_locker: "<i>L</i>" })
    )
    expect(r.html).not.toContain("<script>")
    expect(r.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(r.html).not.toContain("<b>Main</b>")
    expect(r.html).not.toContain("<img src=x>")
    expect(r.html).not.toContain("<i>L</i>")
  })
  it("uses a staff footer, not the customer 'Reply to this email' footer", () => {
    const r = renderEmail("staff-new-order", data())
    expect(r.html).not.toContain("Questions? Reply to this email")
  })
})

describe("renderEmail staff-order-paid", () => {
  it("subject has ref and total, body lists next steps", () => {
    const r = renderEmail("staff-order-paid", data({ payment_captured: true }))
    expect(r.subject).toBe("Paid: order NK3 ready to ship (R1 630,00)")
    expect(r.text).toContain("Pack the items")
    expect(r.text).toContain("Book the courier for The Courier Guy")
    expect(r.text).toContain("create the fulfilment and mark it shipped with the tracking number")
    expect(r.text).toContain("12 Kerk Street")
    expect(r.html).toContain('href="https://admin.noordkaravane.co.za/app/orders/order_01ABC"')
    noEmDash(r)
  })
  it("says to prepare for collection or the Pudo locker drop", () => {
    expect(renderEmail("staff-order-paid", data({ collect_from_workshop: true })).text).toContain("Prepare the order for collection at the workshop")
    expect(renderEmail("staff-order-paid", data({ pudo_locker: "Pudo Wonderpark" })).text).toContain("Book the Pudo shipment to the customer's locker: Pudo Wonderpark")
  })
  it("calls out dropship lines so staff do not double-ship", () => {
    const r = renderEmail(
      "staff-order-paid",
      data({ dropship_items: [{ supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }] })
    )
    const head = "We are emailing The First Responders to ship these lines directly. Do not pack them. If no tracking number arrives, check with them:"
    expect(r.text).toContain(head)
    expect(r.text).toContain("1 x Trauma kit [TFR-VEH-KIT]")
    expect(r.html).toContain(head)
    expect(r.text).not.toContain("ships these lines directly")
    expect(r.text).not.toContain("We have emailed")
    noEmDash(r)
  })
  it("no dropship note when there are no dropship lines", () =>
    expect(renderEmail("staff-order-paid", data()).text).not.toContain("We are emailing"))
  it("HTML-escapes customer-supplied fields", () => {
    const r = renderEmail("staff-order-paid", data({ ship_to_lines: ["<script>x</script>"] }))
    expect(r.html).not.toContain("<script>")
  })
  it("a capture that leaves the order not fully paid does not claim payment is in", () => {
    const r = renderEmail("staff-order-paid", data({ payment_method: "PayFast", payment_captured: false }))
    expect(r.subject).toBe("Payment captured: order NK3 not fully paid yet (R1 630,00)")
    expect(r.text).toContain("A payment was captured for order NK3 but the order is not fully paid yet. Check the admin before packing.")
    expect(r.html).toContain("but the order is not fully paid yet. Check the admin before packing.")
    expect(r.text).not.toContain("Payment is in")
    expect(r.html).not.toContain("Payment is in")
    expect(r.subject).not.toContain("ready to ship")
    noEmDash(r)
  })
  it("all-dropship order: no packing or courier steps, staff wait for tracking and mark it shipped", () => {
    const r = renderEmail(
      "staff-order-paid",
      data({
        payment_captured: true,
        items: [{ title: "Trauma kit", quantity: 1, total: "R1 000,00", sku: "TFR-VEH-KIT" }],
        dropship_items: [{ supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }],
      })
    )
    expect(r.text).not.toContain("Pack the items")
    expect(r.text).not.toContain("Book the courier")
    expect(r.text).toContain("We are emailing The First Responders to ship everything on this order. Nothing to pack here.")
    expect(r.text).toContain("Watch for the tracking number from the supplier. If none arrives, check with them.")
    expect(r.text).toContain("mark it shipped with the tracking number")
    expect(r.html).toContain("We are emailing The First Responders to ship everything on this order.")
    expect(r.text).not.toContain("ships everything")
    noEmDash(r)
  })
  it("mixed order still says to pack and book the courier", () => {
    const r = renderEmail(
      "staff-order-paid",
      data({ payment_captured: true, dropship_items: [{ supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }] })
    )
    expect(r.text).toContain("Pack the items")
    expect(r.text).toContain("Book the courier")
  })
  it("all-dropship order with two suppliers: plural grammar", () => {
    const r = renderEmail(
      "staff-order-paid",
      data({
        payment_captured: true,
        items: [
          { title: "Trauma kit", quantity: 1, total: "R1 000,00", sku: "TFR-VEH-KIT" },
          { title: "Solar panel", quantity: 1, total: "R2 000,00", sku: "LUM-SOL-1" },
        ],
        dropship_items: [
          { supplier: "The First Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 },
          { supplier: "Lumeno", title: "Solar panel", sku: "LUM-SOL-1", quantity: 1 },
        ],
      })
    )
    expect(r.text).toContain("We are emailing The First Responders and Lumeno to ship everything on this order. Nothing to pack here.")
    expect(r.text).toContain("Watch for the tracking numbers from the suppliers. If none arrives, check with them.")
    expect(r.text).not.toMatch(/and Lumeno ships/)
    noEmDash(r)
  })
  it("flags lines whose supplier has no valid email: not notified, staff order or pack them", () => {
    const r = renderEmail(
      "staff-order-paid",
      data({
        payment_captured: true,
        dropship_unnotified: [{ supplier: "The <First> Responders", title: "Trauma kit", sku: "TFR-VEH-KIT", quantity: 1 }],
      } as any)
    )
    const head = "has no valid email in the shop config, so they were NOT notified. Order these lines from them yourself or pack them:"
    expect(r.text).toContain(`The <First> Responders ${head}`)
    expect(r.text).toContain("1 x Trauma kit [TFR-VEH-KIT]")
    expect(r.html).toContain(`The &lt;First&gt; Responders ${head}`)
    expect(r.text).not.toContain("We are emailing")
    expect(r.text).toContain("Pack the items")
    noEmDash(r)
  })
})

describe("renderEmail staff-payment-no-order", () => {
  const d: EmailData = {
    payment_id: "pay_01XYZ",
    payment_amount: "R1 630,00",
    payment_provider: "pp_payfast_payfast",
    admin_url: "https://admin.noordkaravane.co.za",
  }
  it("subject names the payment, body gives amount, provider and the admin link", () => {
    const r = renderEmail("staff-payment-no-order", d)
    expect(r.subject).toBe("Payment pay_01XYZ captured with no order: check it")
    for (const s of ["pay_01XYZ", "R1 630,00", "pp_payfast_payfast", "https://admin.noordkaravane.co.za/app/orders"]) {
      expect(r.text).toContain(s)
      expect(r.html).toContain(s)
    }
    expect(r.text).toContain("no order is linked to it")
    noEmDash(r)
  })
  it("copes with an unknown amount", () => {
    const r = renderEmail("staff-payment-no-order", { payment_id: "pay_01XYZ" })
    expect(r.text).toContain("Amount: unknown")
    noEmDash(r)
  })
})

describe("customer emails stay unchanged by the SKU field", () => {
  it("payment-received does not render SKUs", () => {
    const r = renderEmail("payment-received", data())
    expect(r.text).not.toContain("NK-GAS-1")
    expect(r.html).not.toContain("NK-GAS-1")
  })
})
