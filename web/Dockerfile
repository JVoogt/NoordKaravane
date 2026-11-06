# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
# TZ: the footer year is rendered at build time, so a New Year build must not be off by one.
ENV NODE_OPTIONS=--max-old-space-size=1536 ASTRO_TELEMETRY_DISABLED=1 TZ=Africa/Johannesburg
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Fail the image build on a type, test or guard failure (nothing else gates production).
RUN npm run check && npm test && npm run build && npm run guard:dist

FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html
