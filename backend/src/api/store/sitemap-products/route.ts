import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildSitemapProducts } from "../../../lib/feeds"

// GET /store/sitemap-products -> [{ handle, updated_at, images }]
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "public, max-age=300")
  res.json(await buildSitemapProducts(req.scope))
}
