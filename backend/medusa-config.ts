import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const payfastEnabled = process.env.PAYFAST_ENABLED === "true"
const redisUrl = process.env.REDIS_URL

const paymentProviders: any[] = [
  { resolve: "./src/modules/eft", id: "eft", options: {} },
]
if (payfastEnabled) {
  paymentProviders.push({
    resolve: "./src/modules/payfast",
    id: "payfast",
    options: {
      merchantId: process.env.PAYFAST_MERCHANT_ID,
      merchantKey: process.env.PAYFAST_MERCHANT_KEY,
      passphrase: process.env.PAYFAST_PASSPHRASE,
      sandbox: process.env.PAYFAST_SANDBOX !== "false",
      siteUrl: process.env.SITE_URL,
      backendUrl: process.env.MEDUSA_BACKEND_URL,
    },
  })
}

const modules: any[] = [
  {
    resolve: "@medusajs/medusa/payment",
    options: { providers: paymentProviders },
  },
  {
    resolve: "@medusajs/medusa/fulfillment",
    options: {
      providers: [
        // Keep the stock manual provider out; only our SA courier provider is offered.
        { resolve: "./src/modules/sa-courier", id: "sa-courier", options: {} },
      ],
    },
  },
  {
    resolve: "@medusajs/medusa/notification",
    options: {
      providers: [
        {
          resolve: "./src/modules/notification-smtp",
          id: "smtp",
          options: {
            channels: ["email"],
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            from: process.env.SMTP_FROM,
          },
        },
      ],
    },
  },
]

if (process.env.S3_BUCKET) {
  modules.push({
    resolve: "@medusajs/medusa/file",
    options: {
      providers: [
        {
          resolve: "@medusajs/medusa/file-s3",
          id: "s3",
          options: {
            file_url: process.env.S3_FILE_URL,
            access_key_id: process.env.S3_ACCESS_KEY_ID,
            secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
            region: process.env.S3_REGION || "auto",
            bucket: process.env.S3_BUCKET,
            endpoint: process.env.S3_ENDPOINT, // Cloudflare R2: https://<account>.r2.cloudflarestorage.com
            additional_client_config: { forcePathStyle: true },
          },
        },
      ],
    },
  })
}

if (redisUrl) {
  modules.push(
    { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
    { resolve: "@medusajs/medusa/cache-redis", options: { redisUrl } },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl } },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    }
  )
}

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:4321",
      adminCors: process.env.ADMIN_CORS || "http://localhost:9000",
      authCors: process.env.AUTH_CORS || "http://localhost:9000",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },
  modules,
})
