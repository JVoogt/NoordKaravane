import fs from "fs"
import os from "os"
import path from "path"

/** getBusinessConfig caches per module instance, so each case loads a fresh copy of the module. */
function load(): typeof import("../business") {
  let mod: typeof import("../business") | undefined
  jest.isolateModules(() => {
    mod = require("../business")
  })
  return mod!
}

describe("getBusinessConfig fallback logging", () => {
  const prevPath = process.env.BUSINESS_CONFIG_PATH
  let dir: string
  let warn: jest.SpyInstance
  let error: jest.SpyInstance

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nk-business-"))
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    error = jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
    if (prevPath === undefined) delete process.env.BUSINESS_CONFIG_PATH
    else process.env.BUSINESS_CONFIG_PATH = prevPath
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("logs an error naming the path when the file exists but is not valid JSON, and still returns the bundled config", () => {
    const p = path.join(dir, "business.json")
    fs.writeFileSync(p, '{ "brand": "NK", }')
    process.env.BUSINESS_CONFIG_PATH = p
    const cfg = load().getBusinessConfig()
    expect(cfg.brand).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toContain(p)
    expect(warn).not.toHaveBeenCalled()
  })

  it("logs an error when BUSINESS_CONFIG_PATH is set but the file is missing", () => {
    const p = path.join(dir, "missing.json")
    process.env.BUSINESS_CONFIG_PATH = p
    const cfg = load().getBusinessConfig()
    expect(cfg.brand).toBeTruthy()
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toContain(p)
  })

  it("only warns once when BUSINESS_CONFIG_PATH is unset and the default file is missing", () => {
    delete process.env.BUSINESS_CONFIG_PATH
    const cwd = path.join(dir, "backend")
    fs.mkdirSync(cwd)
    jest.spyOn(process, "cwd").mockReturnValue(cwd)
    const mod = load()
    mod.getBusinessConfig()
    mod.getBusinessConfig()
    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(path.join(dir, "config", "business.json"))
  })

  it("logs nothing when the file loads", () => {
    const p = path.join(dir, "business.json")
    fs.writeFileSync(p, JSON.stringify({ brand: "From file" }))
    process.env.BUSINESS_CONFIG_PATH = p
    expect(load().getBusinessConfig().brand).toBe("From file")
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})
