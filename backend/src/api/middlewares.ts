import { defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      // PayFast ITN posts application/x-www-form-urlencoded; keep the raw body so the
      // signature is checked against the exact field order PayFast sent.
      matcher: "/hooks/payfast",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
  ],
})
