# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
ENV NODE_OPTIONS=--max-old-space-size=1536 ASTRO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html
