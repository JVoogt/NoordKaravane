import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import nodemailer, { Transporter } from "nodemailer"
import { renderEmail } from "./templates"
import { brandByKey, getBusinessConfig } from "../../lib/business"
import { fromHeader } from "./from"

type Options = {
  host?: string
  port?: number
  user?: string
  pass?: string
  from?: string
}

/**
 * SMTP notification provider (channel "email"). Works with Brevo, Mailgun, any relay.
 * `template` is one of the names in ./templates.ts; `data` is the template payload.
 * Without SMTP_HOST it logs the email instead of sending (handy in local dev).
 */
class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "smtp"

  private options_: Options
  private transporter_: Transporter | null = null
  private logger_: any

  constructor(container: Record<string, any>, options: Options) {
    super()
    this.options_ = options ?? {}
    this.logger_ = container.logger ?? console
    if (this.options_.host) {
      const port = Number(this.options_.port || 587)
      this.transporter_ = nodemailer.createTransport({
        host: this.options_.host,
        port,
        secure: port === 465,
        auth: this.options_.user ? { user: this.options_.user, pass: this.options_.pass } : undefined,
      })
    }
  }

  static validateOptions(_options: Record<any, any>): void | never {}

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    if (!notification.to) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "SMTP notification needs a recipient")
    }
    const { subject, html, text } = renderEmail(notification.template, (notification.data ?? {}) as Record<string, any>)
    // Another brand (a Kampi order) keeps the authenticated address and shows its own display name.
    const from = notification.from || fromHeader(this.options_.from, brandByKey((notification.data as Record<string, any> | undefined)?.brand))

    if (!this.transporter_) {
      this.logger_.warn(`[smtp] SMTP_HOST not set; not sending "${subject}" to ${notification.to}`)
      return { id: `dry-run-${Date.now()}` }
    }
    // Staff alerts pass reply_to (the customer's email) so staff can reply straight to the customer.
    const replyTo = (notification.data as Record<string, any> | undefined)?.reply_to
    const info = await this.transporter_.sendMail({
      from,
      to: notification.to,
      subject,
      html,
      text,
      replyTo:
        typeof replyTo === "string" && replyTo.includes("@")
          ? replyTo
          : getBusinessConfig().email_general.includes("{{")
            ? undefined
            : getBusinessConfig().email_general,
    })
    return { id: info.messageId }
  }
}

export default SmtpNotificationProviderService
