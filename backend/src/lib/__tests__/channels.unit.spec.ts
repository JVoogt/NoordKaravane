import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const run = jest.fn(async (_args: unknown) => ({ result: [] }))
jest.mock("@medusajs/medusa/core-flows", () => ({
  ...jest.requireActual("@medusajs/medusa/core-flows"),
  linkProductsToSalesChannelWorkflow: () => ({ run: (args: unknown) => run(args) }),
}))

const kampiIds = jest.fn((): string[] | null => ["sc_A", "sc_X"])
jest.mock("../business", () => ({
  ...jest.requireActual("../business"),
  kampiBrandConfig: () => {
    const ids = kampiIds()
    return ids ? { sales_channel_ids: ids } : null
  },
}))

import { KAMPI_CHANNEL_NAME, KAMPI_KEY_TITLE, autoLinkChannelIds, linkProductToChannels, missingChannelLinks } from "../channels"

function container(opts: { defaultChannel?: string | null; existing?: string[]; productChannels?: string[] | null } = {}) {
  const listStores = jest.fn(async () => [{ id: "store_1", default_sales_channel_id: opts.defaultChannel === undefined ? "sc_DEFAULT" : opts.defaultChannel }])
  const listSalesChannels = jest.fn(async (filter: { id: string[] }) => filter.id.filter((id) => (opts.existing ?? ["sc_A"]).includes(id)).map((id) => ({ id })))
  const graph = jest.fn(async () => ({ data: [{ id: "prod_1", sales_channels: opts.productChannels === null ? null : (opts.productChannels ?? []).map((id) => ({ id })) }] }))
  const c: any = {
    resolve: (key: string) => {
      if (key === Modules.STORE) return { listStores }
      if (key === Modules.SALES_CHANNEL) return { listSalesChannels }
      if (key === ContainerRegistrationKeys.QUERY) return { graph }
      throw new Error(`unexpected resolve ${key}`)
    },
  }
  return { c, listStores, listSalesChannels, graph }
}

beforeEach(() => {
  run.mockClear()
  kampiIds.mockImplementation(() => ["sc_A", "sc_X"])
})

describe("channel names", () => {
  it("are the DD5 constants", () => {
    expect(KAMPI_CHANNEL_NAME).toBe("Kampi")
    expect(KAMPI_KEY_TITLE).toBe("Kampi")
  })
})

describe("missingChannelLinks (P7)", () => {
  it("returns only the missing product-channel pairs", () => {
    const products = [
      { id: "p_none", sales_channels: [] },
      { id: "p_some", sales_channels: [{ id: "sc_D" }] },
      { id: "p_all", sales_channels: [{ id: "sc_D" }, { id: "sc_K" }] },
      { id: "p_null", sales_channels: null },
      { id: "p_undef" },
    ]
    expect(missingChannelLinks(products, ["sc_D", "sc_K"])).toEqual({
      p_none: ["sc_D", "sc_K"],
      p_some: ["sc_K"],
      p_null: ["sc_D", "sc_K"],
      p_undef: ["sc_D", "sc_K"],
    })
  })

  it("collapses duplicate channel ids", () => {
    expect(missingChannelLinks([{ id: "p", sales_channels: [] }], ["sc_K", "sc_K", "sc_D"])).toEqual({ p: ["sc_K", "sc_D"] })
  })

  it("applying the result and asking again yields nothing", () => {
    const products = [
      { id: "p1", sales_channels: [{ id: "sc_D" }] },
      { id: "p2", sales_channels: [] as { id: string }[] },
    ]
    const missing = missingChannelLinks(products, ["sc_D", "sc_K"])
    const applied = products.map((p) => ({ id: p.id, sales_channels: [...p.sales_channels, ...(missing[p.id] ?? []).map((id) => ({ id }))] }))
    expect(missingChannelLinks(applied, ["sc_D", "sc_K"])).toEqual({})
  })
})

describe("autoLinkChannelIds", () => {
  it("is the store default plus the configured Kampi ids that exist in this database", async () => {
    const { c } = container({ existing: ["sc_A"] })
    await expect(autoLinkChannelIds(c)).resolves.toEqual(["sc_DEFAULT", "sc_A"])
  })

  it("with no valid Kampi block it is only the default", async () => {
    kampiIds.mockImplementation(() => null)
    const { c, listSalesChannels } = container()
    await expect(autoLinkChannelIds(c)).resolves.toEqual(["sc_DEFAULT"])
    expect(listSalesChannels).not.toHaveBeenCalled()
  })

  it("with no store default it is only the existing Kampi ids", async () => {
    const { c } = container({ defaultChannel: null, existing: ["sc_A"] })
    await expect(autoLinkChannelIds(c)).resolves.toEqual(["sc_A"])
  })
})

describe("linkProductToChannels", () => {
  it("links each missing channel once and returns them", async () => {
    const { c } = container({ productChannels: ["sc_DEFAULT"] })
    await expect(linkProductToChannels(c, "prod_1", ["sc_DEFAULT", "sc_A"])).resolves.toEqual(["sc_A"])
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ input: { id: "sc_A", add: ["prod_1"] } })
  })

  it("makes no workflow call when nothing is missing", async () => {
    const { c } = container({ productChannels: ["sc_DEFAULT", "sc_A"] })
    await expect(linkProductToChannels(c, "prod_1", ["sc_DEFAULT", "sc_A"])).resolves.toEqual([])
    expect(run).not.toHaveBeenCalled()
  })
})
