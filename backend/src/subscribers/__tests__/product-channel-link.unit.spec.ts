import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const run = jest.fn(async (_args: unknown): Promise<unknown> => ({ result: [] }))
jest.mock("@medusajs/medusa/core-flows", () => ({
  ...jest.requireActual("@medusajs/medusa/core-flows"),
  linkProductsToSalesChannelWorkflow: () => ({ run: (args: unknown) => run(args) }),
}))
jest.mock("../../lib/business", () => ({
  ...jest.requireActual("../../lib/business"),
  kampiChannelIds: () => ["sc_K"],
}))

import productChannelLink, { config } from "../product-channel-link"

type Fail = Partial<Record<"graph" | "listStores" | "listSalesChannels", boolean>>

function fake(productChannels: string[], fail: Fail = {}) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const boom = (what: string) => {
    throw new Error(`${what} down`)
  }
  const c: any = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      if (key === Modules.STORE) return { listStores: async () => (fail.listStores ? boom("store") : [{ default_sales_channel_id: "sc_D" }]) }
      if (key === Modules.SALES_CHANNEL)
        return { listSalesChannels: async (f: { id: string[] }) => (fail.listSalesChannels ? boom("channels") : f.id.map((id) => ({ id }))) }
      if (key === ContainerRegistrationKeys.QUERY)
        return { graph: async () => (fail.graph ? boom("query") : { data: [{ id: "prod_1", sales_channels: productChannels.map((id) => ({ id })) }] }) }
      throw new Error(`unexpected resolve ${key}`)
    },
  }
  return { c, logger }
}

const event = (c: any) => ({ event: { data: { id: "prod_1" }, name: "product.created" }, container: c }) as any
const logs = (fn: jest.Mock) => fn.mock.calls.map((x) => String(x[0])).join("\n")

beforeEach(() => {
  run.mockReset()
  run.mockImplementation(async () => ({ result: [] }))
})

describe("product.created channel link subscriber", () => {
  it("listens to product.created", () => {
    expect(config.event).toBe("product.created")
  })

  it("links the missing channels and logs at info", async () => {
    const { c, logger } = fake(["sc_D"])
    await productChannelLink(event(c))
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ input: { id: "sc_K", add: ["prod_1"] } })
    expect(logs(logger.info)).toContain("[channel-link] linked prod_1 to 1 channel(s)")
  })

  it("makes no workflow call and logs nothing when nothing is missing", async () => {
    const { c, logger } = fake(["sc_D", "sc_K"])
    await productChannelLink(event(c))
    expect(run).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("the Kampi lookup throws: the product still gets the default link, and the warn names Kampi", async () => {
    const { c, logger } = fake([], { listSalesChannels: true })
    await expect(productChannelLink(event(c))).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ input: { id: "sc_D", add: ["prod_1"] } })
    expect(logs(logger.warn)).toBe("[channel-link] prod_1: Kampi channel link failed: channels down; rerun setup-kampi-channel")
  })

  it("the default read throws: the Kampi link is still made, and the warn names the admin repair", async () => {
    const { c, logger } = fake([], { listStores: true })
    await expect(productChannelLink(event(c))).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ input: { id: "sc_K", add: ["prod_1"] } })
    expect(logs(logger.warn)).toBe(
      "[channel-link] prod_1: default sales channel link failed: store down; add the product to the default sales channel in admin"
    )
  })

  it("the product read throws: resolves with one warn per channel group (P9)", async () => {
    const { c, logger } = fake([], { graph: true })
    await expect(productChannelLink(event(c))).resolves.toBeUndefined()
    expect(logs(logger.warn)).toBe(
      [
        "[channel-link] prod_1: default sales channel link failed: query down; add the product to the default sales channel in admin",
        "[channel-link] prod_1: Kampi channel link failed: query down; rerun setup-kampi-channel",
      ].join("\n")
    )
  })

  it("resolves and warns when the link workflow throws (P9)", async () => {
    run.mockImplementation(async () => {
      throw new Error("workflow down")
    })
    const { c, logger } = fake(["sc_D"])
    await expect(productChannelLink(event(c))).resolves.toBeUndefined()
    expect(logs(logger.warn)).toBe("[channel-link] prod_1: Kampi channel link failed: link to sc_K failed: workflow down; rerun setup-kampi-channel")
  })
})
