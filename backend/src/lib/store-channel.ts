import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

/* Kept apart from channels.ts so lib/orders can use it without loading the core-flows workflows. */

const defaultChannelCache = new WeakMap<object, string>()

/** The store's default sales channel id (null when the store has none). Throws when the lookup fails. Cached per container once found. */
export async function readStoreDefault(container: MedusaContainer): Promise<string | null> {
  const hit = defaultChannelCache.get(container)
  if (hit) return hit
  const [store] = await container.resolve(Modules.STORE).listStores()
  const id = store?.default_sales_channel_id ?? null
  if (id) defaultChannelCache.set(container, id)
  return id
}

/**
 * The store's default sales channel id: NK's own channel, which channel decisions (CAPI, the staff channel label)
 * compare against. Null, with a warn, when it cannot be read; never throws. Cached per container (one per process).
 */
export async function storeDefaultChannelId(container: MedusaContainer): Promise<string | null> {
  try {
    return await readStoreDefault(container)
  } catch (e: any) {
    console.warn(`[channels] could not read the store default sales channel: ${e?.message ?? e}`)
    return null
  }
}
