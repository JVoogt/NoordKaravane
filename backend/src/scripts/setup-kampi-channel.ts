import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkProductsToSalesChannelWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { KAMPI_CHANNEL_NAME, KAMPI_KEY_TITLE, missingChannelLinks } from "../lib/channels"

const LOCATION_NAME = "Noord Karavane Workshop"
const PAGE = 200

/**
 * Idempotent setup of the Kampi store's sales channel. Run: npx medusa exec ./src/scripts/setup-kampi-channel.ts
 * Each step is find-or-create:
 *   1. the "Kampi" sales channel
 *   2. the "Kampi" publishable key (never a revoked one), linked to exactly the Kampi channel (any other channel is removed from it, so a
 *      cart created with this key always lands on the Kampi channel)
 *   3. the channel linked to the "Noord Karavane Workshop" stock location (shipping options list for Kampi carts)
 *   4. every product linked to the Kampi channel
 * then re-reads and asserts all of it, and prints the channel id, the key token and a JSON summary line.
 * Touches neither the Webshop nor the Default channel or key. Never reads brands.kampi (it runs before that exists).
 */
export default async function setupKampiChannel({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const found = async (entity: string, filters: Record<string, unknown>, fields = ["id"]) =>
    ((await query.graph({ entity, fields, filters })).data as any[])[0]

  // 1. Channel
  let channel = await found("sales_channel", { name: KAMPI_CHANNEL_NAME })
  const channelCreated = !channel
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: KAMPI_CHANNEL_NAME, description: "store.kampi.co.za" }] },
    })
    channel = result[0]
    logger.info(`[kampi-channel] created sales channel ${channel.id}`)
  }
  const kampiId: string = channel.id

  // 2. Publishable key, linked to exactly the Kampi channel. A revoked key is never reused: if only revoked ones
  // exist, a new key is created.
  const keyFields = ["id", "token", "sales_channels.id"]
  const kampiKeys = (await query.graph({ entity: "api_key", fields: [...keyFields, "revoked_at"], filters: { title: KAMPI_KEY_TITLE, type: "publishable" } }))
    .data as any[]
  let key = kampiKeys.find((k) => k.revoked_at == null)
  const revokedSkipped = kampiKeys.filter((k) => k.revoked_at != null).length
  if (revokedSkipped) logger.warn(`[kampi-channel] skipped ${revokedSkipped} revoked "${KAMPI_KEY_TITLE}" key(s)`)
  const keyCreated = !key
  if (!key) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: KAMPI_KEY_TITLE, type: "publishable", created_by: "" }] },
    })
    key = { ...result[0], sales_channels: [] }
    logger.info(`[kampi-channel] created publishable key ${key.id}`)
  }
  const keyChannels: string[] = (key.sales_channels ?? []).map((c: { id: string }) => c.id)
  const add = keyChannels.includes(kampiId) ? [] : [kampiId]
  const remove = keyChannels.filter((id) => id !== kampiId)
  if (add.length || remove.length) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add, remove } })
    if (remove.length) logger.warn(`[kampi-channel] removed ${remove.length} other channel(s) from the Kampi key`)
  }

  // 3. Stock location
  const location = await found("stock_location", { name: LOCATION_NAME })
  if (!location) throw new Error(`[kampi-channel] stock location "${LOCATION_NAME}" not found; run the seed first. Nothing further was linked.`)
  const linkedLocations = async () =>
    ((await found("sales_channel", { id: kampiId }, ["id", "stock_locations.id"]))?.stock_locations ?? []).map((l: { id: string }) => l.id) as string[]
  const locationLinked = !(await linkedLocations()).includes(location.id)
  if (locationLinked) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [kampiId] } })
  }

  // 4. Every product on the Kampi channel
  const allProducts = async () => {
    const out: { id: string; sales_channels?: { id: string }[] | null }[] = []
    for (let skip = 0; ; skip += PAGE) {
      const { data } = await query.graph({ entity: "product", fields: ["id", "sales_channels.id"], pagination: { skip, take: PAGE, order: { id: "ASC" } } })
      out.push(...(data as any[]))
      if (data.length < PAGE) return out
    }
  }
  const products = await allProducts()
  const toLink = Object.keys(missingChannelLinks(products, [kampiId]))
  for (let i = 0; i < toLink.length; i += PAGE) {
    await linkProductsToSalesChannelWorkflow(container).run({ input: { id: kampiId, add: toLink.slice(i, i + PAGE) } })
  }

  // 5. Re-read and assert
  const keyAfter = await found("api_key", { id: key.id }, keyFields)
  const keyChannelsAfter: string[] = (keyAfter?.sales_channels ?? []).map((c: { id: string }) => c.id)
  if (keyChannelsAfter.length !== 1 || keyChannelsAfter[0] !== kampiId)
    throw new Error(`[kampi-channel] the Kampi key must be linked to exactly the Kampi channel, found ${JSON.stringify(keyChannelsAfter)}`)
  const productsAfter = await allProducts()
  const stillMissing = Object.keys(missingChannelLinks(productsAfter, [kampiId])).length
  if (stillMissing) throw new Error(`[kampi-channel] ${stillMissing} product(s) still not on the Kampi channel`)
  if (!(await linkedLocations()).includes(location.id)) throw new Error(`[kampi-channel] the Kampi channel is not linked to "${LOCATION_NAME}"`)

  // 6. Output (the token is a publishable key: it is public by design, but stays out of git)
  console.log(`KAMPI_SALES_CHANNEL_ID=${kampiId}`)
  console.log(`KAMPI_PUBLISHABLE_KEY=${keyAfter.token}`)
  console.log(
    "kampi-channel " +
      JSON.stringify({
        channel_created: channelCreated,
        key_created: keyCreated,
        location_linked: locationLinked,
        products_linked: toLink.length,
        products_total: productsAfter.length,
      })
  )
}
