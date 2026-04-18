# Multi-stage build for AdonisJS 6 service
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN node ace build --ignore-ts-errors || node ace build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
RUN cd build && npm ci --omit=dev --no-audit --no-fund || cd build && npm install --omit=dev --no-audit --no-fund
RUN apk add --no-cache curl
WORKDIR /app/build
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:3006/health || exit 1
EXPOSE 3006
CMD ["node", "bin/server.js"]
