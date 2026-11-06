# syntax=docker/dockerfile:1
# Noord Karavane shop storefront (served under /shop): Astro 5 SSR (@astrojs/node standalone). Multi-stage, node:22-alpine, non-root, linux/arm64 safe
# (alpine images are multi-arch; no native modules are used). Built natively on DockPi:
#   DOCKER_API_VERSION=1.41 docker compose build storefront
# Build context: this directory (storefront/). business.json is NOT baked in: mount it at /config/business.json (read-only)
# or set BUSINESS_CONFIG_PATH. See README.md.

FROM node:22-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# PUBLIC_* are readable at runtime too (server side), but passing them here keeps client bundles consistent.
ARG PUBLIC_MEDUSA_URL
ARG PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG PUBLIC_SITE_URL
ARG PUBLIC_GA4_ID
ARG PUBLIC_META_PIXEL_ID
ARG PUBLIC_TURNSTILE_SITE_KEY
ENV PUBLIC_MEDUSA_URL=$PUBLIC_MEDUSA_URL \
    PUBLIC_MEDUSA_PUBLISHABLE_KEY=$PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    PUBLIC_SITE_URL=$PUBLIC_SITE_URL \
    PUBLIC_GA4_ID=$PUBLIC_GA4_ID \
    PUBLIC_META_PIXEL_ID=$PUBLIC_META_PIXEL_ID \
    PUBLIC_TURNSTILE_SITE_KEY=$PUBLIC_TURNSTILE_SITE_KEY \
    ASTRO_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 ASTRO_TELEMETRY_DISABLED=1 BUSINESS_CONFIG_PATH=/config/business.json
WORKDIR /app
COPY --from=deps --chown=node:node /src/node_modules ./node_modules
COPY --from=build --chown=node:node /src/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4321
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/shop/healthz >/dev/null || exit 1
CMD ["node", "./dist/server/entry.mjs"]
