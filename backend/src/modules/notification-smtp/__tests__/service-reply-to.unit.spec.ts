const sendMail = jest.fn().mockResolvedValue({ messageId: "m1" })
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: () => ({ sendMail }) } }))

import SmtpNotificationProviderService from "../service"

const svc = () => new SmtpNotificationProviderService({ logger: console }, { host: "smtp.example.com" })
const staffData = { reference: "NK3", total: "R1 630,00", payment_method: "EFT" }

describe("SMTP provider reply-to", () => {
  beforeEach(() => sendMail.mockClear())

  it("uses data.reply_to when it looks like an email address", async () => {
    await svc().send({ to: "staff@example.com", channel: "email", template: "staff-new-order", data: { ...staffData, reply_to: "jan@example.com" } } as any)
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].replyTo).toBe("jan@example.com")
  })
  it("ignores a reply_to without an @", async () => {
    await svc().send({ to: "staff@example.com", channel: "email", template: "staff-new-order", data: { ...staffData, reply_to: "nope" } } as any)
    expect(sendMail.mock.calls[0][0].replyTo).not.toBe("nope")
  })
})
