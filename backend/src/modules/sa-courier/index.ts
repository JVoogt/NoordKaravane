import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import SaCourierFulfillmentService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [SaCourierFulfillmentService],
})
