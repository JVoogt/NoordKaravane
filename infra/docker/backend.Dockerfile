# syntax=docker/dockerfile:1
# Medusa v2 backend (server, worker and migrate/seed all run this one image). linux/arm64, built natively on DockPi.
# Build context: ../backend (set in docker-compose.yml). Per Medusa's deployment docs, `medusa build` outputs a
# self-contained app to .medusa/server (admin bundle in public/admin); production deps are installed there.

FROM node:22-alpine AS build
WORKDIR /src
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# The admin SPA bakes its backend URL at build time (same-origin admin host, so it sits behind Cloudflare Access).
ARG ADMIN_BACKEND_URL=https://admin.noordkaravane.co.za
ENV MEDUSA_BACKEND_URL=${ADMIN_BACKEND_URL}
# the Pi has 16GB but ~7GB free; keep the Vite/tsc build bounded
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
# Runtime commands (server/worker/migrate/seed) are set by docker-compose.yml; MEDUSA_WORKER_MODE comes from env.
CMD ["npx", "medusa", "start"]
