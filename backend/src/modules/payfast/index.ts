import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PayfastPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [PayfastPaymentProviderService],
})
