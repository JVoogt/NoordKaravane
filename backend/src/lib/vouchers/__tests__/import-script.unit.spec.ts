import fs from "fs"
import os from "os"
import path from "path"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const updateCampaignsRun = jest.fn()
jest.mock("@medusajs/medusa/core-flows", () => ({
  updateCampaignsWorkflow: jest.fn(() => ({ run: (...a: any[]) => updateCampaignsRun(...a) })),
}))
const findOrCreateCampaign = jest.fn()
const createVoucherPromotion = jest.fn()
jest.mock("../service", () => ({
  findOrCreateCampaign: (...a: any[]) => findOrCreateCampaign(...a),
  createVoucherPromotion: (...a: any[]) => createVoucherPromotion(...a),
}))

import importVouchers from "../../../scripts/import-vouchers"

/** A live Woo row (made-up terms), as in import.unit.spec.ts. */
const row = (code: string) => ({
  code,
  program: "import-woo",
  discount_type: "fixed_cart",
  value_zar: "50.00",
  min_spend_zar: "250.00",
  usage_limit: 1,
  usage_limit_per_user: null,
  usage_count: 0,
  ends_at: "2031-07-15T21:30:00Z",
})

let dir: string
let logSpy: jest.SpyInstance
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
const promotion = { listPromotions: jest.fn(async () => []), listCampaigns: jest.fn(async () => []) }
const container: any = {
  resolve: (k: string) => {
    if (k === ContainerRegistrationKeys.LOGGER) return logger
    if (k === Modules.PROMOTION) return promotion
    throw new Error(`unexpected resolve ${k}`)
  },
}

function writeRows(rows: unknown[]) {
  const file = path.join(dir, "rows.json")
  fs.writeFileSync(file, JSON.stringify(rows))
  process.env.VOUCHERS_IMPORT_FILE = file
}

function summary(): any {
  const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("VOUCHERS_IMPORT_SUMMARY "))
  return line ? JSON.parse(line.slice("VOUCHERS_IMPORT_SUMMARY ".length)) : null
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nkv-import-"))
  delete process.env.VOUCHERS_IMPORT_DRY_RUN
  for (const f of [logger.info, logger.warn, logger.error, updateCampaignsRun, findOrCreateCampaign, createVoucherPromotion]) f.mockReset()
  promotion.listCampaigns.mockReset()
  promotion.listCampaigns.mockResolvedValue([])
  logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined)
})
afterEach(() => {
  logSpy.mockRestore()
  fs.rmSync(dir, { recursive: true, force: true })
  delete process.env.VOUCHERS_IMPORT_FILE
})

describe("import-vouchers script", () => {
  it("a write failure after joining an open-ended campaign lists it as campaigns_open_ended in the failure log", async () => {
    writeRows([row("testwoo1"), row("testwoo2")])
    findOrCreateCampaign.mockResolvedValue({ id: "camp_open", ends_at: null })
    createVoucherPromotion.mockResolvedValueOnce({ id: "p1", code: "TESTWOO1" }).mockRejectedValueOnce(new Error("db down"))
    await expect(importVouchers({ container } as any)).rejects.toThrow("db down")
    const line = String(logger.error.mock.calls.map((c: any[]) => c[0]).find((l: string) => l.startsWith("vouchers.import failed ")))
    expect(JSON.parse(line.slice("vouchers.import failed ".length))).toEqual(
      expect.objectContaining({ created: 1, campaigns_extended: [], campaigns_open_ended: ["import-woo-2031-07-15"] })
    )
  })

  it("L1: never extends an existing open-ended campaign (ends_at null), matching the dry run", async () => {
    writeRows([row("testwoo1")])
    findOrCreateCampaign.mockResolvedValue({ id: "camp_open", ends_at: null })
    createVoucherPromotion.mockResolvedValue({ id: "p1", code: "TESTWOO1" })
    await importVouchers({ container } as any)
    expect(updateCampaignsRun).not.toHaveBeenCalled()
    expect(summary()).toEqual(expect.objectContaining({ created: 1, campaigns_extended: [] }))
  })

  it("warns, and lists in the summary, dated rows that join an existing open-ended campaign (real run)", async () => {
    writeRows([row("testwoo1")])
    findOrCreateCampaign.mockResolvedValue({ id: "camp_open", ends_at: null })
    createVoucherPromotion.mockResolvedValue({ id: "p1", code: "TESTWOO1" })
    await importVouchers({ container } as any)
    expect(logger.warn).toHaveBeenCalledWith(
      "vouchers.import warning: dated rows join an open-ended campaign, so they never expire " +
        JSON.stringify({ campaign: "import-woo-2031-07-15", rows_ends_at: "2031-07-15T21:30:00.000Z", codes: ["TESTWOO1"] })
    )
    expect(summary()).toEqual(expect.objectContaining({ campaigns_open_ended: ["import-woo-2031-07-15"] }))
  })

  it("warns about an open-ended campaign in the dry run too, writing nothing", async () => {
    writeRows([row("testwoo1")])
    process.env.VOUCHERS_IMPORT_DRY_RUN = "1"
    promotion.listCampaigns.mockResolvedValueOnce([{ id: "camp_open", ends_at: null }] as any)
    await importVouchers({ container } as any)
    expect(createVoucherPromotion).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("vouchers.import warning: dated rows join an open-ended campaign"))
    expect(summary()).toEqual(expect.objectContaining({ dry_run: true, campaigns_open_ended: ["import-woo-2031-07-15"], campaigns_extended: [] }))
  })

  it("still extends a campaign whose end is earlier than the latest row", async () => {
    writeRows([row("testwoo1")])
    findOrCreateCampaign.mockResolvedValue({ id: "camp_1", ends_at: new Date("2031-07-15T10:00:00Z") })
    createVoucherPromotion.mockResolvedValue({ id: "p1", code: "TESTWOO1" })
    await importVouchers({ container } as any)
    expect(updateCampaignsRun).toHaveBeenCalledWith({ input: { campaignsData: [{ id: "camp_1", ends_at: new Date("2031-07-15T21:30:00Z") }] } })
  })

  it("M5: a write failure mid-loop logs the created count and the failing code, then rethrows", async () => {
    writeRows([row("testwoo1"), row("testwoo2"), row("testwoo3")])
    findOrCreateCampaign.mockResolvedValue({ id: "camp_1", ends_at: new Date("2031-07-15T10:00:00Z") })
    createVoucherPromotion.mockResolvedValueOnce({ id: "p1", code: "TESTWOO1" }).mockRejectedValueOnce(new Error("db down"))
    await expect(importVouchers({ container } as any)).rejects.toThrow("db down")
    expect(createVoucherPromotion).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith(
      "vouchers.import failed " +
        JSON.stringify({
          created: 1,
          planned: 3,
          failed_campaign: "import-woo-2031-07-15",
          failed_code: "TESTWOO2",
          campaigns_extended: ["import-woo-2031-07-15"],
          campaigns_open_ended: [],
          message: "db down",
        })
    )
  })
})
