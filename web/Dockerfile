# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
# TZ: the footer year is rendered at build time, so a New Year build must not be off by one.
ENV NODE_OPTIONS=--max-old-space-size=1536 ASTRO_TELEMETRY_DISABLED=1 TZ=Africa/Johannesburg
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Fail the image build on a type, test, guard or dist-integrity failure (nothing else gates production).
# verify reads dist/, src/data/legacy-hash-map.json and src/data/reviews.ts, all present in this stage (COPY . .).
RUN npm run check && npm test && npm run build && npm run guard:dist && npm run verify

FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html
# The nginx config is baked in (no bind mounts): docker/ is passed as the named build context "nkdocker"
# (compose: additional_contexts; by hand: docker build --build-context nkdocker=docker web).
COPY --from=nkdocker nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=nkdocker security-headers.conf /etc/nginx/snippets/security-headers.conf
# An invalid config fails the image BUILD, so it can never reach a running container or a later restart.
RUN nginx -t
