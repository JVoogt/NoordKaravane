import fs from "fs"
import os from "os"
import path from "path"
import { Modules } from "@medusajs/framework/utils"
import example from "../../../../config/business.example.json"

// Each case loads a fresh module graph; the real core-flows registers its workflows once per process only.
jest.mock("@medusajs/medusa/core-flows", () => ({ linkProductsToSalesChannelWorkflow: () => ({ run: async () => ({ result: [] }) }) }))

/**
 * Auto-link reads only brands.kampi.sales_channel_ids, from a real config file (no mocked business module): a block
 * whose styling keys are broken still links new products to the Kampi channel.
 */
const { brands: _b, ...exampleTop } = example as any
let tmp: string
const prevPath = process.env.BUSINESS_CONFIG_PATH

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nk-channels-cfg-"))
})
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevPath === undefined) delete process.env.BUSINESS_CONFIG_PATH
  else process.env.BUSINESS_CONFIG_PATH = prevPath
})

function loadWith(kampi: unknown): typeof import("../channels") {
  const p = path.join(tmp, `business-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(p, JSON.stringify({ ...exampleTop, brands: { kampi } }))
  process.env.BUSINESS_CONFIG_PATH = p
  let mod: typeof import("../channels") | undefined
  jest.isolateModules(() => {
    mod = require("../channels")
  })
  return mod!
}

const container: any = {
  resolve: (key: string) => {
    if (key === Modules.STORE) return { listStores: async () => [{ id: "store_1", default_sales_channel_id: "sc_DEFAULT" }] }
    if (key === Modules.SALES_CHANNEL) return { listSalesChannels: async (f: { id: string[] }) => f.id.filter((id) => id === "sc_A").map((id) => ({ id })) }
    throw new Error(`unexpected resolve ${key}`)
  },
}

describe("autoLinkChannelIds against a real config", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it("a block with a broken palette and no name still auto-links sc_A", async () => {
    const { autoLinkChannelIds } = loadWith({ sales_channel_ids: ["sc_A"], palette: { ink: "red" }, name: "" })
    await expect(autoLinkChannelIds(container)).resolves.toEqual(["sc_DEFAULT", "sc_A"])
  })

  it("a valid block with a blank tagline auto-links sc_A", async () => {
    const { autoLinkChannelIds } = loadWith({
      sales_channel_ids: ["sc_A"],
      name: "Example Store",
      shop_url: "https://store.example.test",
      palette: { ink: "#111111", paper: "#fafafa", accent: "#336699", muted: "#666666" },
      from_name: "Example Store",
      tagline: "",
    })
    await expect(autoLinkChannelIds(container)).resolves.toEqual(["sc_DEFAULT", "sc_A"])
  })
})
