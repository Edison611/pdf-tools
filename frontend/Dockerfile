# syntax=docker/dockerfile:1

# ---- deps: install node_modules from the lockfile only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: produce .next/standalone ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next bakes rewrite destinations into the build, so the API origin is a
# build-time value. The default suits any setup where both containers share a
# network namespace (Cloud Run sidecars, compose `network_mode: service:api`).
# Override for plain bridge networking: --build-arg API_ORIGIN=http://api:8081
ARG API_ORIGIN=http://127.0.0.1:8081
ENV API_ORIGIN=$API_ORIGIN
# Requires `output: "standalone"` in next.config.ts, otherwise
# .next/standalone is never emitted and the runner stage below fails.
RUN npm run build

# ---- runner: minimal image, non-root ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# Cloud Run honors USER; running as non-root shrinks the attack surface.
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
