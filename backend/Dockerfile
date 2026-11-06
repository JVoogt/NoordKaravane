# syntax=docker/dockerfile:1
# Noord Karavane Medusa v2 backend. Multi-stage, node:22-alpine (multi-arch, built natively on the arm64 DockPi).
# `medusa build` emits a self-contained app in .medusa/server (admin SPA in public/admin); prod deps are installed there.
# One image runs server, worker, migrate and seed; the command and MEDUSA_WORKER_MODE are set at run time.

FROM node:22-alpine AS build
WORKDIR /src
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# The admin SPA bakes its backend URL at build time.
ARG ADMIN_BACKEND_URL=https://admin.noordkaravane.co.za
ENV MEDUSA_BACKEND_URL=${ADMIN_BACKEND_URL}
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /src/.medusa/server /app
RUN chown node:node /app
USER node
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:9000/health || exit 1
# Default: server (worker mode from MEDUSA_WORKER_MODE). Migrate: `npx medusa db:migrate`.
# Seed: `npx medusa exec ./src/scripts/seed.js`
CMD ["npx", "medusa", "start"]
