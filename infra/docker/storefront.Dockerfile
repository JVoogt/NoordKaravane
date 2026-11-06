# syntax=docker/dockerfile:1
# Astro 5 storefront, @astrojs/node standalone SSR. linux/arm64, built natively on DockPi.
# Build context: ../storefront ; additional context `config` = ../config (docker-compose.yml).
# Entry point assumed from the adapter's standalone mode: ./dist/server/entry.mjs
# PUBLIC_* are inlined at build time, so they are build args (and also passed as runtime env).

FROM node:22-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM node:22-alpine AS build
WORKDIR /src
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# business.json is read relative to the app dir as ../config/business.json
COPY --from=config business.json /config/business.json
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
    NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app
COPY --from=deps /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY --from=build /src/package.json ./package.json
COPY --from=config business.json /config/business.json
USER node
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
