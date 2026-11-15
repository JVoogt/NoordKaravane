import { moreText, windowText } from "../duration"

describe("windowText", () => {
  it("keeps 48 and other short windows in hours", () => {
    expect(windowText(48)).toBe("48 hours")
    expect(windowText(24)).toBe("24 hours")
    expect(windowText(1)).toBe("1 hour")
  })
  it("reads whole-day windows of three days or more as days", () => {
    expect(windowText(120)).toBe("5 days")
    expect(windowText(72)).toBe("3 days")
  })
  it("keeps a window that is not whole days in hours", () => {
    expect(windowText(100)).toBe("100 hours")
  })
})

describe("moreText", () => {
  it("reads two days or more as rounded days", () => {
    expect(moreText(96)).toBe("4 more days")
    expect(moreText(95)).toBe("4 more days")
    expect(moreText(48)).toBe("2 more days")
  })
  it("keeps less than two days in hours", () => {
    expect(moreText(24)).toBe("24 more hours")
    expect(moreText(1)).toBe("1 more hour")
  })
})
