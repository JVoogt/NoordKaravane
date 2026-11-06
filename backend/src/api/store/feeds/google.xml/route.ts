import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildProductFeed } from "../../../../lib/feeds"

// Served at /store/feeds/google.xml. Needs the x-publishable-api-key header (all /store routes do).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const xml = await buildProductFeed(req.scope, "google")
  res.setHeader("Content-Type", "application/xml; charset=utf-8")
  res.setHeader("Cache-Control", "public, max-age=900")
  res.status(200).send(xml)
}
