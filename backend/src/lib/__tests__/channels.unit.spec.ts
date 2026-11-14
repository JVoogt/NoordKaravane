import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const run = jest.fn(async (_args: unknown) => ({ result: [] }))
jest.mock("@medusajs/medusa/core-flows", () => ({
  ...jest.requireActual("@medusajs/medusa/core-flows"),
  linkProductsToSalesChannelWorkflow: () => ({ run: (args: unknown) => run(args) }),
}))

const kampiIds = jest.fn((): string[] | null => ["sc_A", "sc_X"])
const blockPresent = jest.fn(() => true)
jest.mock("../business", () => ({
  ...jest.requireActual("../business"),
  kampiChannelIds: () => kampiIds() ?? [],
  kampiBlockPresent: () => blockPresent(),
}))

import { KAMPI_CHANNEL_NAME, KAMPI_KEY_TITLE, autoLinkChannelIds, linkProductToChannels, missingChannelLinks, storeDefaultChannelId } from "../channels"

function container(opts: { defaultChannel?: string | null; existing?: string[]; productChannels?: string[] | null; storeFails?: boolean } = {}) {
  const listStores = jest.fn(async () => {
    if (opts.storeFails) throw new Error("store down")
    return [{ id: "store_1", default_sales_channel_id: opts.defaultChannel === undefined ? "sc_DEFAULT" : opts.defaultChannel }]
  })
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

describe("autoLinkChannelIds (the Kampi channels; the default is linked separately)", () => {
  it("is the configured Kampi ids that exist in this database, without the store default", async () => {
    const { c, listStores } = container({ existing: ["sc_A"] })
    await expect(autoLinkChannelIds(c)).resolves.toEqual(["sc_A"])
    expect(listStores).not.toHaveBeenCalled()
  })

  it("with no valid Kampi ids it is empty and makes no lookup", async () => {
    blockPresent.mockImplementation(() => false)
    kampiIds.mockImplementation(() => null)
    const { c, listSalesChannels } = container()
    await expect(autoLinkChannelIds(c)).resolves.toEqual([])
    expect(listSalesChannels).not.toHaveBeenCalled()
    blockPresent.mockImplementation(() => true)
  })

  it("warns once across calls when a brands.kampi block exists but its id list is empty", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    kampiIds.mockImplementation(() => null)
    let mod: typeof import("../channels") | undefined
    jest.isolateModules(() => {
      mod = require("../channels")
    })
    await expect(mod!.autoLinkChannelIds(container().c)).resolves.toEqual([])
    await expect(mod!.autoLinkChannelIds(container().c)).resolves.toEqual([])
    expect(warn.mock.calls.map((x) => String(x[0]))).toEqual([
      "[channel-link] brands.kampi has no usable sales_channel_ids; new products link to the default channel only",
    ])
    warn.mockRestore()
  })
})

describe("autoLinkChannelIds with configured ids missing from this database", () => {
  it("warns once across calls when none of the configured ids exist here", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    let mod: typeof import("../channels") | undefined
    jest.isolateModules(() => {
      mod = require("../channels")
    })
    await expect(mod!.autoLinkChannelIds(container({ existing: [] }).c)).resolves.toEqual([])
    await expect(mod!.autoLinkChannelIds(container({ existing: [] }).c)).resolves.toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toBe(
      "[channel-link] brands.kampi.sales_channel_ids [sc_A, sc_X] has no channel in this database; new products link to the default channel only"
    )
    warn.mockRestore()
  })
})

describe("storeDefaultChannelId", () => {
  it("is the store's default channel, read once per container", async () => {
    const { c, listStores } = container()
    await expect(storeDefaultChannelId(c)).resolves.toBe("sc_DEFAULT")
    await expect(storeDefaultChannelId(c)).resolves.toBe("sc_DEFAULT")
    expect(listStores).toHaveBeenCalledTimes(1)
  })

  it("is null, with a warn, when the store lookup throws; never throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const { c } = container({ storeFails: true })
    await expect(storeDefaultChannelId(c)).resolves.toBeNull()
    expect(String(warn.mock.calls[0][0])).toBe("[channels] could not read the store default sales channel: store down")
    warn.mockRestore()
  })
})

describe("linkProductToChannels", () => {
  it("links each missing channel once and returns them", async () => {
    const { c } = container({ productChannels: ["sc_DEFAULT"] })
    await expect(linkProductToChannels(c, "prod_1", ["sc_DEFAULT", "sc_A"])).resolves.toEqual(["sc_A"])
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ input: { id: "sc_A", add: ["prod_1"] } })
  })

  it("names the channel whose link failed", async () => {
    run.mockImplementationOnce(async () => {
      throw new Error("workflow down")
    })
    const { c } = container({ productChannels: [] })
    await expect(linkProductToChannels(c, "prod_1", ["sc_DEFAULT", "sc_A"])).rejects.toThrow("link to sc_DEFAULT failed: workflow down")
  })

  it("makes no workflow call when nothing is missing", async () => {
    const { c } = container({ productChannels: ["sc_DEFAULT", "sc_A"] })
    await expect(linkProductToChannels(c, "prod_1", ["sc_DEFAULT", "sc_A"])).resolves.toEqual([])
    expect(run).not.toHaveBeenCalled()
  })
})
