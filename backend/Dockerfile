# syntax=docker/dockerfile:1.6
# ─── Lisan Backend (Express) ──────────────────────────────────────────────────
FROM node:22-alpine AS base

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /app

# Curl for HEALTHCHECK
RUN apk add --no-cache curl

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Run as non-root
RUN addgroup -S lisan && adduser -S lisan -G lisan \
    && chown -R lisan:lisan /app
USER lisan

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/server.js"]
