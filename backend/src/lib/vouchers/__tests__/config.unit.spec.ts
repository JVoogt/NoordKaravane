let fixture: any = {}
jest.mock("../../business", () => ({ ...jest.requireActual("../../business"), getBusinessConfig: () => fixture }))

import { getVoucherProgram, parseVoucherPrograms } from "../config"

const good = { value_zar: 50, min_spend_zar: 250, validity_days: 45, code_prefix: "TST", monthly_cap: 5, enabled: true }

describe("parseVoucherPrograms", () => {
  let errSpy: jest.SpyInstance
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => errSpy.mockRestore())

  it("parses a valid rolling and a valid fixed program", () => {
    const { programs, errors } = parseVoucherPrograms({
      "test-prog": good,
      "fixed-prog": { ...good, validity_days: undefined, ends_at: "2031-07-15T23:59:59+02:00" },
    })
    expect(errors).toEqual([])
    expect(programs["test-prog"]).toEqual({ name: "test-prog", ...good })
    expect(programs["fixed-prog"].ends_at).toBe("2031-07-15T23:59:59+02:00")
    expect(programs["fixed-prog"].validity_days).toBeUndefined()
  })

  it("returns nothing for a missing or non-object config, without throwing", () => {
    expect(parseVoucherPrograms(undefined)).toEqual({ programs: {}, errors: [] })
    expect(parseVoucherPrograms(null)).toEqual({ programs: {}, errors: [] })
    expect(parseVoucherPrograms("nope").programs).toEqual({})
  })

  it("drops a program with both validity_days and ends_at", () => {
    const r = parseVoucherPrograms({ both: { ...good, ends_at: "2031-07-15T23:59:59+02:00" } })
    expect(r.programs).toEqual({})
    expect(r.errors.join(" ")).toMatch(/both/)
  })

  it("drops a program with neither validity_days nor ends_at", () => {
    const { validity_days: _v, ...neither } = good
    const r = parseVoucherPrograms({ neither })
    expect(r.programs).toEqual({})
    expect(r.errors.join(" ")).toMatch(/neither/)
  })

  it("drops a bad prefix (lowercase, too long, underscore)", () => {
    for (const code_prefix of ["tst", "ABCDEFGHI", "A_B", ""]) {
      const r = parseVoucherPrograms({ p: { ...good, code_prefix } })
      expect(r.programs).toEqual({})
      expect(r.errors).toHaveLength(1)
      expect(r.errors[0]).toMatch(/^p: /)
    }
  })

  it("drops an ends_at without an offset", () => {
    const r = parseVoucherPrograms({ p: { ...good, validity_days: undefined, ends_at: "2031-07-15T23:59:59" } })
    expect(r.programs).toEqual({})
  })

  it("drops a bad program name and bad numbers", () => {
    expect(parseVoucherPrograms({ Bad_Name: good }).programs).toEqual({})
    expect(parseVoucherPrograms({ p: { ...good, value_zar: 0 } }).programs).toEqual({})
    expect(parseVoucherPrograms({ p: { ...good, min_spend_zar: 2.5 } }).programs).toEqual({})
    expect(parseVoucherPrograms({ p: { ...good, validity_days: 366 } }).programs).toEqual({})
    expect(parseVoucherPrograms({ p: { ...good, monthly_cap: 0 } }).programs).toEqual({})
    expect(parseVoucherPrograms({ p: { ...good, enabled: "yes" } }).programs).toEqual({})
  })

  it("keeps the valid programs when another one is invalid", () => {
    const r = parseVoucherPrograms({ ok: good, bad: { ...good, code_prefix: "x" } })
    expect(Object.keys(r.programs)).toEqual(["ok"])
    expect(r.errors).toHaveLength(1)
  })
})

describe("getVoucherProgram", () => {
  let errSpy: jest.SpyInstance
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => errSpy.mockRestore())

  it("returns an enabled program", () => {
    fixture = { voucher_programs: { "test-prog": good } }
    expect(getVoucherProgram("test-prog")).toEqual({ name: "test-prog", ...good })
  })

  it("returns null for a disabled, unknown or invalid program and logs the invalid one", () => {
    fixture = { voucher_programs: { off: { ...good, enabled: false }, bad: { ...good, code_prefix: "x" } } }
    expect(getVoucherProgram("off")).toBeNull()
    expect(getVoucherProgram("missing")).toBeNull()
    expect(getVoucherProgram("bad")).toBeNull()
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/voucher_programs.*bad/))
  })

  it("returns null when voucher_programs is absent", () => {
    fixture = {}
    expect(getVoucherProgram("test-prog")).toBeNull()
  })

  it("does not judge a fixed ends_at in the past (the service does)", () => {
    fixture = { voucher_programs: { old: { ...good, validity_days: undefined, ends_at: "2020-01-01T00:00:00+02:00" } } }
    expect(getVoucherProgram("old")?.ends_at).toBe("2020-01-01T00:00:00+02:00")
  })
})
