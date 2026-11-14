import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const createApiKeys = jest.fn(async (_a: any): Promise<any> => ({ result: [{ id: "apk_NEW", token: "pk_new_made_up" }] }))
const linkKey = jest.fn(async (_a: any): Promise<any> => ({ result: [] }))
const noop = jest.fn(async (_a: any): Promise<any> => ({ result: [] }))
jest.mock("@medusajs/medusa/core-flows", () => ({
  createApiKeysWorkflow: () => ({ run: (a: any) => createApiKeys(a) }),
  createSalesChannelsWorkflow: () => ({ run: (a: any) => noop(a) }),
  linkProductsToSalesChannelWorkflow: () => ({ run: (a: any) => noop(a) }),
  linkSalesChannelsToApiKeyWorkflow: () => ({ run: (a: any) => linkKey(a) }),
  linkSalesChannelsToStockLocationWorkflow: () => ({ run: (a: any) => noop(a) }),
}))

import setupKampiChannel from "../setup-kampi-channel"

type Key = { id: string; token: string; revoked_at: string | null; sales_channels: { id: string }[] }

/** Fake Query over one Kampi channel, one stock location, one product already on the channel, and the given keys. */
function fake(keys: Key[]) {
  const byId = (id: string): Key | undefined =>
    keys.find((k) => k.id === id) ?? (id === "apk_NEW" ? { id: "apk_NEW", token: "pk_new_made_up", revoked_at: null, sales_channels: [{ id: "sc_K" }] } : undefined)
  const graph = jest.fn(async ({ entity, filters, fields }: any) => {
    if (entity === "sales_channel" && filters?.name) return { data: [{ id: "sc_K" }] }
    if (entity === "sales_channel" && filters?.id) return { data: [{ id: "sc_K", stock_locations: [{ id: "sloc_1" }] }] }
    if (entity === "api_key" && filters?.id) {
      const k = byId(filters.id)
      return { data: k ? [k] : [] }
    }
    if (entity === "api_key") {
      // Like Medusa Query: revoked_at is only returned when asked for.
      return { data: keys.map((k) => (fields.includes("revoked_at") ? k : { ...k, revoked_at: undefined })) }
    }
    if (entity === "stock_location") return { data: [{ id: "sloc_1" }] }
    if (entity === "product") return { data: [{ id: "prod_1", sales_channels: [{ id: "sc_K" }] }] }
    return { data: [] }
  })
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const container: any = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) return { graph }
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      throw new Error(`unexpected resolve ${key}`)
    },
  }
  return { container }
}

let out: string[]
beforeEach(() => {
  createApiKeys.mockClear()
  linkKey.mockClear()
  out = []
  jest.spyOn(console, "log").mockImplementation((m: unknown) => {
    out.push(String(m))
  })
})
afterEach(() => jest.restoreAllMocks())

describe("setup-kampi-channel publishable key", () => {
  it("skips a revoked Kampi key and reuses the live one", async () => {
    const { container } = fake([
      { id: "apk_OLD", token: "pk_revoked_made_up", revoked_at: "2026-11-01T00:00:00Z", sales_channels: [{ id: "sc_K" }] },
      { id: "apk_LIVE", token: "pk_live_made_up", revoked_at: null, sales_channels: [{ id: "sc_K" }] },
    ])
    await setupKampiChannel({ container } as any)
    expect(createApiKeys).not.toHaveBeenCalled()
    expect(out).toContain("KAMPI_PUBLISHABLE_KEY=pk_live_made_up")
  })

  it("creates a new key when the only Kampi key is revoked", async () => {
    const { container } = fake([{ id: "apk_OLD", token: "pk_revoked_made_up", revoked_at: "2026-11-01T00:00:00Z", sales_channels: [{ id: "sc_K" }] }])
    await setupKampiChannel({ container } as any)
    expect(createApiKeys).toHaveBeenCalledTimes(1)
    expect(out).toContain("KAMPI_PUBLISHABLE_KEY=pk_new_made_up")
    expect(out.join("\n")).not.toContain("pk_revoked_made_up")
  })
})
