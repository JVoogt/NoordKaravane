import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildProductFeed } from "../../../lib/feeds"

// Served at /feeds/meta.xml. Public copy for Meta / Google fetchers, which cannot send headers.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const xml = await buildProductFeed(req.scope, "meta")
  res.setHeader("Content-Type", "application/xml; charset=utf-8")
  res.setHeader("Cache-Control", "public, max-age=900")
  res.status(200).send(xml)
}
