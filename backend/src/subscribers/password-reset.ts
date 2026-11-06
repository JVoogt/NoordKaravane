import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendEmail } from "../lib/orders"

// Medusa emits this from "Forgot password" on the admin login page (and POST /auth/user/emailpass/reset-password).
// Only admin users exist here; the storefront has no customer accounts.
export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<{ entity_id: string; token: string; actor_type: string }>) {
  if (data.actor_type !== "user") return
  const admin = (process.env.ADMIN_BACKEND_URL || process.env.MEDUSA_BACKEND_URL || "").replace(/\/$/, "")
  const reset_url = `${admin}/app/reset-password?token=${encodeURIComponent(data.token)}&email=${encodeURIComponent(data.entity_id)}`
  await sendEmail(container, data.entity_id, "password-reset", { reset_url })
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
