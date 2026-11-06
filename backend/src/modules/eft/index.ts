import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import EftPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [EftPaymentProviderService],
})
